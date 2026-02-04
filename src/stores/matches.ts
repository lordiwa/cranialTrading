import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    or,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { t } from '../composables/useI18n';

export interface SimpleMatch {
    id: string;
    type: 'VENDO' | 'BUSCO';
    otherUserId: string;
    otherUsername: string;
    otherLocation?: string;
    otherEmail?: string;
    otherAvatarUrl?: string | null;
    myCard?: any;
    otherCard?: any;
    otherPreference?: any;
    myPreference?: any;
    // MatchCard.vue format (arrays + totals)
    myCards?: any[];
    otherCards?: any[];
    myTotalValue?: number;
    theirTotalValue?: number;
    valueDifference?: number;
    compatibility?: number;
    createdAt: Date;
    status?: 'nuevo' | 'visto' | 'activo' | 'eliminado';
    lifeExpiresAt?: Date;
    docId?: string;
    // Shared match fields
    isSharedMatch?: boolean;
    isSender?: boolean;
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
        otherAvatarUrl: match.otherAvatarUrl || null,
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
    const newMatches = ref<SimpleMatch[]>([]);      // Received from others
    const sentMatches = ref<SimpleMatch[]>([]);     // Sent by me (ME INTERESA)
    const savedMatches = ref<SimpleMatch[]>([]);    // Manually saved + sent (combined view)
    const deletedMatches = ref<SimpleMatch[]>([]);
    const sharedMatches = ref<SimpleMatch[]>([]); // Matches from profile interest
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
            otherEmail: data.otherEmail,
            otherAvatarUrl: data.otherAvatarUrl || null,
            myCard: data.myCard,
            otherCard: data.otherCard,
            myPreference: data.myPreference,
            otherPreference: data.otherPreference,
            // Support for MatchCard.vue format (arrays + totals)
            myCards: data.myCards || [],
            otherCards: data.otherCards || [],
            myTotalValue: data.myTotalValue ?? 0,
            theirTotalValue: data.theirTotalValue ?? 0,
            valueDifference: data.valueDifference ?? 0,
            compatibility: data.compatibility ?? 0,
            createdAt,
            status: data.status,
            lifeExpiresAt,
            docId,
        };
    };

    /**
     * Convert shared match to SimpleMatch format for MatchCard.vue
     */
    const parseSharedMatch = (docId: string, data: any, currentUserId: string): SimpleMatch => {
        const createdAt = toDate(data.createdAt);
        const lifeExpiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : calculateExpirationDate(createdAt);

        const isSender = data.senderId === currentUserId;
        const card = data.card || {};
        const cardPrice = card.price || 0;
        const totalValue = cardPrice * (card.quantity || 1);

        return {
            id: docId,
            docId,
            type: data.cardType === 'sale' ? (isSender ? 'BUSCO' : 'VENDO') : 'BUSCO',
            otherUserId: isSender ? data.receiverId : data.senderId,
            otherUsername: isSender ? data.receiverUsername : data.senderUsername,
            otherLocation: isSender ? data.receiverLocation : data.senderLocation,
            otherEmail: isSender ? '' : data.senderEmail,
            otherAvatarUrl: isSender ? data.receiverAvatarUrl : data.senderAvatarUrl,
            // For sender: they want the card (otherCards), for receiver: it's their card (myCards)
            myCards: isSender ? [] : [card],
            otherCards: isSender ? [card] : [],
            myTotalValue: isSender ? 0 : totalValue,
            theirTotalValue: isSender ? totalValue : 0,
            valueDifference: isSender ? totalValue : -totalValue,
            compatibility: 100,
            status: isSender ? 'activo' : 'nuevo',
            createdAt,
            lifeExpiresAt,
            // Extra fields for shared match handling
            isSharedMatch: true,
            isSender,
        } as SimpleMatch;
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

            // Query shared matches where user is sender or receiver
            const sharedMatchesRef = collection(db, 'shared_matches');
            const sharedQuery = query(
                sharedMatchesRef,
                or(
                    where('senderId', '==', authStore.user.id),
                    where('receiverId', '==', authStore.user.id)
                )
            );

            // Cargar en paralelo
            const [newDocs, savedDocs, deletedDocs, sharedDocs] = await Promise.all([
                getDocs(collection(db, 'users', authStore.user.id, 'matches_nuevos')),
                getDocs(collection(db, 'users', authStore.user.id, 'matches_guardados')),
                getDocs(collection(db, 'users', authStore.user.id, 'matches_eliminados')),
                getDocs(sharedQuery),
            ]);

            // Parse shared matches and separate by role
            const parsedShared = sharedDocs.docs.map(doc =>
                parseSharedMatch(doc.id, doc.data(), authStore.user!.id)
            );

            // Shared matches: sender sees in sent, receiver sees in new
            const sharedForNew = parsedShared.filter(m => !m.isSender);
            const sharedForSent = parsedShared.filter(m => m.isSender);

            // Parse saved matches from Firestore
            const savedFromFirestore = savedDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data()));

            // NUEVOS: received from others (not sent by me)
            newMatches.value = [
                ...newDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data())),
                ...sharedForNew,
            ];

            // ENVIADOS: matches I sent via "ME INTERESA"
            sentMatches.value = sharedForSent;

            // GUARDADOS: manually saved + sent matches (combined view)
            savedMatches.value = [
                ...savedFromFirestore,
                ...sharedForSent,
            ];

            deletedMatches.value = deletedDocs.docs.map(doc => parseFirestoreMatch(doc.id, doc.data()));
            sharedMatches.value = parsedShared;
        } catch (error: any) {
            console.error('loadAllMatches error:', error);
            toastStore.show(t('matches.messages.loadError'), 'error');
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
        } catch {
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

            toastStore.show(t('matches.messages.saved'), 'success');
            return true;
        } catch (error: any) {
            console.error('saveMatch error:', error);
            toastStore.show(t('matches.messages.saveError') + ': ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Descartar match - mueve de nuevos/guardados a eliminados
     * Handles both regular matches (in user subcollections) and shared matches (root collection)
     */
    const discardMatch = async (matchId: string, tab: 'new' | 'saved') => {
        if (!authStore.user) return false;

        try {
            // Search by both docId and id for compatibility
            const match = tab === 'new'
                ? newMatches.value.find(m => m.docId === matchId || m.id === matchId)
                : savedMatches.value.find(m => m.docId === matchId || m.id === matchId);

            if (!match) {
                toastStore.show(t('matches.messages.notFound'), 'error');
                return false;
            }

            // Use docId for Firestore operations
            const firestoreDocId = match.docId || matchId;

            // Create clean payload for eliminados
            const payload = createCleanMatchPayload(match, {
                status: 'eliminado',
                eliminatedAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
            });

            // Add to eliminados
            const deletedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const docRef = await addDoc(deletedRef, payload);

            // Delete from source - handle shared matches differently
            if (match.isSharedMatch) {
                // Shared matches are in root-level shared_matches collection
                await deleteDoc(doc(db, 'shared_matches', firestoreDocId));
            } else {
                // Regular matches are in user subcollections
                const source = tab === 'new' ? 'matches_nuevos' : 'matches_guardados';
                await deleteDoc(doc(db, 'users', authStore.user.id, source, firestoreDocId));
            }

            // Update local state - filter by both docId and id
            if (tab === 'new') {
                newMatches.value = newMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            } else {
                savedMatches.value = savedMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            }
            // Also remove from sharedMatches if applicable
            if (match.isSharedMatch) {
                sharedMatches.value = sharedMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            }
            deletedMatches.value.push({ ...match, docId: docRef.id, status: 'eliminado' });

            toastStore.show(t('matches.messages.deleted'), 'info');
            return true;
        } catch (error: any) {
            console.error('discardMatch error:', error);
            toastStore.show(t('matches.messages.deleteError') + ': ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Completar match - lo elimina de guardados
     */
    const completeMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const match = savedMatches.value.find(m => m.docId === matchId || m.id === matchId);
            const firestoreDocId = match?.docId || matchId;

            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_guardados', firestoreDocId));
            savedMatches.value = savedMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            toastStore.show(t('matches.messages.completed'), 'success');
            return true;
        } catch (error: any) {
            console.error('completeMatch error:', error);
            toastStore.show(t('matches.messages.completeError') + ': ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Recuperar match - mueve de eliminados a nuevos
     */
    const recoverMatch = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const match = deletedMatches.value.find(m => m.docId === matchId || m.id === matchId);
            if (!match) return false;

            const firestoreDocId = match.docId || matchId;

            const payload = createCleanMatchPayload(match, {
                status: 'nuevo',
                createdAt: new Date(),
                lifeExpiresAt: getExpirationDate(),
            });

            const newRef = collection(db, 'users', authStore.user.id, 'matches_nuevos');
            const docRef = await addDoc(newRef, payload);

            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_eliminados', firestoreDocId));

            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            newMatches.value.push({ ...match, docId: docRef.id, status: 'nuevo' });

            toastStore.show(t('matches.messages.recovered'), 'success');
            return true;
        } catch (error: any) {
            console.error('recoverMatch error:', error);
            toastStore.show(t('matches.messages.recoverError') + ': ' + error.message, 'error');
            return false;
        }
    };

    /**
     * Eliminar permanentemente
     */
    const permanentDelete = async (matchId: string) => {
        if (!authStore.user) return false;

        try {
            const match = deletedMatches.value.find(m => m.docId === matchId || m.id === matchId);
            const firestoreDocId = match?.docId || matchId;

            await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_eliminados', firestoreDocId));
            deletedMatches.value = deletedMatches.value.filter(m => m.docId !== firestoreDocId && m.id !== matchId);
            toastStore.show(t('matches.messages.permanentlyDeleted'), 'success');
            return true;
        } catch (error: any) {
            console.error('permanentDelete error:', error);
            toastStore.show(t('matches.messages.permanentDeleteError') + ': ' + error.message, 'error');
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
        } catch {
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
                    otherAvatarUrl: authStore.user.avatarUrl || null,
                    status: 'nuevo',
                    createdAt: new Date(),
                    lifeExpiresAt: getExpirationDate(),
                    _notificationOf: match.id,
                });

                await addDoc(recipientRef, payload);
            }
        } catch {
            // silent fail
        }
    };

    const getTotalByTab = (tab: 'new' | 'sent' | 'saved' | 'deleted') => {
        switch (tab) {
            case 'new': return newMatches.value.length;
            case 'sent': return sentMatches.value.length;
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

    /**
     * Delete all matches for current user
     */
    const deleteAllMatches = async (): Promise<boolean> => {
        if (!authStore.user?.id) return false;

        try {
            // Delete from user's sent_matches
            const sentRef = collection(db, 'users', authStore.user.id, 'sent_matches');
            const sentSnapshot = await getDocs(sentRef);
            await Promise.all(sentSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', authStore.user!.id, 'sent_matches', docSnap.id))));

            // Delete from user's saved_matches
            const savedRef = collection(db, 'users', authStore.user.id, 'saved_matches');
            const savedSnapshot = await getDocs(savedRef);
            await Promise.all(savedSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', authStore.user!.id, 'saved_matches', docSnap.id))));

            // Delete from user's discarded_matches
            const discardedRef = collection(db, 'users', authStore.user.id, 'discarded_matches');
            const discardedSnapshot = await getDocs(discardedRef);
            await Promise.all(discardedSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', authStore.user!.id, 'discarded_matches', docSnap.id))));

            // Clear local state
            newMatches.value = [];
            sentMatches.value = [];
            savedMatches.value = [];
            deletedMatches.value = [];
            sharedMatches.value = [];

            return true;
        } catch (error) {
            console.error('Error deleting all matches:', error);
            return false;
        }
    };

    /**
     * Clean up duplicate shared_matches for current user
     * Keeps only one match per sender+receiver+scryfallId+edition combination
     */
    const cleanupDuplicateMatches = async () => {
        if (!authStore.user) return 0;

        try {
            const sharedMatchesRef = collection(db, 'shared_matches');
            const userQuery = query(
                sharedMatchesRef,
                or(
                    where('senderId', '==', authStore.user.id),
                    where('receiverId', '==', authStore.user.id)
                )
            );
            const snapshot = await getDocs(userQuery);

            // Group by unique key: senderId_receiverId_scryfallId_edition
            const groups = new Map<string, { docId: string; createdAt: Date }[]>();

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const key = `${data.senderId}_${data.receiverId}_${data.card?.scryfallId || ''}_${data.card?.edition || ''}`;

                if (!groups.has(key)) {
                    groups.set(key, []);
                }
                groups.get(key)!.push({
                    docId: docSnap.id,
                    createdAt: data.createdAt?.toDate?.() || new Date(0)
                });
            }

            // Delete duplicates, keeping the oldest one
            let deletedCount = 0;
            for (const [_key, matches] of groups) {
                if (matches.length > 1) {
                    // Sort by date, keep oldest
                    matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                    // Delete all but the first (oldest)
                    for (let i = 1; i < matches.length; i++) {
                        const matchToDelete = matches[i];
                        if (matchToDelete) {
                            await deleteDoc(doc(db, 'shared_matches', matchToDelete.docId));
                            deletedCount++;
                        }
                    }
                }
            }

            console.log(`[cleanupDuplicateMatches] Deleted ${deletedCount} duplicate matches`);
            return deletedCount;
        } catch (error) {
            console.error('Error cleaning up duplicate matches:', error);
            return 0;
        }
    };

    return {
        newMatches,
        sentMatches,
        savedMatches,
        deletedMatches,
        sharedMatches,
        loading,
        loadAllMatches,
        cleanExpiredMatches,
        saveMatch,
        discardMatch,
        completeMatch,
        recoverMatch,
        permanentDelete,
        deleteAllMatches,
        markAsSeen,
        notifyOtherUser,
        getTotalByTab,
        getUnseenCount,
        isMatchSaved,
        cleanupDuplicateMatches,
    };
});