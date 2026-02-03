import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    doc,
    Timestamp,
    writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { Card, CardCondition, CardStatus } from '../types/card'
import {
    syncCardToPublic,
    removeCardFromPublic,
    syncAllUserCards,
    syncAllUserPreferences,
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

            console.log(`✅ ${cards.value.length} cartas cargadas en colección`)
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
                    .catch(err => console.error('[PublicSync] Error syncing card:', err))
            }

            console.log(`✅ Carta agregada: ${cardData.name}`)
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
            if (index > -1) {
                cards.value[index] = {
                    ...cards.value[index],
                    ...updates,
                    updatedAt: new Date(),
                }

                // Sync to public collection (non-blocking)
                const userInfo = getUserInfo()
                if (userInfo) {
                    syncCardToPublic(cards.value[index], userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                        .catch(err => console.error('[PublicSync] Error syncing card update:', err))
                }
            }

            console.log(`✅ Carta actualizada: ${cardId}`)
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
                    const cardRef = doc(db, 'users', authStore.user!.id, 'cards', cardId)
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
                if (index > -1) {
                    cards.value[index] = {
                        ...cards.value[index],
                        ...updates,
                        updatedAt: new Date(),
                    }

                    // Sync to public collection (non-blocking)
                    if (userInfo) {
                        syncCardToPublic(cards.value[index], userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                            .catch(err => console.error('[PublicSync] Error syncing card update:', err))
                    }
                }
            }

            console.log(`✅ ${cardIds.length} cartas actualizadas en batch`)
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
        if (cardIndex === -1) return false

        const deletedCard = cards.value[cardIndex]
        cards.value.splice(cardIndex, 1)

        // Sync with Firebase in background
        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await deleteDoc(cardRef)

            // Remove from public collection (non-blocking)
            removeCardFromPublic(cardId, authStore.user.id)
                .catch(err => console.error('[PublicSync] Error removing card:', err))

            console.log(`✅ Carta eliminada: ${cardId}`)
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

            const batchDeletes: Promise<void>[] = []
            snapshot.docs.forEach((d) => {
                const cardRef = doc(db, 'users', authStore.user!.id, 'cards', d.id)
                batchDeletes.push(deleteDoc(cardRef))
            })

            await Promise.all(batchDeletes)
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
    const batchDeleteCards = async (cardIds: string[]): Promise<boolean> => {
        if (!authStore.user || cardIds.length === 0) return false

        // Save cards for potential restore on error
        const deletedCards: { card: Card; index: number }[] = []

        // Remove from UI immediately (optimistic)
        for (const cardId of cardIds) {
            const index = cards.value.findIndex(c => c.id === cardId)
            if (index !== -1) {
                deletedCards.push({ card: cards.value[index], index })
            }
        }

        // Sort by index descending to remove from end first (preserves indices)
        deletedCards.sort((a, b) => b.index - a.index)
        for (const { index } of deletedCards) {
            cards.value.splice(index, 1)
        }

        try {
            const BATCH_SIZE = 400
            const userId = authStore.user.id

            // Delete in batches of 400 (Firestore limit is 500)
            for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
                const batch = writeBatch(db)
                const chunk = cardIds.slice(i, i + BATCH_SIZE)

                for (const cardId of chunk) {
                    const cardRef = doc(db, 'users', userId, 'cards', cardId)
                    batch.delete(cardRef)
                }

                await batch.commit()
            }

            // Remove from public_cards collection
            await Promise.all(cardIds.map(cardId =>
                removeCardFromPublic(cardId, authStore.user!.id).catch(() => {})
            ))

            return true
        } catch (error) {
            console.error('Error batch deleting cards:', error)

            // Restore cards on error (reverse order)
            deletedCards.reverse()
            for (const { card, index } of deletedCards) {
                cards.value.splice(index, 0, card)
            }

            toastStore.show(t('collection.messages.batchDeleteError'), 'error')
            return false
        }
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

    /**
     * Find cards matching criteria
     */
    const findCards = (criteria: {
        scryfallId?: string
        name?: string
        edition?: string
        condition?: CardCondition
        foil?: boolean
    }): Card[] => {
        return cards.value.filter(card => {
            if (criteria.scryfallId && card.scryfallId !== criteria.scryfallId) return false
            if (criteria.name && !card.name.toLowerCase().includes(criteria.name.toLowerCase())) return false
            if (criteria.edition && card.edition !== criteria.edition) return false
            if (criteria.condition && card.condition !== criteria.condition) return false
            if (criteria.foil !== undefined && card.foil !== criteria.foil) return false
            return true
        })
    }

    /**
     * Find exact match for allocation purposes
     * Matches by scryfallId + edition + condition + foil
     */
    const findExactMatch = (criteria: {
        scryfallId: string
        edition: string
        condition: CardCondition
        foil: boolean
    }): Card | undefined => {
        return cards.value.find(card =>
            card.scryfallId === criteria.scryfallId &&
            card.edition === criteria.edition &&
            card.condition === criteria.condition &&
            card.foil === criteria.foil
        )
    }

    // ========================================================================
    // IMPORT OPERATIONS (Legacy - simplified)
    // ========================================================================

    /**
     * Batch import cards - returns array of created card IDs
     */
    const confirmImport = async (cardsToSave: Omit<Card, 'id'>[], silent: boolean = false): Promise<string[]> => {
        if (!authStore.user) return []

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const addPromises: Promise<any>[] = []

            for (const card of cardsToSave) {
                // Remove any local id before saving
                const { id, ...cardWithoutId } = card as any
                addPromises.push(
                    addDoc(colRef, {
                        ...cardWithoutId,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    })
                )
            }

            const docRefs = await Promise.all(addPromises)
            const createdIds = docRefs.map(ref => ref.id)
            await loadCollection()
            if (!silent) {
                toastStore.show(t('collection.messages.imported', { count: cardsToSave.length }), 'success')
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
            console.log(`[PublicSync] Syncing ${cards.value.length} cards...`)

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
            console.log(`[PublicSync] Syncing ${wishlistCards.length} wishlist cards as preferences...`)

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

    const cardsByStatus = computed(() => {
        const grouped: Record<CardStatus, Card[]> = {
            collection: [],
            sale: [],
            trade: [],
            wishlist: [],
        }
        cards.value.forEach(card => {
            grouped[card.status].push(card)
        })
        return grouped
    })

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
        findCards,
        findExactMatch,

        // Import
        confirmImport,

        // Public sync
        syncAllToPublic,

        // Computed
        totalCards,
        totalValue,
        cardsByStatus,

        // Cleanup
        clear,
    }
})
