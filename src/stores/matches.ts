import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';

export interface SimpleMatch {
    id: string;
    type: 'VENDO' | 'BUSCO';
    otherUserId: string;
    otherUsername: string;
    otherLocation?: string;
    myCard?: any;
    otherCard?: any;
    otherPreference?: any;
    myPreference?: any;
    createdAt: Date;
    status?: 'nuevo' | 'visto' | 'activo' | 'eliminado';
    lifeExpiresAt?: Date;
    docId?: string;
}

const MATCH_LIFETIME_DAYS = 15;

const getExpirationDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
    return date;
};

/**
 * Factory: Create a clean, serializable match payload
 * Extracts only the fields we need from ANY match source
 */
function createCleanMatchPayload(match: SimpleMatch, overrides: any = {}) {
    // Helper to extract card fields
    const cleanCard = (card: any) => {
        if (!card) return null;
        return {
            scryfallId: card.scryfallId || '',
            name: card.name || '',
            edition: card.edition || '',
            quantity: card.quantity || 0,
            condition: card.condition || 'NM',
            foil: card.foil || false,
            price: typeof card.price === 'number' ? card.price : 0,
            image: card.image || '',
            status: card.status || 'collection',
        };
    };

    // Helper to extract preference fields
    const cleanPref = (pref: any) => {
        if (!pref) return null;
        return {
            scryfallId: pref.scryfallId || '',
            name: pref.name || '',
            type: pref.type || 'BUSCO',
            quantity: pref.quantity || 0,
            condition: pref.condition || 'NM',
            edition: pref.edition || '',
            image: pref.image || '',
        };
    };

    const payload: any = {
        id: match.id || '',
        type: match.type || 'BUSCO',
        otherUserId: match.otherUserId || '',
        otherUsername: match.otherUsername || '',
        otherLocation: match.otherLocation || '',
        status: match.status || 'nuevo',
        createdAt: match.createdAt instanceof Date ? match.createdAt : new Date(),
        lifeExpiresAt: match.lifeExpiresAt instanceof Date ? match.lifeExpiresAt : new Date(),
        myCard: cleanCard(match.myCard),
        otherCard: cleanCard(match.otherCard),
        myPreference: cleanPref(match.myPreference),
        otherPreference: cleanPref(match.otherPreference),
    };

    // Apply overrides
    return { ...payload, ...overrides };
}

export const useMatchesStore = defineStore('matches', () => {
    const newMatches = ref<SimpleMatch[]>([]);
    const savedMatches = ref<SimpleMatch[]>([]);
    const deletedMatches = ref<SimpleMatch[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    /**
     * Helper to safely convert any value to a Date
     */
    const toDate = (value: any): Date => {
        if (!value) return new Date();
        if (value instanceof Date) return value;
        if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
        if (typeof value === 'number') return new Date(value); // Unix timestamp
        if (typeof value === 'string') return new Date(value); // ISO string
        return new Date(); // fallback
    };

    /**
     * Helper to calculate expiration date (createdAt + 15 days)
     */
    const calculateExpirationDate = (createdAt: Date): Date => {
        const date = new Date(createdAt);
        date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
        return date;
    };

    /**
     * Convert Firestore document data to a clean SimpleMatch object
     */
    const parseFirestoreMatch = (docId: string, data: any): SimpleMatch => {
        const createdAt = toDate(data.createdAt);

        // If lifeExpiresAt is missing or invalid, calculate from createdAt + 15 days
        let lifeExpiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : null;
        if (!lifeExpiresAt || Number.isNaN(lifeExpiresAt.getTime())) {
            lifeExpiresAt = calculateExpirationDate(createdAt);
        }

        return {
            id: data.id || '',
            type: data.type || 'BUSCO',
            otherUserId: data.otherUserId || '',
            otherUsername: data.otherUsername || '',
            otherLocation: data.otherLocation,
            myCard: data.myCard,
            otherCard: data.otherCard,
            myPreference: data.myPreference,
            otherPreference: data.otherPreference,
            createdAt: createdAt,
            status: data.status,
            lifeExpiresAt: lifeExpiresAt,
            docId: docId,
        };
    };

    /**
     * Carga matches de las 3 colecciones y limpia expirados
     */
    const loadAllMatches = async () => {
        if (!authStore.user) return;

        loading.value = true;
        try {
            // Limpiar expirados antes de cargar
            await cleanExpiredMatches();

            // Cargar en paralelo
            const [newDocs, savedDocs, deletedDocs] = await Promise.all([
                getDocs(collection(db, 'users', authStore.user.id, 'matches_nuevos')),
                getDocs(collection(db, 'users', authStore.user.id, 'matches_guardados')),
                getDocs(collection(db, 'users', authStore.user.id, 'matches_eliminados')),
            ]);

            newMatches.value = newDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data()));
            savedMatches.value = savedDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data()));
            deletedMatches.value = deletedDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data()));
        } catch (error: any) {
            console.error('loadAllMatches error:', error);
            toastStore.show('Error al cargar matches', 'error');
        } finally {
            loading.value = false;
        }
    };

    /**
     * Limpia matches expirados de todas las colecciones
     */
    const cleanExpiredMatches = async () => {
        if (!authStore.user) return;

        try {
            const now = new Date();
            const allCollections = ['matches_nuevos', 'matches_guardados', 'matches_eliminados'];

            for (const colName of allCollections) {
                const colRef = collection(db, 'users', authStore.user.id, colName);
                const snapshot = await getDocs(colRef);

                for (const docSnap of snapshot.docs) {
                    const data = docSnap.data();
                    let expiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : null;

                    // If no lifeExpiresAt, calculate from createdAt
                    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
                        const createdAt = toDate(data.createdAt);
                        expiresAt = calculateExpirationDate(createdAt);
                    }

                    if (expiresAt && expiresAt <= now && !Number.isNaN(expiresAt.getTime())) {
                        await deleteDoc(docSnap.ref);
                    }
                }
            }
        } catch (error) {
            // silent fail
        }
    };

    /**
     * Guardar match (ME INTERESA) - mueve de nuevos a guardados
     */
    const saveMatch = async (match: SimpleMatch) => {
        if (!authStore.user) return false;

        try {
            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_guardados');
            const payload = createCleanMatchPayload(match, {
                status: 'activo',
                savedAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
            });

            const docRef = await addDoc(matchesRef, payload);

            // Eliminar de matches_nuevos si existe
            if (match.docId) {
                try {
                    await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', match.docId));
                } catch {
                    // silently ignore
                }
            }

            // Actualizar state local
            newMatches.value = newMatches.value.filter(m => m.docId !== match.docId);
            savedMatches.value.push({ ...match, docId: docRef.id, status: 'activo' });

            toastStore.show('Match guardado ✓', 'success');
            return true;
        } catch (error: any) {
            console.error('saveMatch error:', error);
            toastStore.show('Error al guardar match: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Descartar match - mueve de nuevos/guardados a eliminados
     */
    const discardMatch = async (matchId: string, tab: 'new' | 'saved') => {
        if (!authStore.user) return false;

        try {
            const source = tab === 'new' ? 'matches_nuevos' : 'matches_guardados';
            const match = tab === 'new'
                ? newMatches.value.find(m => m.docId === matchId)
                : savedMatches.value.find(m => m.docId === matchId);

            if (!match) {
                toastStore.show('Match no encontrado', 'error');
                return false;
            }

            // Create clean payload for eliminados
            const payload = createCleanMatchPayload(match, {
                status: 'eliminado',
                eliminatedAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
            });

            // Add to eliminados
            const deletedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const docRef = await addDoc(deletedRef, payload);

            // Delete from source
            await deleteDoc(doc(db, 'users', authStore.user.id, source, matchId));

            // Update local state
            if (tab === 'new') {
                newMatches.value = newMatches.value.filter(m => m.docId !== matchId);
            } else {
                savedMatches.value = savedMatches.value.filter(m => m.docId !== matchId);
            }
            deletedMatches.value.push({ ...match, docId: docRef.id, status: 'eliminado' });

            toastStore.show('Match eliminado. Se borrará en 15 días', 'info');
            return true;
        } catch (error: any) {
            console.error('discardMatch error:', error);
            toastStore.show('Error al eliminar match: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Completar match - lo elimina de guardados
     */
    const completeMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_guardados', matchId));
            savedMatches.value = savedMatches.value.filter(m => m.docId !== matchId);
            toastStore.show('Match completado ✓', 'success');
            return true;
        } catch (error: any) {
            console.error('completeMatch error:', error);
            toastStore.show('Error al completar match: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Recuperar match - mueve de eliminados a nuevos
     */
    const recoverMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const match = deletedMatches.value.find(m => m.docId === matchId);
            if (!match) return false;

            const payload = createCleanMatchPayload(match, {
                status: 'nuevo',
                createdAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
            });

            const newRef = collection(db, 'users', authStore.user.id, 'matches_nuevos');
            const docRef = await addDoc(newRef, payload);

            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_eliminados', matchId));

            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== matchId);
            newMatches.value.push({ ...match, docId: docRef.id, status: 'nuevo' });

            toastStore.show('Match recuperado', 'success');
            return true;
        } catch (error: any) {
            console.error('recoverMatch error:', error);
            toastStore.show('Error al recuperar match: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Eliminar permanentemente
     */
    const permanentDelete = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_eliminados', matchId));
            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== matchId);
            toastStore.show('Eliminado permanentemente', 'success');
            return true;
        } catch (error: any) {
            console.error('permanentDelete error:', error);
            toastStore.show('Error al eliminar: ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Marca match como "visto"
     */
    const markAsSeen = async (matchId: string) => {
        if (!authStore.user) return;

        try {
            await updateDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', matchId), {
                status: 'visto',
            });

            const match = newMatches.value.find(m => m.docId === matchId);
            if (match) match.status = 'visto';
        } catch (error) {
            // silent fail
        }
    };

    /**
     * Notificar al otro usuario
     */
    const notifyOtherUser = async (match: SimpleMatch, notificationType: 'INTERESADO' | 'MATCH_COMPLETADO') => {
        if (!authStore.user) return;

        try {
            if (notificationType === 'INTERESADO') {
                const recipientRef = collection(db, 'users', match.otherUserId, 'matches_nuevos');
                const payload = createCleanMatchPayload(match, {
                    id: `${match.otherUserId}_${authStore.user.id}_${match.id}`,
                    otherUserId: authStore.user.id,
                    otherUsername: authStore.user.username,
                    otherLocation: authStore.user.location,
                    status: 'nuevo',
                    createdAt: new Date(),
                    lifeExpiresAt: getExpirationDate(),
                    _notificationOf: match.id,
                });

                await addDoc(recipientRef, payload);
            }
        } catch (error) {
            // silent fail
        }
    };

    const getTotalByTab = (tab: 'new' | 'saved' | 'deleted') => {
        switch (tab) {
            case 'new': return newMatches.value.length;
            case 'saved': return savedMatches.value.length;
            case 'deleted': return deletedMatches.value.length;
        }
    };

    const getUnseenCount = () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return newMatches.value.filter(m => {
            const created = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
            return created > oneDayAgo && m.status === 'nuevo';
        }).length;
    };

    // Check if a match is already saved
    const isMatchSaved = (matchId: string): boolean => {
        return savedMatches.value.some(m => m.id === matchId);
    };

    return {
        newMatches,
        savedMatches,
        deletedMatches,
        loading,
        loadAllMatches,
        cleanExpiredMatches,
        saveMatch,
        discardMatch,
        completeMatch,
        recoverMatch,
        permanentDelete,
        markAsSeen,
        notifyOtherUser,
        getTotalByTab,
        getUnseenCount,
        isMatchSaved,
    };
});