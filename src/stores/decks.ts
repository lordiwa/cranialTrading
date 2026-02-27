import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    Timestamp,
    updateDoc,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { getCardById as getScryfallCard } from '../services/scryfall'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { useCollectionStore } from './collection'
import type { Card, CardCondition } from '../types/card'
import type {
    CreateDeckInput,
    Deck,
    DeckCardAllocation,
    DeckStats,
    DeckWishlistItem,
} from '../types/deck'
import { t } from '../composables/useI18n'

// Helper to remove undefined values from objects (Firebase doesn't accept undefined)
const removeUndefined = <T extends Record<string, any>>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T
}

// Helper to process Firestore dates in deck items (allocations/wishlist)
const processFirestoreDates = <T extends { addedAt?: any }>(items: any[]): T[] => {
    return (items || []).map((item: any) => ({
        ...item,
        addedAt: item.addedAt?.toDate?.() || new Date(item.addedAt) || new Date(),
    })) as T[]
}

// Deep-copy a Deck so that shallowRef assignment always triggers reactivity
const snapshotDeck = (deck: Deck): Deck => ({
    ...deck,
    allocations: deck.allocations ? deck.allocations.map(a => ({ ...a })) : [],
    wishlist: deck.wishlist ? deck.wishlist.map(w => ({ ...w })) : [],
    stats: { ...deck.stats },
    colors: [...deck.colors],
})

export const useDecksStore = defineStore('decks', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    // State
    const decks = ref<Deck[]>([])
    const loading = ref(false)
    const currentDeck = shallowRef<Deck | null>(null)

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

        let ownedCards = 0
        let ownedPrice = 0
        let sideboardCards = 0
        let wishlistCards = 0
        let wishlistPrice = 0

        // Allocations: check card status to determine owned vs wishlist
        for (const alloc of allocations) {
            const card = cardMap.get(alloc.cardId)
            if (card) {
                if (card.status === 'wishlist') {
                    wishlistCards += alloc.quantity
                    wishlistPrice += card.price * alloc.quantity
                } else {
                    ownedCards += alloc.quantity
                    ownedPrice += card.price * alloc.quantity
                }
                if (alloc.isInSideboard) {
                    sideboardCards += alloc.quantity
                }
            }
        }

        // Legacy wishlist items (backward compat)
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
    // ========================================================================
    // MIGRATION HELPERS
    // ========================================================================

    /**
     * Migrate wishlist items that are missing type_line, colors, or cmc
     * Fetches the missing data from Scryfall and updates Firestore
     */
    const migrateWishlistMetadata = async (
        deckId: string,
        wishlist: DeckWishlistItem[]
    ): Promise<DeckWishlistItem[]> => {
        if (!authStore.user?.id) return wishlist

        // Find items missing metadata
        // Note: empty colors array [] is valid for colorless cards, so only check for undefined/null
        const itemsToMigrate = wishlist.filter(item => {
            const missingTypeLine = item.type_line === undefined || item.type_line === null
            const missingColors = item.colors === undefined || item.colors === null
            const missingCmc = item.cmc === undefined || item.cmc === null
            return missingTypeLine || missingColors || missingCmc
        })

        if (itemsToMigrate.length === 0) return wishlist

        let updated = false
        const updatedWishlist = [...wishlist]

        for (const item of itemsToMigrate) {
            try {
                const scryfallCard = await getScryfallCard(item.scryfallId)
                if (scryfallCard) {
                    const index = updatedWishlist.findIndex(
                        w => w.scryfallId === item.scryfallId &&
                            w.edition === item.edition &&
                            w.condition === item.condition &&
                            w.foil === item.foil &&
                            w.isInSideboard === item.isInSideboard
                    )
                    const existingItem = updatedWishlist[index]
                    if (index >= 0 && existingItem) {
                        updatedWishlist[index] = {
                            ...existingItem,
                            type_line: scryfallCard.type_line,
                            colors: scryfallCard.colors || [],
                            cmc: scryfallCard.cmc,
                        }
                        updated = true
                    }
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (e) {
                console.warn(`[migrateWishlistMetadata] Failed to fetch ${item.name}:`, e)
            }
        }

        // Save back to Firestore if we updated anything
        if (updated) {
            try {
                const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
                await updateDoc(deckRef, {
                    wishlist: updatedWishlist,
                    updatedAt: Timestamp.now(),
                })
            } catch (e) {
                console.error('[migrateWishlistMetadata] Failed to save:', e)
            }
        }

        return updatedWishlist
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

            // First pass: load all decks
            const loadedDecks: Deck[] = snapshot.docs.map(docSnap => {
                const data = docSnap.data()

                // Convert dates in allocations and wishlist
                const processedAllocations = processFirestoreDates<DeckCardAllocation>(data.allocations)
                const processedWishlist = processFirestoreDates<DeckWishlistItem>(data.wishlist)

                return {
                    id: docSnap.id,
                    userId: authStore.user!.id,
                    name: data.name,
                    format: data.format,
                    description: data.description,
                    colors: data.colors || [],
                    commander: data.commander || '',
                    allocations: processedAllocations,
                    wishlist: processedWishlist,
                    thumbnail: data.thumbnail || '',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                    isPublic: data.isPublic || false,
                    stats: data.stats || calculateEmptyStats(),
                } as Deck
            })

            // Second pass: migrate wishlist metadata for all decks (in parallel)
            const migratedDecks = await Promise.all(
                loadedDecks.map(async (deck) => {
                    if (deck.wishlist && deck.wishlist.length > 0) {
                        deck.wishlist = await migrateWishlistMetadata(deck.id, deck.wishlist)
                    }
                    return deck
                })
            )

            decks.value = migratedDecks
        } catch (error) {
            console.error('Error loading decks:', error)
            toastStore.show(t('decks.messages.loadError'), 'error')
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
                toastStore.show(t('decks.messages.notFound'), 'error')
                return null
            }

            const data = docSnap.data()
            const allocations = processFirestoreDates<DeckCardAllocation>(data.allocations)
            let wishlist = processFirestoreDates<DeckWishlistItem>(data.wishlist)

            // Migrate wishlist items missing type_line/colors/cmc (fetches from Scryfall)
            wishlist = await migrateWishlistMetadata(deckId, wishlist)

            const deck: Deck = {
                id: docSnap.id,
                userId: authStore.user.id,
                name: data.name,
                format: data.format,
                description: data.description,
                colors: data.colors || [],
                commander: data.commander || '',
                allocations,
                wishlist,
                thumbnail: data.thumbnail || '',
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                isPublic: data.isPublic || false,
                stats: data.stats || calculateEmptyStats(),
            }

            // Also add/update in decks array so allocateCardToDeck can find it
            const existingIndex = decks.value.findIndex(d => d.id === deckId)
            if (existingIndex >= 0) {
                decks.value[existingIndex] = deck
            } else {
                decks.value.push(deck)
            }

            currentDeck.value = snapshotDeck(deck)
            return deck
        } catch (error) {
            console.error('Error loading deck:', error)
            toastStore.show(t('decks.messages.loadDeckError'), 'error')
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
                commander: input.commander || '',
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
                commander: input.commander || '',
                allocations: [],
                wishlist: [],
                thumbnail: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                isPublic: false,
                stats,
            }

            decks.value.push(newDeck)
            currentDeck.value = snapshotDeck(newDeck)
            toastStore.show(t('decks.messages.created', { name: input.name }), 'success')
            return docRef.id
        } catch (error) {
            console.error('Error creating deck:', error)
            toastStore.show(t('decks.messages.createError'), 'error')
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
                currentDeck.value = snapshotDeck(deck)
            }

            return true
        } catch (error) {
            console.error('Error updating deck:', error)
            toastStore.show(t('decks.messages.updateError'), 'error')
            return false
        }
    }

    /**
     * Toggle a card as commander (add/remove from commander list)
     */
    const toggleCommander = async (deckId: string, cardName: string): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            // Parse current commanders
            const currentCommanders = deck.commander
                ? deck.commander.split(/\s*\/\/\s*/).map(n => n.trim()).filter(n => n.length > 0)
                : []

            // Check if card is already a commander
            const cardNameLower = cardName.toLowerCase()
            const isCommander = currentCommanders.some(c => c.toLowerCase() === cardNameLower)

            let newCommanders: string[]
            if (isCommander) {
                // Remove from commanders
                newCommanders = currentCommanders.filter(c => c.toLowerCase() !== cardNameLower)
            } else {
                // Add to commanders
                newCommanders = [...currentCommanders, cardName]
            }

            // Update deck
            const newCommanderString = newCommanders.join(' // ')
            deck.commander = newCommanderString

            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                commander: newCommanderString,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = snapshotDeck(deck)
            }

            toastStore.show(
                isCommander ? t('decks.messages.commanderRemoved', { name: cardName }) : t('decks.messages.commanderSet', { name: cardName }),
                'success'
            )
            return true
        } catch (error) {
            console.error('Error toggling commander:', error)
            toastStore.show(t('decks.messages.commanderError'), 'error')
            return false
        }
    }

    /**
     * Delete a deck (cards stay in collection)
     */
    const deleteDeck = async (deckId: string, silent = false): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await deleteDoc(deckRef)

            decks.value = decks.value.filter(d => d.id !== deckId)

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = null
            }

            // NOTE: Cards stay in collection - they're just deallocated automatically
            if (!silent) toastStore.show(t('decks.messages.deleted'), 'success')
            return true
        } catch (error) {
            console.error('Error deleting deck:', error)
            toastStore.show(t('decks.messages.deleteError'), 'error')
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
        if (!authStore.user?.id) {
            console.warn('[allocateCardToDeck] No user')
            return { allocated: 0, wishlisted: 0 }
        }

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) {
                console.warn(`[allocateCardToDeck] Deck not found: ${deckId}, available decks:`, decks.value.map(d => d.id))
                return { allocated: 0, wishlisted: 0 }
            }

            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) {
                console.warn(`[allocateCardToDeck] Card not found: ${cardId}`)
                return { allocated: 0, wishlisted: 0 }
            }

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
                    deck.allocations.push(removeUndefined({
                        cardId,
                        quantity: toAllocate,
                        isInSideboard,
                        notes,
                        addedAt: new Date(),
                    }))
                }
            }

            // Add overflow to wishlist via collection
            if (toWishlist > 0) {
                const wishCardId = await collectionStore.ensureCollectionWishlistCard({
                    scryfallId: card.scryfallId,
                    name: card.name,
                    edition: card.edition,
                    quantity: toWishlist,
                    condition: card.condition,
                    foil: card.foil,
                    price: card.price ?? 0,
                    image: card.image ?? '',
                    cmc: card.cmc,
                    type_line: card.type_line,
                    colors: card.colors,
                })
                if (wishCardId) {
                    const existingWishAlloc = deck.allocations.find(
                        a => a.cardId === wishCardId && a.isInSideboard === isInSideboard
                    )
                    if (existingWishAlloc) {
                        existingWishAlloc.quantity += toWishlist
                    } else {
                        deck.allocations.push(removeUndefined({
                            cardId: wishCardId,
                            quantity: toWishlist,
                            isInSideboard,
                            notes,
                            addedAt: new Date(),
                        }))
                    }
                }
            }

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                wishlist: deck.wishlist || [],
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = snapshotDeck(deck)
            }

            if (toWishlist > 0) {
                toastStore.show(t('decks.messages.allocated', { fromCollection: toAllocate, toWishlist }), 'info')
            }

            return { allocated: toAllocate, wishlisted: toWishlist }
        } catch (error) {
            console.error('Error allocating card:', error)
            toastStore.show(t('decks.messages.allocateError'), 'error')
            return { allocated: 0, wishlisted: 0 }
        }
    }

    /**
     * Allocate many cards to a deck in one Firestore write.
     * All allocation logic runs in memory, then saves once.
     */
    const bulkAllocateCardsToDeck = async (
        deckId: string,
        items: { cardId: string; quantity: number; isInSideboard: boolean }[],
        onProgress?: (current: number, total: number) => void
    ): Promise<{ allocated: number; wishlisted: number }> => {
        if (!authStore.user?.id || items.length === 0) return { allocated: 0, wishlisted: 0 }

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return { allocated: 0, wishlisted: 0 }

            const collectionStore = useCollectionStore()
            if (!deck.allocations) deck.allocations = []
            if (!deck.wishlist) deck.wishlist = []

            let totalAllocated = 0
            let totalWishlisted = 0

            for (let i = 0; i < items.length; i++) {
                const item = items[i]!
                const card = collectionStore.getCardById(item.cardId)
                if (!card) continue

                const alreadyAllocated = getTotalAllocatedForCard(item.cardId)
                const available = Math.max(0, card.quantity - alreadyAllocated)
                const toAllocate = Math.min(item.quantity, available)
                const toWishlist = item.quantity - toAllocate

                if (toAllocate > 0) {
                    const existing = deck.allocations.find(
                        a => a.cardId === item.cardId && a.isInSideboard === item.isInSideboard
                    )
                    if (existing) {
                        existing.quantity += toAllocate
                    } else {
                        deck.allocations.push(removeUndefined({
                            cardId: item.cardId,
                            quantity: toAllocate,
                            isInSideboard: item.isInSideboard,
                            addedAt: new Date(),
                        }))
                    }
                    totalAllocated += toAllocate
                }

                if (toWishlist > 0) {
                    const wishCardId = await collectionStore.ensureCollectionWishlistCard({
                        scryfallId: card.scryfallId,
                        name: card.name,
                        edition: card.edition,
                        quantity: toWishlist,
                        condition: card.condition,
                        foil: card.foil,
                        price: card.price ?? 0,
                        image: card.image ?? '',
                        cmc: card.cmc,
                        type_line: card.type_line,
                        colors: card.colors,
                    })
                    if (wishCardId) {
                        const existingWishAlloc = deck.allocations.find(
                            a => a.cardId === wishCardId && a.isInSideboard === item.isInSideboard
                        )
                        if (existingWishAlloc) {
                            existingWishAlloc.quantity += toWishlist
                        } else {
                            deck.allocations.push(removeUndefined({
                                cardId: wishCardId,
                                quantity: toWishlist,
                                isInSideboard: item.isInSideboard,
                                addedAt: new Date(),
                            }))
                        }
                    }
                    totalWishlisted += toWishlist
                }

                if (onProgress && i % 50 === 0) {
                    onProgress(i + 1, items.length)
                }
            }

            // Single Firestore write
            deck.stats = calculateStats(deck.allocations, deck.wishlist, collectionStore.cards)
            deck.updatedAt = new Date()

            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                wishlist: deck.wishlist,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = snapshotDeck(deck)
            }

            return { allocated: totalAllocated, wishlisted: totalWishlisted }
        } catch (error) {
            console.error('Error bulk allocating cards:', error)
            toastStore.show(t('decks.messages.allocateError'), 'error')
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
            cmc?: number
            type_line?: string
            colors?: string[]
            notes?: string
        }
    ): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            if (!deck.allocations) deck.allocations = []

            // Create or find a wishlist card in the collection
            const collectionStore = useCollectionStore()
            const collectionCardId = await collectionStore.ensureCollectionWishlistCard({
                scryfallId: cardData.scryfallId,
                name: cardData.name,
                edition: cardData.edition,
                quantity: cardData.quantity,
                condition: cardData.condition,
                foil: cardData.foil,
                price: cardData.price,
                image: cardData.image,
                cmc: cardData.cmc,
                type_line: cardData.type_line,
                colors: cardData.colors,
            })

            if (!collectionCardId) return false

            // Create allocation referencing the collection wishlist card
            const existingAlloc = deck.allocations.find(
                a => a.cardId === collectionCardId && a.isInSideboard === cardData.isInSideboard
            )
            if (existingAlloc) {
                existingAlloc.quantity += cardData.quantity
            } else {
                deck.allocations.push(removeUndefined({
                    cardId: collectionCardId,
                    quantity: cardData.quantity,
                    isInSideboard: cardData.isInSideboard,
                    notes: cardData.notes,
                    addedAt: new Date(),
                }))
            }

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Save to Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                allocations: deck.allocations,
                wishlist: deck.wishlist || [],
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = snapshotDeck(deck)
            }

            return true
        } catch (error) {
            console.error('Error adding to wishlist:', error)
            toastStore.show(t('decks.messages.addWishlistError'), 'error')
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
            if (!deck?.allocations) return false

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
                currentDeck.value = snapshotDeck(deck)
            }

            return true
        } catch (error) {
            console.error('Error deallocating card:', error)
            toastStore.show(t('decks.messages.deallocateError'), 'error')
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
            if (!deck?.wishlist) return false

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
                currentDeck.value = snapshotDeck(deck)
            }

            return true
        } catch (error) {
            console.error('Error removing from wishlist:', error)
            toastStore.show(t('decks.messages.removeWishlistError'), 'error')
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
            if (!deck?.allocations) return false

            const alloc = deck.allocations.find(
                a => a.cardId === cardId && a.isInSideboard === isInSideboard
            )
            if (!alloc) return false

            if (newQuantity <= 0) {
                // Remove allocation
                return await deallocateCard(deckId, cardId, isInSideboard)
            }

            // Check available quantity
            const collectionStore = useCollectionStore()
            const card = collectionStore.getCardById(cardId)
            if (!card) return false

            const otherAllocations = getTotalAllocatedForCard(cardId) - alloc.quantity
            const maxAvailable = card.quantity - otherAllocations

            if (newQuantity > maxAvailable) {
                toastStore.show(t('decks.messages.maxAvailable', { max: maxAvailable }), 'error')
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
                currentDeck.value = snapshotDeck(deck)
            }

            return true
        } catch (error) {
            console.error('Error updating allocation:', error)
            toastStore.show(t('decks.messages.updateQuantityError'), 'error')
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

        const collectionStore = useCollectionStore()
        let excessToRemove = totalAllocated - newQuantity

        // First, create a single wishlist card in collection for the total excess
        const wishCardId = await collectionStore.ensureCollectionWishlistCard({
            scryfallId: card.scryfallId,
            name: card.name,
            edition: card.edition,
            quantity: excessToRemove,
            condition: card.condition,
            foil: card.foil,
            price: card.price ?? 0,
            image: card.image ?? '',
            cmc: card.cmc,
            type_line: card.type_line,
            colors: card.colors,
        })

        if (!wishCardId) return

        const updatePromises: Promise<void>[] = []

        for (const deck of decks.value) {
            if (!deck.allocations || excessToRemove <= 0) continue

            const alloc = deck.allocations.find(a => a.cardId === card.id)
            if (!alloc) continue

            const toConvert = Math.min(alloc.quantity, excessToRemove)
            if (toConvert <= 0) continue

            // Reduce owned allocation
            alloc.quantity -= toConvert
            excessToRemove -= toConvert

            // Add allocation pointing to wishlist card
            const existingWishAlloc = deck.allocations.find(
                a => a.cardId === wishCardId && a.isInSideboard === alloc.isInSideboard
            )
            if (existingWishAlloc) {
                existingWishAlloc.quantity += toConvert
            } else {
                deck.allocations.push(removeUndefined({
                    cardId: wishCardId,
                    quantity: toConvert,
                    isInSideboard: alloc.isInSideboard,
                    notes: alloc.notes,
                    addedAt: new Date(),
                }))
            }

            // Remove allocation if quantity is 0
            if (alloc.quantity <= 0) {
                deck.allocations = deck.allocations.filter(a => a.cardId !== card.id || a.isInSideboard !== alloc.isInSideboard)
            }

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Queue Firestore update (parallel)
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deck.id)
            updatePromises.push(
                updateDoc(deckRef, {
                    allocations: deck.allocations,
                    wishlist: deck.wishlist || [],
                    stats: deck.stats,
                    updatedAt: Timestamp.now(),
                }).catch((error: unknown) => {
                    console.error(`Error reducing allocations for deck ${deck.name}:`, error)
                })
            )
        }

        // Execute all updates in parallel
        await Promise.all(updatePromises)
    }

    /**
     * Convert a card's allocations to wishlist when card is deleted from collection
     * Called by collection store when a card is deleted
     */
    const convertAllocationsToWishlist = async (deletedCard: Card): Promise<void> => {
        if (!authStore.user?.id) return

        const collectionStore = useCollectionStore()

        // Collect total wishlist quantity needed across all decks
        let totalWishlistQty = 0
        const decksWithAllocs: { deck: Deck; allocs: DeckCardAllocation[] }[] = []

        for (const deck of decks.value) {
            if (!deck.allocations) continue
            const allocsToConvert = deck.allocations.filter(a => a.cardId === deletedCard.id)
            if (allocsToConvert.length === 0) continue
            decksWithAllocs.push({ deck, allocs: allocsToConvert })
            for (const alloc of allocsToConvert) {
                totalWishlistQty += alloc.quantity
            }
        }

        if (totalWishlistQty === 0) return

        // Create a single wishlist card in collection for the total quantity
        const wishCardId = await collectionStore.ensureCollectionWishlistCard({
            scryfallId: deletedCard.scryfallId,
            name: deletedCard.name,
            edition: deletedCard.edition,
            quantity: totalWishlistQty,
            condition: deletedCard.condition,
            foil: deletedCard.foil,
            price: deletedCard.price ?? 0,
            image: deletedCard.image ?? '',
            cmc: deletedCard.cmc,
            type_line: deletedCard.type_line,
            colors: deletedCard.colors,
        })

        if (!wishCardId) return

        // Re-point allocations to the new wishlist card
        const updatePromises: Promise<void>[] = []

        for (const { deck, allocs } of decksWithAllocs) {
            // Remove old allocations pointing to deleted card
            deck.allocations = deck.allocations.filter(a => a.cardId !== deletedCard.id)

            // Add new allocations pointing to wishlist card
            for (const alloc of allocs) {
                const existingWishAlloc = deck.allocations.find(
                    a => a.cardId === wishCardId && a.isInSideboard === alloc.isInSideboard
                )
                if (existingWishAlloc) {
                    existingWishAlloc.quantity += alloc.quantity
                } else {
                    deck.allocations.push(removeUndefined({
                        cardId: wishCardId,
                        quantity: alloc.quantity,
                        isInSideboard: alloc.isInSideboard,
                        notes: alloc.notes,
                        addedAt: new Date(),
                    }))
                }
            }

            // Recalculate stats
            deck.stats = calculateStats(deck.allocations, deck.wishlist || [], collectionStore.cards)
            deck.updatedAt = new Date()

            // Queue Firestore update (parallel)
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deck.id)
            updatePromises.push(
                updateDoc(deckRef, {
                    allocations: deck.allocations,
                    wishlist: deck.wishlist || [],
                    stats: deck.stats,
                    updatedAt: Timestamp.now(),
                }).catch((error: unknown) => {
                    console.error(`Error converting allocations for deck ${deck.name}:`, error)
                })
            )
        }

        // Execute all updates in parallel
        await Promise.all(updatePromises)
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    const clear = () => {
        decks.value = []
        currentDeck.value = null
    }

    /**
     * Delete all decks for current user
     */
    const deleteAllDecks = async (): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const decksRef = collection(db, 'users', authStore.user.id, 'decks')
            const snapshot = await getDocs(decksRef)

            // Delete all deck documents
            await Promise.all(snapshot.docs.map(docSnap => deleteDoc(docSnap.ref)))

            decks.value = []
            currentDeck.value = null

            return true
        } catch (error) {
            console.error('Error deleting all decks:', error)
            return false
        }
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
        deleteAllDecks,
        toggleCommander,

        // Allocation operations
        allocateCardToDeck,
        bulkAllocateCardsToDeck,
        addToWishlist,
        deallocateCard,
        removeFromWishlist,
        updateAllocation,
        reduceAllocationsForCard,
        convertAllocationsToWishlist,

        // Hydration
        getTotalAllocatedForCard,

        // Stats
        calculateStats,

        // Cleanup
        clear,
    }
})
