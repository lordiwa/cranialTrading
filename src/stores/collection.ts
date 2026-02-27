import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    Timestamp,
    updateDoc,
    writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { type Card, type CardCondition, type CardStatus } from '../types/card'
import {
    removeCardFromPublic,
    syncAllUserCards,
    syncAllUserPreferences,
    syncCardToPublic,
} from '../services/publicCards'
import { t } from '../composables/useI18n'

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    const cards = ref<Card[]>([])
    const loading = ref(false)
    const lastSyncAt = ref<Date | null>(null)

    // Helper to get user info for public sync
    const getUserInfo = () => {
        if (!authStore.user) return null
        return {
            userId: authStore.user.id,
            username: authStore.user.username || authStore.user.email?.split('@')[0] || 'Unknown',
            location: authStore.user.location,
            email: authStore.user.email,
            avatarUrl: authStore.user.avatarUrl,
        }
    }

    // ========================================================================
    // CORE OPERATIONS
    // ========================================================================

    /**
     * Load all cards for current user
     */
    const loadCollection = async () => {
        if (!authStore.user) return
        loading.value = true

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(colRef)

            cards.value = snapshot.docs.map((doc) => ({
                ...doc.data(),
                id: doc.id,
                updatedAt: doc.data().updatedAt?.toDate() || new Date(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
            })) as Card[]

        } catch (error) {
            console.error('Error loading collection:', error)
            toastStore.show(t('collection.messages.loadError'), 'error')
        } finally {
            loading.value = false
        }
    }

    /**
     * Add a new card to collection
     */
    const addCard = async (cardData: Omit<Card, 'id' | 'updatedAt'>): Promise<string | null> => {
        if (!authStore.user) return null
        loading.value = true

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const docRef = await addDoc(colRef, {
                ...cardData,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            })

            const newCard: Card = {
                id: docRef.id,
                ...cardData,
                updatedAt: new Date(),
                createdAt: new Date(),
            }
            cards.value.push(newCard)

            // Sync to public collection (non-blocking)
            const userInfo = getUserInfo()
            if (userInfo) {
                syncCardToPublic(newCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                    .catch((err: unknown) => { console.error('[PublicSync] Error syncing card:', err); })
            }

            return docRef.id
        } catch (error) {
            console.error('Error adding card:', error)
            toastStore.show(t('collection.messages.addError'), 'error')
            return null
        } finally {
            loading.value = false
        }
    }

    /**
     * Update card details
     * Note: Decks reference cards by ID, so updates automatically reflect everywhere
     */
    const updateCard = async (cardId: string, updates: Partial<Card>): Promise<boolean> => {
        if (!authStore.user) return false

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await updateDoc(cardRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            })

            const index = cards.value.findIndex((c) => c.id === cardId)
            const existingCard = cards.value[index]
            if (index > -1 && existingCard) {
                const updatedCard = {
                    ...existingCard,
                    ...updates,
                    updatedAt: new Date(),
                }
                cards.value[index] = updatedCard

                // Sync to public collection (non-blocking)
                const userInfo = getUserInfo()
                if (userInfo) {
                    syncCardToPublic(updatedCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                        .catch((err: unknown) => { console.error('[PublicSync] Error syncing card update:', err); })
                }
            }

            return true
        } catch (error) {
            console.error('Error updating card:', error)
            toastStore.show(t('collection.messages.updateError'), 'error')
            return false
        }
    }

    /**
     * Batch update multiple cards at once (more efficient than individual updates)
     * Uses Firestore writeBatch for atomic operations (max 500 per batch)
     */
    const batchUpdateCards = async (cardIds: string[], updates: Partial<Card>): Promise<boolean> => {
        if (!authStore.user || cardIds.length === 0) return false

        try {
            // Firestore batches have a limit of 500 operations
            const BATCH_SIZE = 500
            const chunks = []
            for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
                chunks.push(cardIds.slice(i, i + BATCH_SIZE))
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db)

                for (const cardId of chunk) {
                    const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
                    batch.update(cardRef, {
                        ...updates,
                        updatedAt: Timestamp.now(),
                    })
                }

                await batch.commit()
            }

            // Update local state
            const userInfo = getUserInfo()
            for (const cardId of cardIds) {
                const index = cards.value.findIndex((c) => c.id === cardId)
                const existingCard = cards.value[index]
                if (index > -1 && existingCard) {
                    const updatedCard = {
                        ...existingCard,
                        ...updates,
                        updatedAt: new Date(),
                    }
                    cards.value[index] = updatedCard

                    // Sync to public collection (non-blocking)
                    if (userInfo) {
                        syncCardToPublic(updatedCard, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                            .catch((err: unknown) => { console.error('[PublicSync] Error syncing card update:', err); })
                    }
                }
            }

            return true
        } catch (error) {
            console.error('Error batch updating cards:', error)
            toastStore.show(t('collection.messages.batchUpdateError'), 'error')
            return false
        }
    }

    /**
     * Delete a single card from collection (optimistic UI)
     * Removes from UI immediately, then syncs with Firebase in background
     * If Firebase fails, restores the card and shows error
     */
    const deleteCard = async (cardId: string): Promise<boolean> => {
        if (!authStore.user) return false

        // Find and remove card optimistically (immediate UI update)
        const cardIndex = cards.value.findIndex(c => c.id === cardId)
        const deletedCard = cards.value[cardIndex]
        if (cardIndex === -1 || !deletedCard) return false

        cards.value.splice(cardIndex, 1)

        // Sync with Firebase in background
        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await deleteDoc(cardRef)

            // Remove from public collection (non-blocking)
            removeCardFromPublic(cardId, authStore.user.id)
                .catch((err: unknown) => { console.error('[PublicSync] Error removing card:', err); })

            return true
        } catch (error) {
            // Restore card on failure
            console.error('Error deleting card:', error)
            cards.value.splice(cardIndex, 0, deletedCard)
            toastStore.show(t('collection.messages.deleteError'), 'error')
            return false
        }
    }

    /**
     * Delete ALL cards for current user
     */
    const deleteAllCards = async (): Promise<boolean> => {
        if (!authStore.user) return false

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(colRef)

            // Use writeBatch for efficient bulk deletion (max 500 per batch)
            const BATCH_SIZE = 500
            const docs = snapshot.docs
            for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                const chunk = docs.slice(i, i + BATCH_SIZE)
                const batch = writeBatch(db)
                for (const d of chunk) {
                    batch.delete(doc(db, 'users', authStore.user.id, 'cards', d.id))
                }
                await batch.commit()
            }

            cards.value = []
            toastStore.show(t('collection.messages.allDeleted'), 'success')
            return true
        } catch (error) {
            console.error('Error deleting all cards:', error)
            toastStore.show(t('collection.messages.deleteAllError'), 'error')
            return false
        }
    }

    /**
     * Delete multiple cards efficiently using Firestore batch
     * Optimistic UI: removes from UI immediately, then syncs with Firebase
     */
    const batchDeleteCards = async (cardIds: string[], onProgress?: (percent: number) => void): Promise<{ success: boolean; deleted: number; failed: number }> => {
        if (!authStore.user || cardIds.length === 0) return { success: true, deleted: 0, failed: 0 }

        // Save cards for potential restore on error
        const idsToDelete = new Set(cardIds)
        const deletedCards: Card[] = []

        // Remove from UI in ONE operation (single reactive trigger instead of N splices)
        const remaining: Card[] = []
        for (const card of cards.value) {
            if (idsToDelete.has(card.id)) {
                deletedCards.push(card)
            } else {
                remaining.push(card)
            }
        }
        cards.value = remaining

        const BATCH_SIZE = 200
        const MAX_RETRIES = 2
        const userId = authStore.user.id
        let totalDeleted = 0
        let totalFailed = 0

        // Only sale/trade cards exist in public_cards
        const publicCardIds = deletedCards
            .filter(card => card.status === 'sale' || card.status === 'trade')
            .map(card => card.id)

        const totalBatches = Math.ceil(cardIds.length / BATCH_SIZE) + Math.ceil(publicCardIds.length / BATCH_SIZE)
        let completedBatches = 0

        // Helper: commit a batch with retry logic (skips retries for permission errors)
        const commitWithRetry = async (batchFn: () => ReturnType<typeof writeBatch>): Promise<boolean> => {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const batch = batchFn()
                    await batch.commit()
                    return true
                } catch (error: unknown) {
                    console.warn(`Batch commit failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, error)
                    // Don't retry permission errors — they'll never succeed
                    const msg = error instanceof Error ? error.message : String(error)
                    if (msg.includes('permission') || msg.includes('Permission')) {
                        return false
                    }
                    if (attempt < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                }
            }
            return false
        }

        // Phase 1: Delete user cards in batches
        for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
            const chunk = cardIds.slice(i, i + BATCH_SIZE)

            const ok = await commitWithRetry(() => {
                const batch = writeBatch(db)
                for (const cardId of chunk) {
                    batch.delete(doc(db, 'users', userId, 'cards', cardId))
                }
                return batch
            })

            if (ok) {
                totalDeleted += chunk.length
            } else {
                totalFailed += chunk.length
            }

            completedBatches++
            if (onProgress) onProgress(Math.round((completedBatches / totalBatches) * 100))

            if (i + BATCH_SIZE < cardIds.length) {
                await new Promise(resolve => setTimeout(resolve, 200))
            }
        }

        // Phase 2: Delete from public_cards using writeBatch (only sale/trade)
        // If first batch fails (e.g. permission error), skip remaining batches
        let publicCardsBlocked = false
        for (let i = 0; i < publicCardIds.length; i += BATCH_SIZE) {
            if (!publicCardsBlocked) {
                const chunk = publicCardIds.slice(i, i + BATCH_SIZE)
                const ok = await commitWithRetry(() => {
                    const batch = writeBatch(db)
                    for (const cardId of chunk) {
                        batch.delete(doc(db, 'public_cards', `${userId}_${cardId}`))
                    }
                    return batch
                })
                if (!ok) {
                    console.warn(`Failed to delete public_cards batch — skipping remaining public_cards cleanup`)
                    publicCardsBlocked = true
                }
            }

            completedBatches++
            if (onProgress) onProgress(Math.round((completedBatches / totalBatches) * 100))

            if (!publicCardsBlocked && i + BATCH_SIZE < publicCardIds.length) {
                await new Promise(resolve => setTimeout(resolve, 200))
            }
        }

        if (totalFailed > 0) {
            console.warn(`Batch delete: ${totalDeleted} deleted, ${totalFailed} failed`)
        }

        return { success: totalFailed === 0, deleted: totalDeleted, failed: totalFailed }
    }

    // ========================================================================
    // SEARCH / FIND OPERATIONS
    // ========================================================================

    /**
     * Find a card by ID
     */
    const getCardById = (cardId: string): Card | undefined => {
        return cards.value.find(c => c.id === cardId)
    }

    // ========================================================================
    // WISHLIST SYNC (Collection ↔ Deck)
    // ========================================================================

    /**
     * Ensure a wishlist card exists in collection for deck sync.
     * If a matching wishlist card exists (same scryfallId + edition + condition + foil),
     * increments its quantity. Otherwise creates a new card with status='wishlist'.
     * Returns the card ID.
     */
    const ensureCollectionWishlistCard = async (cardData: {
        scryfallId: string
        name: string
        edition: string
        setCode?: string
        quantity: number
        condition: CardCondition
        foil: boolean
        price: number
        image: string
        cmc?: number
        type_line?: string
        colors?: string[]
    }): Promise<string | null> => {
        // Look for existing wishlist card with same identity
        const existing = cards.value.find(c =>
            c.status === 'wishlist' &&
            c.scryfallId === cardData.scryfallId &&
            c.edition === cardData.edition &&
            c.condition === cardData.condition &&
            c.foil === cardData.foil
        )

        if (existing) {
            // Increment quantity on existing wishlist card
            const ok = await updateCard(existing.id, {
                quantity: existing.quantity + cardData.quantity,
            })
            return ok ? existing.id : null
        }

        // Create new wishlist card — strip undefined fields (Firestore rejects them)
        const newCard: Omit<Card, 'id' | 'updatedAt'> = {
            scryfallId: cardData.scryfallId,
            name: cardData.name,
            edition: cardData.edition,
            quantity: cardData.quantity,
            condition: cardData.condition,
            foil: cardData.foil,
            price: cardData.price,
            image: cardData.image,
            status: 'wishlist' as CardStatus,
        }
        if (cardData.setCode !== undefined) newCard.setCode = cardData.setCode
        if (cardData.cmc !== undefined) newCard.cmc = cardData.cmc
        if (cardData.type_line !== undefined) newCard.type_line = cardData.type_line
        if (cardData.colors !== undefined) newCard.colors = cardData.colors
        return addCard(newCard)
    }

    // ========================================================================
    // IMPORT OPERATIONS (Legacy - simplified)
    // ========================================================================

    /**
     * Batch import cards - returns array of created card IDs
     */
    const confirmImport = async (cardsToSave: Omit<Card, 'id'>[], silent = false): Promise<string[]> => {
        if (!authStore.user) return []

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')

            // Process in batches of 50 to avoid overwhelming Firestore
            const BATCH_SIZE = 50
            const createdIds: string[] = []
            let failCount = 0

            for (let i = 0; i < cardsToSave.length; i += BATCH_SIZE) {
                const batch = cardsToSave.slice(i, i + BATCH_SIZE)
                const addPromises = batch.map(async card => {
                    const { id: _id, ...cardWithoutId } = card as any
                    // Strip undefined values that Firestore rejects
                    const cleanData: Record<string, any> = {}
                    for (const [key, value] of Object.entries(cardWithoutId)) {
                        if (value !== undefined) cleanData[key] = value
                    }
                    return addDoc(colRef, {
                        ...cleanData,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    })
                })

                const results = await Promise.allSettled(addPromises)
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        createdIds.push(result.value.id)
                    } else {
                        failCount++
                        console.error('Error saving card:', result.reason)
                    }
                }

                // Throttle between batches to avoid exhausting Firestore write stream
                if (i + BATCH_SIZE < cardsToSave.length) {
                    await new Promise(resolve => setTimeout(resolve, 200))
                }
            }

            await loadCollection()
            if (!silent) {
                if (failCount > 0) {
                    toastStore.show(t('collection.messages.imported', { count: createdIds.length }) + ` (${failCount} fallaron)`, 'info')
                } else {
                    toastStore.show(t('collection.messages.imported', { count: createdIds.length }), 'success')
                }
            }
            return createdIds
        } catch (error) {
            console.error('Error importing cards:', error)
            toastStore.show(t('collection.messages.importError'), 'error')
            return []
        }
    }

    // ========================================================================
    // PUBLIC SYNC OPERATIONS
    // ========================================================================

    /**
     * Bulk sync all cards to public collection
     * - sale/trade cards → public_cards (lo que VENDO)
     * - wishlist cards → public_preferences (lo que BUSCO)
     */
    const syncAllToPublic = async (): Promise<void> => {
        const userInfo = getUserInfo()
        if (!userInfo) return

        try {
            // Reload collection first to get latest statuses
            await loadCollection()

            // Sync sale/trade cards to public_cards
            await syncAllUserCards(
                cards.value,
                userInfo.userId,
                userInfo.username,
                userInfo.location,
                userInfo.email,
                userInfo.avatarUrl
            )

            // Sync wishlist cards to public_preferences (lo que BUSCO)
            const wishlistCards = cards.value.filter(c => c.status === 'wishlist')

            // Convert wishlist cards to preference format
            const wishlistAsPrefs = wishlistCards.map(c => ({
                id: c.id,
                cardName: c.name,
                scryfallId: c.scryfallId,
                name: c.name,
            }))

            await syncAllUserPreferences(
                wishlistAsPrefs,
                userInfo.userId,
                userInfo.username,
                userInfo.location,
                userInfo.email,
                userInfo.avatarUrl
            )

            lastSyncAt.value = new Date()
            toastStore.show(t('collection.messages.synced'), 'success')
        } catch (error) {
            console.error('[PublicSync] Error bulk syncing cards:', error)
            toastStore.show(t('collection.messages.syncError'), 'error')
        }
    }

    // ========================================================================
    // COMPUTED
    // ========================================================================

    const totalCards = computed(() => cards.value.length)

    const totalValue = computed(() =>
        cards.value.reduce((sum, card) => sum + (card.price * card.quantity), 0)
    )

    // ========================================================================
    // CLEANUP
    // ========================================================================

    const clear = () => {
        cards.value = []
    }

    return {
        // State
        cards,
        loading,
        lastSyncAt,

        // Core operations
        loadCollection,
        addCard,
        updateCard,
        batchUpdateCards,
        deleteCard,
        deleteAllCards,
        batchDeleteCards,

        // Search
        getCardById,

        // Wishlist sync
        ensureCollectionWishlistCard,

        // Import
        confirmImport,

        // Public sync
        syncAllToPublic,

        // Computed
        totalCards,
        totalValue,

        // Cleanup
        clear,
    }
})
