import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    query,
    where,
    Timestamp
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

export const useMatchesStore = defineStore('matches', () => {
    const newMatches = ref<SimpleMatch[]>([]);
    const savedMatches = ref<SimpleMatch[]>([]);
    const deletedMatches = ref<SimpleMatch[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

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

            newMatches.value = newDocs.docs.map(doc => ({
                ...doc.data() as SimpleMatch,
                docId: doc.id,
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                lifeExpiresAt: doc.data().lifeExpiresAt?.toDate(),
                status: 'nuevo',
            }));

            savedMatches.value = savedDocs.docs.map(doc => ({
                ...doc.data() as SimpleMatch,
                docId: doc.id,
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                lifeExpiresAt: doc.data().lifeExpiresAt?.toDate(),
                status: 'activo',
            }));

            deletedMatches.value = deletedDocs.docs.map(doc => ({
                ...doc.data() as SimpleMatch,
                docId: doc.id,
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                lifeExpiresAt: doc.data().lifeExpiresAt?.toDate(),
                status: 'eliminado',
            }));
        } catch (error) {
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

                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    const expiresAt = data.lifeExpiresAt?.toDate();

                    if (expiresAt && expiresAt <= now) {
                        await deleteDoc(doc.ref);
                    }
                }
            }
        } catch (error) {
            // silent fail on cleanup
        }
    };

    /**
     * Guardar match (ME INTERESA) - mueve de nuevos a guardados
     */
    const saveMatch = async (match: SimpleMatch) => {
        if (!authStore.user) return false;

        try {
            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_guardados');

            const payload = {
                ...match,
                status: 'activo',
                savedAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
                docId: undefined,
            };

            const docRef = await addDoc(matchesRef, payload);

            // Eliminar de matches_nuevos si existe
            if (match.docId) {
                try {
                    const newRef = doc(db, 'users', authStore.user.id, 'matches_nuevos', match.docId);
                    await deleteDoc(newRef);
                } catch {
                    // silently ignore if doesn't exist
                }
            }

            // Notificar al otro usuario
            await notifyOtherUser(match, 'INTERESADO');

            // Actualizar state local
            newMatches.value = newMatches.value.filter(m => m.docId !== match.docId);
            savedMatches.value.push({
                ...match,
                docId: docRef.id,
                status: 'activo',
            });

            toastStore.show('Match guardado ✓', 'success');
            return true;
        } catch (error) {
            toastStore.show('Error al guardar match', 'error');
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

            if (!match) return false;

            // Agregar a eliminados
            const deletedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const payload = {
                ...match,
                status: 'eliminado',
                eliminatedAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
                docId: undefined,
            };

            const docRef = await addDoc(deletedRef, payload);

            // Eliminar de origen
            const sourceRef = doc(db, 'users', authStore.user.id, source, matchId);
            await deleteDoc(sourceRef);

            // Actualizar state local
            if (tab === 'new') {
                newMatches.value = newMatches.value.filter(m => m.docId !== matchId);
            } else {
                savedMatches.value = savedMatches.value.filter(m => m.docId !== matchId);
            }

            deletedMatches.value.push({
                ...match,
                docId: docRef.id,
                status: 'eliminado',
            });

            toastStore.show('Match eliminado. Se borrará en 15 días', 'info');
            return true;
        } catch (error) {
            toastStore.show('Error al eliminar match', 'error');
            return false;
        }
    };

    /**
     * Completar match - lo elimina de guardados (transacción con colección)
     */
    const completeMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const matchRef = doc(db, 'users', authStore.user.id, 'matches_guardados', matchId);
            await deleteDoc(matchRef);

            // Actualizar state local
            savedMatches.value = savedMatches.value.filter(m => m.docId !== matchId);

            toastStore.show('Match completado ✓', 'success');
            return true;
        } catch (error) {
            toastStore.show('Error al completar match', 'error');
            return false;
        }
    };

    /**
     * Recuperar match - mueve de eliminados a nuevos con countdown reseteado
     */
    const recoverMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const match = deletedMatches.value.find(m => m.docId === matchId);
            if (!match) return false;

            // Agregar a matches_nuevos
            const newRef = collection(db, 'users', authStore.user.id, 'matches_nuevos');
            const payload = {
                ...match,
                status: 'nuevo',
                createdAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
                docId: undefined,
            };

            const docRef = await addDoc(newRef, payload);

            // Eliminar de eliminados
            const deletedRef = doc(db, 'users', authStore.user.id, 'matches_eliminados', matchId);
            await deleteDoc(deletedRef);

            // Actualizar state local
            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== matchId);
            newMatches.value.push({
                ...match,
                docId: docRef.id,
                status: 'nuevo',
            });

            toastStore.show('Match recuperado', 'success');
            return true;
        } catch (error) {
            toastStore.show('Error al recuperar match', 'error');
            return false;
        }
    };

    /**
     * Eliminar permanentemente - borra de eliminados
     */
    const permanentDelete = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const deletedRef = doc(db, 'users', authStore.user.id, 'matches_eliminados', matchId);
            await deleteDoc(deletedRef);

            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== matchId);

            toastStore.show('Eliminado permanentemente', 'success');
            return true;
        } catch (error) {
            toastStore.show('Error al eliminar', 'error');
            return false;
        }
    };

    /**
     * Marca match como "visto" (solo para nuevos)
     */
    const markAsSeen = async (matchId: string) => {
        if (!authStore.user) return;

        try {
            const matchRef = doc(db, 'users', authStore.user.id, 'matches_nuevos', matchId);
            await updateDoc(matchRef, { status: 'visto' });

            // Actualizar state local
            const match = newMatches.value.find(m => m.docId === matchId);
            if (match) {
                match.status = 'visto';
            }
        } catch (error) {
            // silent fail
        }
    };

    /**
     * Notificar al otro usuario que alguien le interesa
     */
    const notifyOtherUser = async (match: SimpleMatch, notificationType: 'INTERESADO' | 'MATCH_COMPLETADO') => {
        if (!authStore.user) return;

        try {
            // Crear synthetic match en matches_nuevos del otro usuario
            if (notificationType === 'INTERESADO') {
                const recipientRef = collection(db, 'users', match.otherUserId, 'matches_nuevos');

                // Crear inverso del match
                const inverseMatch = {
                    ...match,
                    id: `${match.otherUserId}_${authStore.user.id}_${match.id}`,
                    otherUserId: authStore.user.id,
                    otherUsername: authStore.user.username,
                    otherLocation: authStore.user.location,
                    status: 'nuevo',
                    createdAt: new Date(),
                    lifeExpiresAt: getExpirationDate(),
                    // swap cards/preferences if needed
                    _notificationOf: match.id,
                };

                await addDoc(recipientRef, inverseMatch);
            }
        } catch (error) {
            // silent fail - no afecta flujo principal
        }
    };

    /**
     * Helper: obtener total de matches por tab
     */
    const getTotalByTab = (tab: 'new' | 'saved' | 'deleted') => {
        switch (tab) {
            case 'new': return newMatches.value.length;
            case 'saved': return savedMatches.value.length;
            case 'deleted': return deletedMatches.value.length;
        }
    };

    /**
     * Helper: obtener matches nuevos sin leer (últimas 24h)
     */
    const getUnseenCount = () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return newMatches.value.filter(m => {
            const created = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
            return created > oneDayAgo && m.status === 'nuevo';
        }).length;
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
    };
});