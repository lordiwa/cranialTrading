import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    Timestamp,
    updateDoc,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useCollectionStore } from './collection'
import { useDecksStore } from './decks'
import { useToastStore } from './toast'
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
const removeUndefined = <T extends Record<string, any>>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T
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

            const addedAt = alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt)

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
     * Get total allocated quantity for a card across ALL binders
     */
    const getTotalAllocatedForCard = (cardId: string): number => {
        let total = 0
        for (const binder of binders.value) {
            if (!binder.allocations) continue
            for (const alloc of binder.allocations) {
                if (alloc.cardId === cardId) {
                    total += alloc.quantity
                }
            }
        }
        return total
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

            binders.value = snapshot.docs.map(docSnap => {
                const data = docSnap.data()

                const allocations: BinderAllocation[] = (data.allocations || []).map((a: any) => ({
                    ...a,
                    addedAt: a.addedAt?.toDate?.() || new Date(a.addedAt) || new Date(),
                }))

                return {
                    id: docSnap.id,
                    userId: authStore.user!.id,
                    name: data.name,
                    description: data.description || '',
                    allocations,
                    thumbnail: data.thumbnail || '',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                    stats: data.stats || { totalCards: 0, totalPrice: 0 },
                    isPublic: data.isPublic ?? true,
                    forSale: data.forSale ?? true,
                } as Binder
            })
        } catch (error) {
            console.error('Error loading binders:', error)
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
                allocations: [],
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
            console.error('Error creating binder:', error)
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
            console.error('Error updating binder:', error)
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
            console.error('Error deleting binder:', error)
            toastStore.show(t('binders.errors.delete'), 'error')
            return false
        }
    }

    // ========================================================================
    // ALLOCATION OPERATIONS
    // ========================================================================

    const allocateCardToBinder = async (
        binderId: string,
        cardId: string,
        quantity: number
    ): Promise<number> => {
        if (!authStore.user?.id) return 0

        try {
            const binder = binders.value.find(b => b.id === binderId)
            if (!binder) return 0

            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return 0

            // Calculate available quantity (across decks AND binders)
            const decksStore = useDecksStore()
            const deckAllocated = decksStore.getTotalAllocatedForCard(cardId)
            const binderAllocated = getTotalAllocatedForCard(cardId)
            const available = Math.max(0, card.quantity - deckAllocated - binderAllocated)

            // Cap at available
            const toAllocate = Math.min(quantity, available)
            if (toAllocate <= 0) return 0

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

            // Save to Firestore
            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocations: binder.allocations,
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            return toAllocate
        } catch (error) {
            console.error('Error allocating card to binder:', error)
            toastStore.show(t('binders.errors.create'), 'error')
            return 0
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
            if (!binder.allocations) binder.allocations = []

            let totalAllocated = 0

            for (const item of items) {
                const card = collectionStore.getCardById(item.cardId)
                if (!card) continue

                const deckAllocated = decksStore.getTotalAllocatedForCard(item.cardId)
                const binderAllocated = getTotalAllocatedForCard(item.cardId)
                const available = Math.max(0, card.quantity - deckAllocated - binderAllocated)
                const toAllocate = Math.min(item.quantity, available)

                if (toAllocate <= 0) continue

                const existing = binder.allocations.find(a => a.cardId === item.cardId)
                if (existing) {
                    existing.quantity += toAllocate
                } else {
                    binder.allocations.push(removeUndefined({
                        cardId: item.cardId,
                        quantity: toAllocate,
                        addedAt: new Date(),
                    }))
                }
                totalAllocated += toAllocate
            }

            // Single Firestore write
            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocations: binder.allocations,
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            return totalAllocated
        } catch (error) {
            console.error('Error bulk allocating cards to binder:', error)
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
                    allocations: binder.allocations,
                    stats: binder.stats,
                    updatedAt: Timestamp.now(),
                })
            }
            return removed
        } catch (error) {
            console.error('Error bulk deallocating cards from binder:', error)
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

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocations: binder.allocations,
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            return true
        } catch (error) {
            console.error('Error deallocating card from binder:', error)
            return false
        }
    }

    const updateAllocation = async (
        binderId: string,
        cardId: string,
        newQuantity: number
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
                toastStore.show(t('decks.messages.maxAvailable', { max: maxAvailable }), 'error')
                return false
            }

            alloc.quantity = newQuantity

            binder.stats = calculateStats(binder.allocations, collectionStore.cards)
            binder.updatedAt = new Date()

            const binderRef = doc(db, 'users', authStore.user.id, 'binders', binderId)
            await updateDoc(binderRef, {
                allocations: binder.allocations,
                stats: binder.stats,
                updatedAt: Timestamp.now(),
            })

            return true
        } catch (error) {
            console.error('Error updating binder allocation:', error)
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
