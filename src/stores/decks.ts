import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    doc,
    Timestamp,
    getDoc,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { useCollectionStore } from './collection'
import type { Card, CardCondition } from '../types/card'
import type {
    Deck,
    DeckCardAllocation,
    DeckWishlistItem,
    CreateDeckInput,
    DeckStats,
    HydratedDeckCard,
    DisplayDeckCard,
} from '../types/deck'

export const useDecksStore = defineStore('decks', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    // State
    const decks = ref<Deck[]>([])
    const loading = ref(false)
    const currentDeck = ref<Deck | null>(null)

    // Computed
    const totalDecks = computed(() => decks.value.length)

    // ========================================================================
    // STATS CALCULATION
    // ========================================================================

    /**
     * Calculate stats for a deck based on allocations and wishlist
     */
    const calculateStats = (
        allocations: DeckCardAllocation[],
        wishlist: DeckWishlistItem[],
        collectionCards: Card[]
    ): DeckStats => {
        const cardMap = new Map(collectionCards.map(c => [c.id, c]))

        // Calculate owned cards stats
        let ownedCards = 0
        let ownedPrice = 0
        let sideboardCards = 0

        for (const alloc of allocations) {
            const card = cardMap.get(alloc.cardId)
            if (card) {
                ownedCards += alloc.quantity
                ownedPrice += card.price * alloc.quantity
                if (alloc.isInSideboard) {
                    sideboardCards += alloc.quantity
                }
            }
        }

        // Calculate wishlist stats
        let wishlistCards = 0
        let wishlistPrice = 0

        for (const item of wishlist) {
            wishlistCards += item.quantity
            wishlistPrice += item.price * item.quantity
            if (item.isInSideboard) {
                sideboardCards += item.quantity
            }
        }

        const totalCards = ownedCards + wishlistCards
        const totalPrice = ownedPrice + wishlistPrice
        const avgPrice = totalCards > 0 ? totalPrice / totalCards : 0
        const completionPercentage = totalCards > 0 ? (ownedCards / totalCards) * 100 : 100

        return {
            totalCards,
            sideboardCards,
            ownedCards,
            wishlistCards,
            avgPrice,
            totalPrice,
            completionPercentage,
        }
    }

    /**
     * Calculate stats using default empty arrays (for new decks)
     */
    const calculateEmptyStats = (): DeckStats => ({
        totalCards: 0,
        sideboardCards: 0,
        ownedCards: 0,
        wishlistCards: 0,
        avgPrice: 0,
        totalPrice: 0,
        completionPercentage: 100,
    })

    // ========================================================================
    // HYDRATION - Convert allocations to full card data for UI
    // ========================================================================

    /**
     * Get total allocated quantity for a card across ALL decks
     */
    const getTotalAllocatedForCard = (cardId: string): number => {
        let total = 0
        for (const deck of decks.value) {
            if (!deck.allocations) continue
            for (const alloc of deck.allocations) {
                if (alloc.cardId === cardId) {
                    total += alloc.quantity
                }
            }
        }
        return total
    }

    /**
     * Hydrate a deck's allocations and wishlist into displayable cards
     */
    const hydrateDeckCards = (deck: Deck, collectionCards: Card[]): DisplayDeckCard[] => {
        const cardMap = new Map(collectionCards.map(c => [c.id, c]))
        const result: DisplayDeckCard[] = []

        // Hydrate allocations (owned cards)
        if (deck.allocations) {
            for (const alloc of deck.allocations) {
                const card = cardMap.get(alloc.cardId)
                if (card) {
                    const totalAllocated = getTotalAllocatedForCard(card.id)
                    result.push({
                        cardId: card.id,
                        scryfallId: card.scryfallId,
                        name: card.name,
                        edition: card.edition,
                        condition: card.condition,
                        foil: card.foil,
                        price: card.price,
                        image: card.image,
                        allocatedQuantity: alloc.quantity,
                        isInSideboard: alloc.isInSideboard,
                        notes: alloc.notes,
                        addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
                        isWishlist: false as const,
                        availableInCollection: Math.max(0, card.quantity - totalAllocated),
                        totalInCollection: card.quantity,
                    })
                }
            }
        }

        // Hydrate wishlist items
        if (deck.wishlist) {
            for (const item of deck.wishlist) {
                result.push({
                    scryfallId: item.scryfallId,
                    name: item.name,
                    edition: item.edition,
                    condition: item.condition,
                    foil: item.foil,
                    price: item.price,
                    image: item.image,
                    requestedQuantity: item.quantity,
                    isInSideboard: item.isInSideboard,
                    notes: item.notes,
                    addedAt: item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt),
                    isWishlist: true as const,
                })
            }
        }

        return result
    }

    /**
     * Get hydrated cards for mainboard only
     */
    const getMainboardCards = (deck: Deck, collectionCards: Card[]): DisplayDeckCard[] => {
        return hydrateDeckCards(deck, collectionCards).filter(c => !c.isInSideboard)
    }

    /**
     * Get hydrated cards for sideboard only
     */
    const getSideboardCards = (deck: Deck, collectionCards: Card[]): DisplayDeckCard[] => {
        return hydrateDeckCards(deck, collectionCards).filter(c => c.isInSideboard)
    }

    // ========================================================================
    // LOAD OPERATIONS
    // ========================================================================

    /**
     * Load all decks for current user
     */
    const loadDecks = async () => {
        if (!authStore.user?.id) return

        loading.value = true
        try {
            const decksRef = collection(db, 'users', authStore.user.id, 'decks')
            const snapshot = await getDocs(decksRef)

            decks.value = snapshot.docs.map(docSnap => {
                const data = docSnap.data()

                // Convert dates in allocations and wishlist
                const processedAllocations = (data.allocations || []).map((a: any) => ({
                    ...a,
                    addedAt: a.addedAt?.toDate?.() || new Date(a.addedAt) || new Date(),
                }))
                const processedWishlist = (data.wishlist || []).map((w: any) => ({
                    ...w,
                    addedAt: w.addedAt?.toDate?.() || new Date(w.addedAt) || new Date(),
                }))

                return {
                    id: docSnap.id,
                    userId: authStore.user!.id,
                    name: data.name,
                    format: data.format,
                    description: data.description,
                    colors: data.colors || [],
                    allocations: processedAllocations,
                    wishlist: processedWishlist,
                    thumbnail: data.thumbnail || '',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                    isPublic: data.isPublic || false,
                    stats: data.stats || calculateEmptyStats(),
                } as Deck
            })

            console.log(`Loaded ${decks.value.length} decks`)
        } catch (error) {
            console.error('Error loading decks:', error)
            toastStore.show('Error al cargar decks', 'error')
        } finally {
            loading.value = false
        }
    }

    /**
     * Load a specific deck
     */
    const loadDeck = async (deckId: string): Promise<Deck | null> => {
        if (!authStore.user?.id) return null

        try {
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            const docSnap = await getDoc(deckRef)

            if (!docSnap.exists()) {
                toastStore.show('Deck no encontrado', 'error')
                return null
            }

            const data = docSnap.data()
            const allocations = (data.allocations || []).map((a: any) => ({
                ...a,
                addedAt: a.addedAt?.toDate?.() || new Date(a.addedAt) || new Date(),
            }))
            const wishlist = (data.wishlist || []).map((w: any) => ({
                ...w,
                addedAt: w.addedAt?.toDate?.() || new Date(w.addedAt) || new Date(),
            }))

            const deck: Deck = {
                id: docSnap.id,
                userId: authStore.user.id,
                name: data.name,
                format: data.format,
                description: data.description,
                colors: data.colors || [],
                allocations,
                wishlist,
                thumbnail: data.thumbnail || '',
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                isPublic: data.isPublic || false,
                stats: data.stats || calculateEmptyStats(),
            }

            currentDeck.value = { ...deck }
            return deck
        } catch (error) {
            console.error('Error loading deck:', error)
            toastStore.show('Error al cargar deck', 'error')
            return null
        }
    }

    // ========================================================================
    // CREATE / UPDATE / DELETE DECK
    // ========================================================================

    /**
     * Create a new deck
     */
    const createDeck = async (input: CreateDeckInput): Promise<string | null> => {
        if (!authStore.user?.id) return null

        loading.value = true
        try {
            const decksRef = collection(db, 'users', authStore.user.id, 'decks')
            const stats = calculateEmptyStats()

            const docRef = await addDoc(decksRef, {
                name: input.name,
                format: input.format,
                description: input.description,
                colors: input.colors,
                allocations: [],
                wishlist: [],
                thumbnail: '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                isPublic: false,
                stats,
            })

            const newDeck: Deck = {
                id: docRef.id,
                userId: authStore.user.id,
                name: input.name,
                format: input.format,
                description: input.description,
                colors: input.colors,
                allocations: [],
                wishlist: [],
                thumbnail: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                isPublic: false,
                stats,
            }

            decks.value.push(newDeck)
            currentDeck.value = { ...newDeck }
            toastStore.show(`✓ Deck "${input.name}" creado`, 'success')
            return docRef.id
        } catch (error) {
            console.error('Error creating deck:', error)
            toastStore.show('Error al crear deck', 'error')
            return null
        } finally {
            loading.value = false
        }
    }

    /**
     * Update deck info
     */
    const updateDeck = async (deckId: string, updates: Partial<Deck>): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            Object.assign(deck, updates)
            deck.updatedAt = new Date()

            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            return true
        } catch (error) {
            console.error('Error updating deck:', error)
            toastStore.show('Error al actualizar deck', 'error')
            return false
        }
    }

    /**
     * Delete a deck (cards stay in collection)
     */
    const deleteDeck = async (deckId: string): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await deleteDoc(deckRef)

            decks.value = decks.value.filter(d => d.id !== deckId)

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = null
            }

            // NOTE: Cards stay in collection - they're just deallocated automatically
            toastStore.show('✓ Deck eliminado', 'success')
            return true
        } catch (error) {
            console.error('Error deleting deck:', error)
            toastStore.show('Error al eliminar deck', 'error')
            return false
        }
    }

    // ========================================================================
    // ALLOCATION OPERATIONS
    // ========================================================================

    /**
     * Allocate a card from collection to a deck
     * If quantity exceeds available, the excess goes to wishlist
     */
    const allocateCardToDeck = async (
        deckId: string,
        cardId: string,
        quantity: number,
        isInSideboard: boolean,
        notes?: string
    ): Promise<{ allocated: number; wishlisted: number }> => {
        if (!authStore.user?.id) return { allocated: 0, wishlisted: 0 }

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return { allocated: 0, wishlisted: 0 }

            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return { allocated: 0, wishlisted: 0 }

            // Calculate available quantity
            const totalAllocated = getTotalAllocatedForCard(cardId)
            const available = Math.max(0, card.quantity - totalAllocated)

            // Determine how much to allocate vs wishlist
            const toAllocate = Math.min(quantity, available)
            const toWishlist = quantity - toAllocate

            // Initialize arrays if needed
            if (!deck.allocations) deck.allocations = []
            if (!deck.wishlist) deck.wishlist = []

            // Add allocation if we have cards available
            if (toAllocate > 0) {
                // Check if allocation already exists for this card
                const existingAlloc = deck.allocations.find(
                    a => a.cardId === cardId && a.isInSideboard === isInSideboard
                )
                if (existingAlloc) {
                    existingAlloc.quantity += toAllocate
                } else {
                    deck.allocations.push({
                        cardId,
                        quantity: toAllocate,
                        isInSideboard,
                        notes,
                        addedAt: new Date(),
                    })
                }
            }

            // Add to wishlist if needed
            if (toWishlist > 0) {
                const existingWishlist = deck.wishlist.find(
                    w => w.scryfallId === card.scryfallId &&
                        w.edition === card.edition &&
                        w.condition === card.condition &&
                        w.foil === card.foil &&
                        w.isInSideboard === isInSideboard
                )
                if (existingWishlist) {
                    existingWishlist.quantity += toWishlist
                } else {
                    deck.wishlist.push({
                        scryfallId: card.scryfallId,
                        name: card.name,
                        edition: card.edition,
                        quantity: toWishlist,
                        isInSideboard,
                        price: card.price,
                        image: card.image,
                        condition: card.condition,
                        foil: card.foil,
                        notes,
                        addedAt: new Date(),
                    })
                }
            }

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                wishlist: deck.wishlist,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            if (toWishlist > 0) {
                toastStore.show(`${toAllocate} de colección, ${toWishlist} a wishlist`, 'info')
            }

            return { allocated: toAllocate, wishlisted: toWishlist }
        } catch (error) {
            console.error('Error allocating card:', error)
            toastStore.show('Error al asignar carta', 'error')
            return { allocated: 0, wishlisted: 0 }
        }
    }

    /**
     * Add a card directly to wishlist (not in collection)
     */
    const addToWishlist = async (
        deckId: string,
        cardData: {
            scryfallId: string
            name: string
            edition: string
            quantity: number
            isInSideboard: boolean
            price: number
            image: string
            condition: CardCondition
            foil: boolean
            notes?: string
        }
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            if (!deck.wishlist) deck.wishlist = []

            // Check if item already exists
            const existing = deck.wishlist.find(
                w => w.scryfallId === cardData.scryfallId &&
                    w.edition === cardData.edition &&
                    w.condition === cardData.condition &&
                    w.foil === cardData.foil &&
                    w.isInSideboard === cardData.isInSideboard
            )
            if (existing) {
                existing.quantity += cardData.quantity
            } else {
                deck.wishlist.push({
                    ...cardData,
                    addedAt: new Date(),
                })
            }

            // Recalculate stats
            const collectionStore = useCollectionStore()
            deck.stats = calculateStats(deck.allocations || [], deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                wishlist: deck.wishlist,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            return true
        } catch (error) {
            console.error('Error adding to wishlist:', error)
            toastStore.show('Error al agregar a wishlist', 'error')
            return false
        }
    }

    /**
     * Deallocate a card from a deck (card stays in collection)
     */
    const deallocateCard = async (
        deckId: string,
        cardId: string,
        isInSideboard: boolean
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck || !deck.allocations) return false

            // Remove allocation
            deck.allocations = deck.allocations.filter(
                a => !(a.cardId === cardId && a.isInSideboard === isInSideboard)
            )

            // Recalculate stats
            const collectionStore = useCollectionStore()
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            return true
        } catch (error) {
            console.error('Error deallocating card:', error)
            toastStore.show('Error al desasignar carta', 'error')
            return false
        }
    }

    /**
     * Remove a wishlist item from a deck
     */
    const removeFromWishlist = async (
        deckId: string,
        scryfallId: string,
        edition: string,
        condition: CardCondition,
        foil: boolean,
        isInSideboard: boolean
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck || !deck.wishlist) return false

            // Remove wishlist item
            deck.wishlist = deck.wishlist.filter(
                w => !(w.scryfallId === scryfallId &&
                    w.edition === edition &&
                    w.condition === condition &&
                    w.foil === foil &&
                    w.isInSideboard === isInSideboard)
            )

            // Recalculate stats
            const collectionStore = useCollectionStore()
            deck.stats = calculateStats(deck.allocations || [], deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                wishlist: deck.wishlist,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            return true
        } catch (error) {
            console.error('Error removing from wishlist:', error)
            toastStore.show('Error al eliminar de wishlist', 'error')
            return false
        }
    }

    /**
     * Update allocation quantity
     */
    const updateAllocation = async (
        deckId: string,
        cardId: string,
        isInSideboard: boolean,
        newQuantity: number
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck || !deck.allocations) return false

            const alloc = deck.allocations.find(
                a => a.cardId === cardId && a.isInSideboard === isInSideboard
            )
            if (!alloc) return false

            if (newQuantity <= 0) {
                // Remove allocation
                return deallocateCard(deckId, cardId, isInSideboard)
            }

            // Check available quantity
            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return false

            const otherAllocations = getTotalAllocatedForCard(cardId) - alloc.quantity
            const maxAvailable = card.quantity - otherAllocations

            if (newQuantity > maxAvailable) {
                toastStore.show(`Solo hay ${maxAvailable} disponibles`, 'error')
                return false
            }

            alloc.quantity = newQuantity

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = { ...deck }
            }

            return true
        } catch (error) {
            console.error('Error updating allocation:', error)
            toastStore.show('Error al actualizar cantidad', 'error')
            return false
        }
    }

    /**
     * Reduce allocations when a card's quantity is reduced in collection
     * Converts excess allocations to wishlist items
     */
    const reduceAllocationsForCard = async (card: Card, newQuantity: number): Promise<void> => {
        if (!authStore.user?.id) return

        const totalAllocated = getTotalAllocatedForCard(card.id)
        if (newQuantity >= totalAllocated) return // No reduction needed

        let excessToRemove = totalAllocated - newQuantity

        for (const deck of decks.value) {
            if (!deck.allocations || excessToRemove <= 0) continue

            const alloc = deck.allocations.find(a => a.cardId === card.id)
            if (!alloc) continue

            const toConvert = Math.min(alloc.quantity, excessToRemove)
            if (toConvert <= 0) continue

            // Reduce allocation
            alloc.quantity -= toConvert
            excessToRemove -= toConvert

            // Add converted amount to wishlist
            if (!deck.wishlist) deck.wishlist = []
            const existingWishlist = deck.wishlist.find(
                w => w.scryfallId === card.scryfallId &&
                    w.edition === card.edition &&
                    w.condition === card.condition &&
                    w.foil === card.foil &&
                    w.isInSideboard === alloc.isInSideboard
            )
            if (existingWishlist) {
                existingWishlist.quantity += toConvert
            } else {
                deck.wishlist.push({
                    scryfallId: card.scryfallId,
                    name: card.name,
                    edition: card.edition,
                    quantity: toConvert,
                    isInSideboard: alloc.isInSideboard,
                    price: card.price,
                    image: card.image,
                    condition: card.condition,
                    foil: card.foil,
                    notes: alloc.notes,
                    addedAt: new Date(),
                })
            }

            // Remove allocation if quantity is 0
            if (alloc.quantity <= 0) {
                deck.allocations = deck.allocations.filter(a => a.cardId !== card.id || a.isInSideboard !== alloc.isInSideboard)
            }

            // Recalculate stats
            const collectionStore = useCollectionStore()
            deck.stats = calculateStats(deck.allocations, deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            try {
                const deckRef = doc(db, 'users', authStore.user.id, 'decks', deck.id)
                await updateDoc(deckRef, {
                    allocations: deck.allocations,
                    wishlist: deck.wishlist,
                    stats: deck.stats,
                    updatedAt: Timestamp.now(),
                })
            } catch (error) {
                console.error(`Error reducing allocations for deck ${deck.name}:`, error)
            }
        }
    }

    /**
     * Convert a card's allocations to wishlist when card is deleted from collection
     * Called by collection store when a card is deleted
     */
    const convertAllocationsToWishlist = async (deletedCard: Card): Promise<void> => {
        if (!authStore.user?.id) return

        for (const deck of decks.value) {
            if (!deck.allocations) continue

            const allocsToConvert = deck.allocations.filter(a => a.cardId === deletedCard.id)
            if (allocsToConvert.length === 0) continue

            // Remove allocations
            deck.allocations = deck.allocations.filter(a => a.cardId !== deletedCard.id)

            // Add to wishlist
            if (!deck.wishlist) deck.wishlist = []
            for (const alloc of allocsToConvert) {
                deck.wishlist.push({
                    scryfallId: deletedCard.scryfallId,
                    name: deletedCard.name,
                    edition: deletedCard.edition,
                    quantity: alloc.quantity,
                    isInSideboard: alloc.isInSideboard,
                    price: deletedCard.price,
                    image: deletedCard.image,
                    condition: deletedCard.condition,
                    foil: deletedCard.foil,
                    notes: alloc.notes,
                    addedAt: new Date(),
                })
            }

            // Recalculate stats
            const collectionStore = useCollectionStore()
            deck.stats = calculateStats(deck.allocations, deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            try {
                const deckRef = doc(db, 'users', authStore.user.id, 'decks', deck.id)
                await updateDoc(deckRef, {
                    allocations: deck.allocations,
                    wishlist: deck.wishlist,
                    stats: deck.stats,
                    updatedAt: Timestamp.now(),
                })
            } catch (error) {
                console.error(`Error converting allocations for deck ${deck.name}:`, error)
            }
        }
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    const clear = () => {
        decks.value = []
        currentDeck.value = null
    }

    return {
        // State
        decks,
        loading,
        currentDeck,

        // Computed
        totalDecks,

        // Load operations
        loadDecks,
        loadDeck,

        // Deck CRUD
        createDeck,
        updateDeck,
        deleteDeck,

        // Allocation operations
        allocateCardToDeck,
        addToWishlist,
        deallocateCard,
        removeFromWishlist,
        updateAllocation,
        reduceAllocationsForCard,
        convertAllocationsToWishlist,

        // Hydration
        hydrateDeckCards,
        getMainboardCards,
        getSideboardCards,
        getTotalAllocatedForCard,

        // Stats
        calculateStats,

        // Cleanup
        clear,
    }
})
