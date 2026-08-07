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
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { t } from '../composables/useI18n';
import { getMatchExpirationDate } from '../utils/matchExpiry';
import { dedupeMatchesByIdentity, matchIdentityKey } from '../utils/matchDedup';
import { logSanitizedError } from '../utils/logSanitizedError';

export interface MatchCard {
    scryfallId: string;
    name: string;
    edition: string;
    quantity: number;
    condition: string;
    foil: boolean;
    price: number;
    image: string;
    status: string;
}

export interface MatchPreference {
    scryfallId: string;
    name: string;
    type: string;
    quantity: number;
    condition: string;
    edition: string;
    image: string;
}

export interface SimpleMatch {
    id: string;
    type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL';
    otherUserId: string;
    otherUsername: string;
    otherLocation?: string;
    otherEmail?: string;
    otherAvatarUrl?: string | null;
    myCard?: MatchCard | null;
    otherCard?: MatchCard | null;
    otherPreference?: MatchPreference | null;
    myPreference?: MatchPreference | null;
    // MatchCard.vue format (arrays + totals)
    myCards?: MatchCard[];
    otherCards?: MatchCard[];
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

interface FirestoreMatchData {
    id?: string;
    type?: string;
    otherUserId?: string;
    otherUsername?: string;
    otherLocation?: string;
    otherEmail?: string;
    otherAvatarUrl?: string | null;
    myCard?: MatchCard | null;
    otherCard?: MatchCard | null;
    myPreference?: MatchPreference | null;
    otherPreference?: MatchPreference | null;
    myCards?: MatchCard[];
    otherCards?: MatchCard[];
    myTotalValue?: number;
    theirTotalValue?: number;
    valueDifference?: number;
    compatibility?: number;
    status?: string;
    createdAt?: unknown;
    lifeExpiresAt?: unknown;
}

interface SharedMatchData extends FirestoreMatchData {
    senderId?: string;
    receiverId?: string;
    senderUsername?: string;
    receiverUsername?: string;
    senderLocation?: string;
    receiverLocation?: string;
    senderEmail?: string;
    senderAvatarUrl?: string | null;
    receiverAvatarUrl?: string | null;
    card?: MatchCard;
    cardType?: string;
}

/**
 * Factory: Create a clean, serializable match payload
 * Extracts only the fields we need from ANY match source
 */
function createCleanMatchPayload(match: SimpleMatch, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    // Helper to extract card fields
    const cleanCard = (card: MatchCard | null | undefined): MatchCard | null => {
        if (!card) return null;
        return {
            scryfallId: card.scryfallId ?? '',
            name: card.name ?? '',
            edition: card.edition ?? '',
            quantity: card.quantity ?? 0,
            condition: card.condition ?? 'NM',
            foil: card.foil ?? false,
            price: typeof card.price === 'number' ? card.price : 0,
            image: card.image ?? '',
            status: card.status ?? 'collection',
        };
    };

    // Helper to extract preference fields
    const cleanPref = (pref: MatchPreference | null | undefined): MatchPreference | null => {
        if (!pref) return null;
        return {
            scryfallId: pref.scryfallId ?? '',
            name: pref.name ?? '',
            type: pref.type ?? 'BUSCO',
            quantity: pref.quantity ?? 0,
            condition: pref.condition ?? 'NM',
            edition: pref.edition ?? '',
            image: pref.image ?? '',
        };
    };

    const payload: Record<string, unknown> = {
        id: match.id || '',
        type: match.type || 'BUSCO',
        otherUserId: match.otherUserId || '',
        otherUsername: match.otherUsername || '',
        otherLocation: match.otherLocation ?? '',
        otherAvatarUrl: match.otherAvatarUrl ?? null,
        status: match.status ?? 'nuevo',
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
    const toDate = (value: unknown): Date => {
        if (!value) return new Date();
        if (value instanceof Date) return value;
        if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
            return (value as { toDate: () => Date }).toDate(); // Firestore Timestamp
        }
        if (typeof value === 'number') return new Date(value); // Unix timestamp
        if (typeof value === 'string') return new Date(value); // ISO string
        return new Date(); // fallback
    };

    /**
     * Convert Firestore document data to a clean SimpleMatch object
     */
    const parseFirestoreMatch = (docId: string, rawData: Record<string, unknown>): SimpleMatch => {
        const data = rawData as unknown as FirestoreMatchData;
        const createdAt = toDate(data.createdAt);

        // If lifeExpiresAt is missing or invalid, calculate from createdAt + 15 days
        let lifeExpiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : null;
        if (!lifeExpiresAt || Number.isNaN(lifeExpiresAt.getTime())) {
            lifeExpiresAt = getMatchExpirationDate(createdAt);
        }

        return {
            id: data.id ?? '',
            type: (data.type as SimpleMatch['type']) ?? 'BUSCO',
            otherUserId: data.otherUserId ?? '',
            otherUsername: data.otherUsername ?? '',
            otherLocation: data.otherLocation,
            otherEmail: data.otherEmail,
            otherAvatarUrl: data.otherAvatarUrl ?? null,
            myCard: data.myCard,
            otherCard: data.otherCard,
            myPreference: data.myPreference,
            otherPreference: data.otherPreference,
            // Support for MatchCard.vue format (arrays + totals)
            myCards: data.myCards ?? [],
            otherCards: data.otherCards ?? [],
            myTotalValue: data.myTotalValue ?? 0,
            theirTotalValue: data.theirTotalValue ?? 0,
            valueDifference: data.valueDifference ?? 0,
            compatibility: data.compatibility ?? 0,
            createdAt,
            status: data.status as SimpleMatch['status'],
            lifeExpiresAt,
            docId,
        };
    };

    /**
     * Convert shared match to SimpleMatch format for MatchCard.vue
     */
    const parseSharedMatch = (docId: string, rawData: Record<string, unknown>, currentUserId: string): SimpleMatch => {
        const data = rawData as unknown as SharedMatchData;
        const createdAt = toDate(data.createdAt);
        const lifeExpiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : getMatchExpirationDate(createdAt);

        const isSender = data.senderId === currentUserId;
        const card: MatchCard = data.card ?? { scryfallId: '', name: '', edition: '', quantity: 0, condition: 'NM', foil: false, price: 0, image: '', status: 'collection' };
        const cardPrice = card.price || 0;
        const totalValue = cardPrice * (card.quantity || 1);

        return {
            id: docId,
            docId,
            type: (data.cardType === 'sale' && !isSender) ? 'VENDO' : 'BUSCO',
            otherUserId: isSender ? (data.receiverId ?? '') : (data.senderId ?? ''),
            otherUsername: isSender ? (data.receiverUsername ?? '') : (data.senderUsername ?? ''),
            otherLocation: isSender ? (data.receiverLocation ?? '') : (data.senderLocation ?? ''),
            otherEmail: isSender ? '' : (data.senderEmail ?? ''),
            otherAvatarUrl: isSender ? (data.receiverAvatarUrl ?? null) : (data.senderAvatarUrl ?? null),
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
        };
    };

    /**
     * Promesa en vuelo compartida (perf, reporte 2026-08-07).
     *
     * En el landing autenticado esto se llamaba 2-3 veces a la vez: initView de
     * SavedMatchesView, el MatchNotificationsDropdown del header al montarse, y la
     * recarga posterior al recalculo. Cada llamante concurrente pagaba las lecturas
     * completas por su cuenta (medido: 18 getDocs para 3 llamantes contra 6 para
     * uno). Mientras haya una carga en curso, todos comparten su promesa; una vez
     * que se resuelve el memo se limpia, asi que un llamante posterior si relee.
     */
    let _loadAllInFlight: Promise<void> | null = null;

    /**
     * Carga matches de las 3 colecciones y limpia expirados
     */
    const loadAllMatches = (): Promise<void> => {
        if (!authStore.user) return Promise.resolve();
        if (_loadAllInFlight) return _loadAllInFlight;

        // Se limpia SIEMPRE al terminar, exito o error — un memo pegado dejaria al
        // usuario sin matches hasta recargar la pagina entera.
        _loadAllInFlight = _loadAllMatches().finally(() => {
            _loadAllInFlight = null;
        });
        return _loadAllInFlight;
    };

    const _loadAllMatches = async () => {
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
            const userId = authStore.user.id;
            const parsedShared = sharedDocs.docs.map(d =>
                parseSharedMatch(d.id, d.data() as Record<string, unknown>, userId)
            );

            // Shared matches: sender sees in sent, receiver sees in new
            const sharedForNew = parsedShared.filter(m => !m.isSender);
            const sharedForSent = parsedShared.filter(m => m.isSender);

            // Parse saved matches from Firestore
            const savedFromFirestore = savedDocs.docs.map(d => parseFirestoreMatch(d.id, d.data() as Record<string, unknown>));

            // NUEVOS: received from others (not sent by me)
            // Deduplicate: calculated matches (matches_nuevos) keep only the latest per otherUserId,
            // shared matches (from "Me Interesa") are unique by docId and kept as-is
            const parsedNewDocs = newDocs.docs.map(d => parseFirestoreMatch(d.id, d.data() as Record<string, unknown>));
            const seenUserIds = new Set<string>();
            const dedupedNewDocs = parsedNewDocs.filter(m => {
                const key = m.otherUserId;
                if (seenUserIds.has(key)) return false;
                seenUserIds.add(key);
                return true;
            });
            // SCRUM-71.3: dedup semántico (persona + cartas) sobre el array combinado,
            // para que un mismo match no aparezca repetido aunque venga de dos fuentes.
            newMatches.value = dedupeMatchesByIdentity([
                ...dedupedNewDocs,
                ...sharedForNew,
            ]);

            // ENVIADOS: matches I sent via "ME INTERESA"
            sentMatches.value = sharedForSent;

            // GUARDADOS: manually saved + sent matches (combined view)
            savedMatches.value = dedupeMatchesByIdentity([
                ...savedFromFirestore,
                ...sharedForSent,
            ]);

            deletedMatches.value = deletedDocs.docs.map(d => parseFirestoreMatch(d.id, d.data() as Record<string, unknown>));
            sharedMatches.value = parsedShared;
        } catch (error: unknown) {
            logSanitizedError('loadAllMatches error', error);
            toastStore.show(t('matches.messages.loadError'), 'error');
        } finally {
            loading.value = false;
        }
    };

    /**
     * Limpia matches expirados de todas las colecciones
     */
    /** Resolve the effective expiration date for a match document */
    const resolveExpirationDate = (data: FirestoreMatchData): Date | null => {
        const expiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : null;
        if (expiresAt && !Number.isNaN(expiresAt.getTime())) return expiresAt;
        const createdAt = toDate(data.createdAt);
        const fallback = getMatchExpirationDate(createdAt);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    };

    /** Check if a match document is expired */
    const isMatchExpired = (data: FirestoreMatchData, now: Date): boolean => {
        const expiresAt = resolveExpirationDate(data);
        return expiresAt !== null && expiresAt <= now;
    };

    const cleanExpiredMatches = async () => {
        if (!authStore.user) return;

        const userId = authStore.user.id;
        try {
            const now = new Date();
            // SCRUM-71.2: 'matches_eliminados' se excluye a propósito. Sus docs son
            // registros de descarte/bloqueo y NO deben expirar — si se limpiaran por
            // expiración (15 días), la persona dejaría de estar filtrada y el match
            // descartado reaparecería en el siguiente recálculo.
            const allCollections = ['matches_nuevos', 'matches_guardados'];

            const snapshots = await Promise.all(
                allCollections.map(colName =>
                    getDocs(collection(db, 'users', userId, colName))
                )
            );

            const expiredRefs = snapshots
                .flatMap(snapshot => snapshot.docs)
                .filter(docSnap => isMatchExpired(docSnap.data() as FirestoreMatchData, now))
                .map(docSnap => docSnap.ref);

            // Batch delete expired docs (max 500 per batch)
            const BATCH_SIZE = 500;
            for (let i = 0; i < expiredRefs.length; i += BATCH_SIZE) {
                const chunk = expiredRefs.slice(i, i + BATCH_SIZE);
                const batch = writeBatch(db);
                for (const ref of chunk) {
                    batch.delete(ref);
                }
                await batch.commit();
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
            // SCRUM-71.3: no crear un duplicado si ya existe un guardado con la
            // misma identidad (misma persona + mismas cartas).
            const incomingKey = matchIdentityKey(match);
            const alreadySaved = savedMatches.value.some(m => matchIdentityKey(m) === incomingKey);
            if (alreadySaved) {
                // Asegurar que salga de nuevos aunque ya estuviera guardado
                newMatches.value = newMatches.value.filter(m => m.docId !== match.docId);
                toastStore.show(t('matches.messages.saved'), 'info');
                return true;
            }

            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_guardados');
            const payload = createCleanMatchPayload(match, {
                status: 'activo',
                savedAt: new Date(),
                lifeExpiresAt: getMatchExpirationDate(),
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
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logSanitizedError('saveMatch error', error);
            toastStore.show(t('matches.messages.saveError') + ': ' + errMsg, 'error');
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
            const firestoreDocId = match.docId ?? matchId;

            // Create clean payload for eliminados
            // SCRUM-71.1: kind:'discard' = descartar SOLO este match (no bloquear a la
            // persona). Guardamos los arrays de cartas para poder reconstruir la clave
            // de identidad y suprimir este match en futuros recálculos.
            const payload = createCleanMatchPayload(match, {
                status: 'eliminado',
                eliminatedAt: new Date(),
                lifeExpiresAt: getMatchExpirationDate(),
                kind: 'discard',
                myCards: match.myCards ?? [],
                otherCards: match.otherCards ?? [],
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
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logSanitizedError('discardMatch error', error);
            toastStore.show(t('matches.messages.deleteError') + ': ' + errMsg, 'error');
            return false;
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
                    otherAvatarUrl: authStore.user.avatarUrl ?? null,
                    status: 'nuevo',
                    createdAt: new Date(),
                    lifeExpiresAt: getMatchExpirationDate(),
                    _notificationOf: match.id,
                });

                await addDoc(recipientRef, payload);
            }
        } catch {
            // silent fail
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

        const userId = authStore.user.id;
        try {
            // Delete from user's sent_matches
            const sentRef = collection(db, 'users', userId, 'sent_matches');
            const sentSnapshot = await getDocs(sentRef);
            await Promise.all(sentSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', userId, 'sent_matches', docSnap.id))));

            // Delete from user's saved_matches
            const savedRef = collection(db, 'users', userId, 'saved_matches');
            const savedSnapshot = await getDocs(savedRef);
            await Promise.all(savedSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', userId, 'saved_matches', docSnap.id))));

            // Delete from user's discarded_matches
            const discardedRef = collection(db, 'users', userId, 'discarded_matches');
            const discardedSnapshot = await getDocs(discardedRef);
            await Promise.all(discardedSnapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', userId, 'discarded_matches', docSnap.id))));

            // Clear local state
            newMatches.value = [];
            sentMatches.value = [];
            savedMatches.value = [];
            deletedMatches.value = [];
            sharedMatches.value = [];

            return true;
        } catch (error) {
            logSanitizedError('Error deleting all matches', error);
            return false;
        }
    };

    /**
     * Load the set of otherUserIds the current user has discarded.
     * Used by useDashboardMatches to filter out previously-discarded matches.
     * Preserves DashboardView.vue loadDiscardedMatches (lines 171-191) behavior
     * verbatim: on getDocs error returns empty Set and logs via console.error.
     */
    const loadDiscardedUserIds = async (): Promise<Set<string>> => {
        if (!authStore.user) return new Set();
        try {
            const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const snapshot = await getDocs(discardedRef);
            const ids = new Set<string>();
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                if (data.otherUserId) ids.add(data.otherUserId as string);
            }
            return ids;
        } catch (err) {
            logSanitizedError('Error loading discarded matches', err);
            return new Set();
        }
    };

    /**
     * SCRUM-71.1: userIds de personas BLOQUEADAS (filtran todos sus matches).
     * Incluye docs con kind:'block' y los legacy (sin kind, que históricamente
     * actuaban como bloqueo). Los descartes (kind:'discard') NO bloquean.
     */
    const loadBlockedUserIds = async (): Promise<Set<string>> => {
        if (!authStore.user) return new Set();
        try {
            const ref = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const snapshot = await getDocs(ref);
            const ids = new Set<string>();
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                if (data.kind === 'discard') continue; // descarte ≠ bloqueo
                if (data.otherUserId) ids.add(data.otherUserId as string);
            }
            return ids;
        } catch (err) {
            logSanitizedError('Error loading blocked users', err);
            return new Set();
        }
    };

    /**
     * SCRUM-71.1: claves de identidad (persona + cartas) de matches DESCARTADOS
     * individualmente (kind:'discard'). Se usan para suprimir ese match concreto
     * en futuros recálculos sin bloquear a la persona.
     */
    const loadDiscardedMatchKeys = async (): Promise<Set<string>> => {
        if (!authStore.user) return new Set();
        try {
            const ref = collection(db, 'users', authStore.user.id, 'matches_eliminados');
            const snapshot = await getDocs(ref);
            const keys = new Set<string>();
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                if (data.kind !== 'discard') continue;
                keys.add(matchIdentityKey({
                    otherUserId: data.otherUserId as string | undefined,
                    myCards: data.myCards as { scryfallId?: string }[] | undefined,
                    otherCards: data.otherCards as { scryfallId?: string }[] | undefined,
                }));
            }
            return keys;
        } catch (err) {
            logSanitizedError('Error loading discarded match keys', err);
            return new Set();
        }
    };

    /**
     * Sequential two-step discard (preserves DashboardView:200-228 non-atomic
     * behavior — NOT wrapped in writeBatch). Amendment D.
     *
     * Step 1: addDoc to matches_eliminados.
     * Step 2: getDocs matches_nuevos + deleteDoc loop for any doc with same
     *         match.id OR same otherUserId.
     *
     * If step 2 throws, step 1 is NOT rolled back — caller sees the error and
     * must re-run to clean up orphans. Matches existing behavior verbatim.
     */
    const discardCalculatedMatch = async (match: {
        id: string
        otherUserId: string
        otherUsername: string
        otherLocation: string
        myCards: unknown[]
        otherCards: unknown[]
    }): Promise<void> => {
        if (!authStore.user) return;

        const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados');
        await addDoc(discardedRef, {
            id: match.id,
            otherUserId: match.otherUserId,
            otherUsername: match.otherUsername,
            otherLocation: match.otherLocation,
            myCards: match.myCards ?? [],
            otherCards: match.otherCards ?? [],
            status: 'eliminado',
            eliminatedAt: new Date(),
            lifeExpiresAt: getMatchExpirationDate(),
            kind: 'discard', // SCRUM-71.1: descartar este match, NO bloquear a la persona
        });

        const nuevosRef = collection(db, 'users', authStore.user.id, 'matches_nuevos');
        const nuevosSnapshot = await getDocs(nuevosRef);
        for (const docSnap of nuevosSnapshot.docs) {
            const data = docSnap.data();
            if (data.id === match.id || data.otherUserId === match.otherUserId) {
                await deleteDoc(docSnap.ref);
            }
        }
    };

    /**
     * Persist a freshly-calculated batch of matches into matches_nuevos.
     * AMENDMENT C — 4-step behavior-preserving port of DashboardView.vue:799-863
     * saveMatchesToFirebase. MUST skip deleting docs with truthy _notificationOf
     * (populated by notifyMatchUser Cloud Function AND notifyOtherUser store
     * method at line 513). Deleting these drops incoming cross-user notifications.
     *
     * Step 1: getDocs existing matches_nuevos.
     * Step 2: deleteDoc every doc WITHOUT _notificationOf.
     * Step 3: addDoc each new CalculatedMatch.
     * Step 4: notifyMatchUser per match wrapped in per-match try/catch
     *         (non-blocking: one failed notification does not abort batch).
     */
    const persistCalculatedMatches = async (matches: {
        id: string
        otherUserId: string
        otherUsername: string
        otherLocation: string
        otherEmail?: string
        myCards: unknown[]
        otherCards: unknown[]
        myTotalValue: number
        theirTotalValue: number
        valueDifference: number
        compatibility: number
        type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
        createdAt: Date
        lifeExpiresAt: Date
    }[]): Promise<void> => {
        if (!authStore.user) return;

        try {
            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_nuevos');

            // Step 1+2: Only delete self-calculated matches, preserve notification docs
            // from other users (notification docs have _notificationOf field set by
            // the cloud function or notifyOtherUser store method).
            const existingSnapshot = await getDocs(matchesRef);
            for (const docSnap of existingSnapshot.docs) {
                if (!(docSnap.data())._notificationOf) {
                    await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', docSnap.id));
                }
            }

            // Step 3: Now save the new ones and (step 4) notify the other user.
            for (const match of matches) {
                await addDoc(matchesRef, {
                    id: match.id,
                    otherUserId: match.otherUserId,
                    otherUsername: match.otherUsername,
                    otherLocation: match.otherLocation,
                    otherEmail: match.otherEmail,
                    myCards: match.myCards ?? [],
                    otherCards: match.otherCards ?? [],
                    myTotalValue: match.myTotalValue,
                    theirTotalValue: match.theirTotalValue,
                    valueDifference: match.valueDifference,
                    compatibility: match.compatibility,
                    type: match.type,
                    status: 'nuevo',
                    createdAt: match.createdAt,
                    lifeExpiresAt: match.lifeExpiresAt,
                });

                // Step 4: Notify the other user via Cloud Function.
                // This bypasses security rules to write to their matches_nuevos collection.
                // Per-match try/catch keeps this non-blocking — one failed notification
                // does not abort the batch.
                try {
                    const { notifyMatchUser } = await import('../services/cloudFunctions');
                    await notifyMatchUser({
                        targetUserId: match.otherUserId,
                        matchId: match.id,
                        fromUserId: authStore.user.id,
                        fromUsername: authStore.user.username,
                        fromLocation: authStore.user.location,
                        fromAvatarUrl: authStore.user.avatarUrl,
                        myCards: (match.myCards ?? []) as Record<string, unknown>[],
                        otherCards: (match.otherCards ?? []) as Record<string, unknown>[],
                        myTotalValue: match.myTotalValue,
                        theirTotalValue: match.theirTotalValue,
                        valueDifference: match.valueDifference,
                        compatibility: match.compatibility,
                        type: match.type as 'BIDIRECTIONAL' | 'UNIDIRECTIONAL',
                    });
                    console.info(`Notified ${match.otherUsername} about match`);
                } catch (notifyErr) {
                    // Log but don't fail the whole operation if notification fails
                    logSanitizedError(`Could not notify ${match.otherUsername}`, notifyErr, 'warn');
                }
            }

            console.info(`${matches.length} matches guardados en Firestore (${existingSnapshot.docs.length} anteriores eliminados)`);
        } catch (err) {
            logSanitizedError('Error guardando matches', err);
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
        deleteAllMatches,
        notifyOtherUser,
        getUnseenCount,
        isMatchSaved,
        // Plan 02-B: match-calculation pipeline (Amendments C, D, G)
        loadDiscardedUserIds,
        // SCRUM-71.1: descarte (por match) vs bloqueo (por persona) desacoplados
        loadBlockedUserIds,
        loadDiscardedMatchKeys,
        discardCalculatedMatch,
        persistCalculatedMatches,
    };
});
