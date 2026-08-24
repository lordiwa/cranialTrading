import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    addDoc,
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDocs,
    Timestamp,
    updateDoc,
} from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from './auth'
import { CARD_WRITE_TIMEOUT_MS, useCollectionStore } from './collection'
import { useDecksStore } from './decks'
import { useToastStore } from './toast'
import { logSanitizedError } from '../utils/logSanitizedError'
import { withTimeout } from '../utils/withTimeout'
import type { Card } from '../types/card'
import type {
    Binder,
    BinderAllocation,
    BinderStats,
    CreateBinderInput,
} from '../types/binder'
import type { DisplayDeckCard } from '../types/deck'
import { t } from '../composables/useI18n'

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
const removeUndefined = <T extends Record<string, unknown>>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T
}

// Deep-copy a Binder so that array assignment always triggers reactivity for
// consumers that read the array reference (mirrors snapshotDeck in decks.ts).
const snapshotBinder = (binder: Binder): Binder => ({
    ...binder,
    allocations: binder.allocations ? binder.allocations.map(a => ({ ...a })) : [],
    stats: { ...binder.stats },
})

/** Serialize allocations array to JSON string for Firestore (avoids 40k index entry limit on maps) */
export const serializeAllocations = (allocations: BinderAllocation[]): string =>
    JSON.stringify(Object.fromEntries(allocations.map(a => [a.cardId, a.quantity])))

/** Deserialize JSON string back to BinderAllocation[] */
export const deserializeAllocationMap = (data: string | null | undefined): BinderAllocation[] => {
    if (!data || typeof data !== 'string') return []
    try {
        const map: Record<string, number> = JSON.parse(data)
        return Object.entries(map).map(([cardId, quantity]) => ({
            cardId,
            quantity,
            addedAt: new Date(),
        }))
    } catch {
        return []
    }
}

export const useBindersStore = defineStore('binders', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    // State
    const binders = ref<Binder[]>([])
    const loading = ref(false)

    // ========================================================================
    // STATS CALCULATION
    // ========================================================================

    const calculateStats = (
        allocations: BinderAllocation[],
        collectionCards: Card[]
    ): BinderStats => {
        const cardMap = new Map(collectionCards.map(c => [c.id, c]))

        let totalCards = 0
        let totalPrice = 0

        for (const alloc of allocations) {
            const card = cardMap.get(alloc.cardId)
            if (card) {
                totalCards += alloc.quantity
                totalPrice += card.price * alloc.quantity
            }
        }

        return { totalCards, totalPrice }
    }

    // ========================================================================
    // HYDRATION - Convert allocations to DisplayDeckCard[] for DeckEditorGrid
    // ========================================================================

    const hydrateBinderCards = (binder: Binder, collectionCards: Card[]): DisplayDeckCard[] => {
        const cardMap = new Map(collectionCards.map(c => [c.id, c]))
        const result: DisplayDeckCard[] = []

        if (!binder.allocations) return result

        for (const alloc of binder.allocations) {
            const card = cardMap.get(alloc.cardId)
            if (!card) continue

            const addedAt = card.createdAt ?? (alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt))

            result.push({
                cardId: card.id,
                scryfallId: card.scryfallId,
                name: card.name,
                edition: card.edition,
                condition: card.condition,
                foil: card.foil,
                language: card.language,
                price: card.price,
                image: card.image,
                cmc: card.cmc,
                type_line: card.type_line,
                colors: card.colors,
                produced_mana: card.produced_mana,
                allocatedQuantity: alloc.quantity,
                isInSideboard: false,
                addedAt,
                isWishlist: false as const,
                availableInCollection: Math.max(0, card.quantity - getTotalAllocatedForCard(card.id)),
                totalInCollection: card.quantity,
            })
        }

        return result
    }

    // ========================================================================
    // ALLOCATION TRACKING
    // ========================================================================

    /**
     * Cached index: cardId → total allocated across ALL binders.
     * Rebuilt automatically when binders change. O(1) lookups.
     */
    const binderAllocationTotalIndex = computed((): Map<string, number> => {
        const index = new Map<string, number>()
        for (const binder of binders.value) {
            if (!binder.allocations) continue
            for (const alloc of binder.allocations) {
                index.set(alloc.cardId, (index.get(alloc.cardId) ?? 0) + alloc.quantity)
            }
        }
        return index
    })

    /**
     * Get total allocated quantity for a card across ALL binders (O(1) via cached index)
     */
    const getTotalAllocatedForCard = (cardId: string): number => {
        return binderAllocationTotalIndex.value.get(cardId) ?? 0
    }

    // ========================================================================
    // LOAD OPERATIONS
    // ========================================================================

    const loadBinders = async () => {
        if (!authStore.user?.id) return

        loading.value = true
        try {
            const bindersRef = collection(db, 'users', authStore.user.id, 'binders')
            const snapshot = await getDocs(bindersRef)

            const userId = authStore.user.id
            binders.value = snapshot.docs.map(docSnap => {
                interface FirestoreBinderData {
                    name: string;
                    description?: string;
                    allocationData?: string;
                    allocations?: {
                        cardId: string;
                        quantity: number;
                        addedAt?: { toDate?: () => Date } | Date | string | number;
                    }[];
                    thumbnail?: string;
                    createdAt?: { toDate: () => Date };
                    updatedAt?: { toDate: () => Date };
                    stats?: BinderStats;
                    isPublic?: boolean;
                    forSale?: boolean;
                }
                const data = docSnap.data() as FirestoreBinderData

                // New compact JSON string format takes priority; fall back to old array format
                const allocations: BinderAllocation[] = data.allocationData
                    ? deserializeAllocationMap(data.allocationData)
                    : (data.allocations ?? []).map(a => ({
                        ...a,
                        addedAt: (typeof a.addedAt === 'object' && a.addedAt !== null && 'toDate' in a.addedAt && typeof a.addedAt.toDate === 'function')
                            ? a.addedAt.toDate()
                            : (a.addedAt ? new Date(a.addedAt as string | number) : new Date()),
                    }))

                return {
                    id: docSnap.id,
                    userId,
                    name: data.name,
                    description: data.description ?? '',
                    allocations,
                    thumbnail: data.thumbnail ?? '',
                    createdAt: data.createdAt?.toDate() ?? new Date(),
                    updatedAt: data.updatedAt?.toDate() ?? new Date(),
                    stats: data.stats ?? { totalCards: 0, totalPrice: 0 },
                    isPublic: data.isPublic ?? true,
                    forSale: data.forSale ?? true,
                } as Binder
            })
        } catch (error) {
            logSanitizedError('Error loading binders', error)
            toastStore.show(t('binders.errors.load'), 'error')
        } finally {
            loading.value = false
        }
    }

    // ========================================================================
    // CREATE / UPDATE / DELETE
    // ========================================================================

    const createBinder = async (input: CreateBinderInput): Promise<string | null> => {
        if (!authStore.user?.id) return null

        loading.value = true
        try {
            const bindersRef = collection(db, 'users', authStore.user.id, 'binders')
            const stats: BinderStats = { totalCards: 0, totalPrice: 0 }

            const docRef = await addDoc(bindersRef, {
                name: input.name,
                description: input.description,
                allocationData: '{}',
                thumbnail: '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                stats,
                isPublic: true,
                forSale: true,
            })

            const newBinder: Binder = {
                id: docRef.id,
                userId: authStore.user.id,
                name: input.name,
                description: input.description,
                allocations: [],
                thumbnail: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                stats,
                isPublic: true,
                forSale: true,
            }

            binders.value.push(newBinder)
            toastStore.show(t('binders.created', { name: input.name }), 'success')
            return docRef.id
        } catch (error) {
            logSanitizedError('Error creating binder', error)
            toastStore.show(t('binders.errors.create'), 'error')
            return null
        } finally {
            loading.value = false
        }
    }

    const updateBinder = async (binderId: string, updates: Partial<Pick<Binder, 'name' | 'description' | 'isPublic' | 'forSale'>>): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder) return false

            Object.assign(binder, updates)
            binder.updatedAt = new Date()

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            })

            return true
        } catch (error) {
            logSanitizedError('Error updating binder', error)
            return false
        }
    }

    const deleteBinder = async (binderId: string): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await deleteDoc(binderRef)

            binders.value = binders.value.filter(b => b.id !== binderId)
            toastStore.show(t('binders.deleted'), 'success')
            return true
        } catch (error) {
            logSanitizedError('Error deleting binder', error)
            toastStore.show(t('binders.errors.delete'), 'error')
            return false
        }
    }

    // ========================================================================
    // ALLOCATION OPERATIONS
    // ========================================================================

    // TASK-281 HIGH-1: returns { allocated, failed } instead of a bare
    // number. A bare 0 was ambiguous between two very different causes —
    // (a) a real write failure, and (b) the BY-DESIGN availability cap
    // below (toAllocate <= 0, e.g. the binder "+" button has no upper
    // bound in the UI so it's easy to ask for more than's left after deck
    // allocations). CardDetailModal.handleSave needs to tell them apart:
    // the cap is not a failure and must not produce an error toast that
    // then can never be dismissed by retrying (the target/original slots
    // would stay stuck at the same over-cap values forever). failed=true
    // only for auth/binder/card-not-found and the actual Firestore write
    // failing; failed=false (with allocated===0) for the cap.
    const allocateCardToBinder = async (
        binderId: string,
        cardId: string,
        quantity: number
    ): Promise<{ allocated: number; failed: boolean }> => {
        if (!authStore.user?.id) return { allocated: 0, failed: true }

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder) return { allocated: 0, failed: true }

            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return { allocated: 0, failed: true }

            // Calculate available quantity (across decks AND binders)
            const decksStore = useDecksStore()
            const deckAllocated = decksStore.getTotalAllocatedForCard(cardId)
            const binderAllocated = getTotalAllocatedForCard(cardId)
            const available = Math.max(0, card.quantity - deckAllocated - binderAllocated)

            // Cap at available — NOT a failure, see the function comment above.
            const toAllocate = Math.min(quantity, available)
            if (toAllocate <= 0) return { allocated: 0, failed: false }

            if (!binder.allocations) binder.allocations = []

            // Check if allocation already exists
            const existingAlloc = binder.allocations.find(a => a.cardId === cardId)
            if (existingAlloc) {
                existingAlloc.quantity += toAllocate
            } else {
                binder.allocations.push(removeUndefined({
                    cardId,
                    quantity: toAllocate,
                    addedAt: new Date(),
                }))
            }

            // Recalculate stats
            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            // Save to Firestore (compact map format + clean old array field)
            // TASK-280 AC3/AC4: withTimeout — this write had no timeout; a
            // hang left CardDetailModal.handleSave's await permanently
            // pending, same mechanism as the deck-side fix in decks.ts.
            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await withTimeout(updateDoc(binderRef, {
                allocationData: serializeAllocations(binder.allocations),
                allocations: deleteField(),
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            }), CARD_WRITE_TIMEOUT_MS, 'updateDoc')

            // Replace the binder object AND the array so Vue computed properties
            // that read binders.value (e.g. BinderView.selectedBinder) are invalidated.
            // Without this, in-place mutation of alloc.quantity is invisible to Vue.
            // Mirrors the same fix applied to allocateCardToDeck in decks.ts.
            const idx = binders.value.indexOf(binder)
            if (idx !== -1) {
                binders.value[idx] = snapshotBinder(binder)
                binders.value = [...binders.value]
            }

            return { allocated: toAllocate, failed: false }
        } catch (error) {
            logSanitizedError('Error allocating card to binder', error)
            toastStore.show(t('binders.errors.create'), 'error')
            return { allocated: 0, failed: true }
        }
    }

    const bulkAllocateCardsToBinder = async (
        binderId: string,
        items: { cardId: string; quantity: number }[],
    ): Promise<number> => {
        if (!authStore.user?.id || items.length === 0) return 0

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder) return 0

            const collectionStore = useCollectionStore()
            const decksStore = useDecksStore()
            let totalAllocated = 0

            // Work on a PLAIN array (not Vue-reactive) to avoid 10k reactive triggers
            const plainAllocations = [...(binder.allocations ?? [])]
            const allocMap = new Map(plainAllocations.map(a => [a.cardId, a]))

            for (const item of items) {
                const card = collectionStore.getCardById(item.cardId)
                if (!card) continue

                const deckAllocated = decksStore.getTotalAllocatedForCard(item.cardId)
                const binderAllocated = getTotalAllocatedForCard(item.cardId)
                const available = Math.max(0, card.quantity - deckAllocated - binderAllocated)
                const toAllocate = Math.min(item.quantity, available)

                if (toAllocate <= 0) continue

                const existing = allocMap.get(item.cardId)
                if (existing) {
                    existing.quantity += toAllocate
                } else {
                    const newAlloc = removeUndefined({
                        cardId: item.cardId,
                        quantity: toAllocate,
                        addedAt: new Date(),
                    })
                    plainAllocations.push(newAlloc)
                    allocMap.set(item.cardId, newAlloc)
                }
                totalAllocated += toAllocate
            }

            // Single reactive assignment (1 trigger instead of 10k)
            binder.allocations = plainAllocations

            // Single Firestore write
            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocationData: serializeAllocations(binder.allocations),
                allocations: deleteField(),
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            // SCRUM-40: replace binder slot + array reference so consumers that read
            // binders.value identity (BinderView.selectedBinder) are invalidated.
            const idx = binders.value.indexOf(binder)
            if (idx !== -1) {
                binders.value[idx] = snapshotBinder(binder)
                binders.value = [...binders.value]
            }

            return totalAllocated
        } catch (error) {
            logSanitizedError('Error bulk allocating cards to binder', error)
            toastStore.show(t('binders.errors.create'), 'error')
            return 0
        }
    }

    const bulkDeallocateCardsFromBinder = async (
        binderId: string,
        cardIds: string[],
    ): Promise<number> => {
        if (!authStore.user?.id || cardIds.length === 0) return 0
        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder?.allocations) return 0

            const cardIdSet = new Set(cardIds)
            const before = binder.allocations.length
            binder.allocations = binder.allocations.filter(a => !cardIdSet.has(a.cardId))
            const removed = before - binder.allocations.length

            if (removed > 0) {
                const collectionStore = useCollectionStore()
                binder.stats = calculateStats(binder.allocations, collectionStore.cards)
                binder.updatedAt = new Date()

                const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
                await updateDoc(binderRef, {
                    allocationData: serializeAllocations(binder.allocations),
                    allocations: deleteField(),
                    stats: binder.stats,
                    updatedAt: Timestamp.now(),
                })

                // SCRUM-40: replace binder slot + array reference.
                const idx = binders.value.indexOf(binder)
                if (idx !== -1) {
                    binders.value[idx] = snapshotBinder(binder)
                    binders.value = [...binders.value]
                }
            }
            return removed
        } catch (error) {
            logSanitizedError('Error bulk deallocating cards from binder', error)
            return 0
        }
    }

    const deallocateCard = async (binderId: string, cardId: string): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder?.allocations) return false

            binder.allocations = binder.allocations.filter(a => a.cardId !== cardId)

            const collectionStore = useCollectionStore()
            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            // TASK-280 AC3/AC4: withTimeout — see allocateCardToBinder above.
            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await withTimeout(updateDoc(binderRef, {
                allocationData: serializeAllocations(binder.allocations),
                allocations: deleteField(),
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            }), CARD_WRITE_TIMEOUT_MS, 'updateDoc')

            // SCRUM-40: replace binder slot + array reference.
            const idx = binders.value.indexOf(binder)
            if (idx !== -1) {
                binders.value[idx] = snapshotBinder(binder)
                binders.value = [...binders.value]
            }

            return true
        } catch (error) {
            logSanitizedError('Error deallocating card from binder', error)
            return false
        }
    }

    const updateAllocation = async (
        binderId: string,
        cardId: string,
        newQuantity: number,
        silent?: boolean
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder?.allocations) return false

            const alloc = binder.allocations.find(a => a.cardId === cardId)
            if (!alloc) return false

            if (newQuantity <= 0) {
                return await deallocateCard(binderId, cardId)
            }

            // Check available quantity
            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return false

            const decksStore = useDecksStore()
            const deckAllocated = decksStore.getTotalAllocatedForCard(cardId)
            const binderAllocated = getTotalAllocatedForCard(cardId) - alloc.quantity
            const maxAvailable = card.quantity - deckAllocated - binderAllocated

            if (newQuantity > maxAvailable) {
                if (!silent) toastStore.show(t('decks.messages.maxAvailable', { max: maxAvailable }), 'error')
                return false
            }

            alloc.quantity = newQuantity

            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocationData: serializeAllocations(binder.allocations),
                allocations: deleteField(),
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            // SCRUM-40: replace binder slot + array reference so the in-place
            // alloc.quantity mutation is visible to consumers reading binders.value.
            const idx = binders.value.indexOf(binder)
            if (idx !== -1) {
                binders.value[idx] = snapshotBinder(binder)
                binders.value = [...binders.value]
            }

            return true
        } catch (error) {
            logSanitizedError('Error updating binder allocation', error)
            return false
        }
    }

    return {
        // State
        binders,
        loading,

        // Load
        loadBinders,

        // CRUD
        createBinder,
        updateBinder,
        deleteBinder,

        // Allocations
        allocateCardToBinder,
        bulkAllocateCardsToBinder,
        bulkDeallocateCardsFromBinder,
        deallocateCard,
        updateAllocation,
        getTotalAllocatedForCard,

        // Hydration & Stats
        hydrateBinderCards,
        calculateStats,
    }
})
