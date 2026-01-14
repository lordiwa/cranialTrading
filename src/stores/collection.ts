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
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { Card, CardCondition, CardStatus } from '../types/card'

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    const cards = ref<Card[]>([])
    const loading = ref(false)

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
            toastStore.show('Error al cargar colección', 'error')
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

            console.log(`✅ Carta agregada: ${cardData.name}`)
            return docRef.id
        } catch (error) {
            console.error('Error adding card:', error)
            toastStore.show('Error al agregar carta', 'error')
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
            }

            console.log(`✅ Carta actualizada: ${cardId}`)
            return true
        } catch (error) {
            console.error('Error updating card:', error)
            toastStore.show('Error al actualizar carta', 'error')
            return false
        }
    }

    /**
     * Delete a single card from collection
     * Note: The decks store should be notified to convert allocations to wishlist
     * This is handled by the caller (usually via useCardAllocation or decks store)
     */
    const deleteCard = async (cardId: string): Promise<boolean> => {
        if (!authStore.user) return false

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await deleteDoc(cardRef)

            cards.value = cards.value.filter((c) => c.id !== cardId)
            console.log(`✅ Carta eliminada: ${cardId}`)
            return true
        } catch (error) {
            console.error('Error deleting card:', error)
            toastStore.show('Error al eliminar carta', 'error')
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
            toastStore.show('Todas las cartas fueron eliminadas', 'success')
            return true
        } catch (error) {
            console.error('Error deleting all cards:', error)
            toastStore.show('Error al eliminar cartas', 'error')
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
     * Batch import cards
     */
    const confirmImport = async (cardsToSave: Omit<Card, 'id'>[]): Promise<boolean> => {
        if (!authStore.user) return false

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const batchAdds: Promise<any>[] = []

            for (const card of cardsToSave) {
                // Remove any local id before saving
                const { id, ...cardWithoutId } = card as any
                batchAdds.push(
                    addDoc(colRef, {
                        ...cardWithoutId,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    })
                )
            }

            await Promise.all(batchAdds)
            await loadCollection()
            toastStore.show(`${cardsToSave.length} cartas importadas`, 'success')
            return true
        } catch (error) {
            console.error('Error importing cards:', error)
            toastStore.show('Error al importar cartas', 'error')
            return false
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

        // Core operations
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
        deleteAllCards,

        // Search
        getCardById,
        findCards,
        findExactMatch,

        // Import
        confirmImport,

        // Computed
        totalCards,
        totalValue,
        cardsByStatus,

        // Cleanup
        clear,
    }
})
