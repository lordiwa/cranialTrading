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
import { Deck, DeckCard, CreateDeckInput, DeckStats } from '../types/deck'

export const useDecksStore = defineStore('decks', () => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    // State
    const decks = ref<Deck[]>([])
    const loading = ref(false)
    const currentDeck = ref<Deck | null>(null)

    // Computed
    const totalDecks = computed(() => decks.value.length)

    /**
     * Calcular stats de un deck
     */
    const calculateStats = (mainboard: DeckCard[], sideboard: DeckCard[]): DeckStats => {
        const allCards = [...mainboard, ...sideboard]
        const totalCards = allCards.reduce((sum, c) => sum + c.quantity, 0)
        const sideboardCards = sideboard.reduce((sum, c) => sum + c.quantity, 0)
        const totalPrice = allCards.reduce((sum, c) => sum + (c.price * c.quantity), 0)
        const avgPrice = allCards.length > 0 ? totalPrice / allCards.length : 0

        return {
            totalCards,
            sideboardCards,
            avgPrice,  // ✅ CAMBIÉ: era avgCardPrice
            totalPrice,
            completionPercentage: 0, // Se calculará en Fase 3 vs colección
        }
    }

    /**
     * CARGAR todos los decks del usuario
     */
    const loadDecks = async () => {
        if (!authStore.user?.id) return

        loading.value = true
        try {
            const decksRef = collection(db, 'users', authStore.user.id, 'decks')
            const snapshot = await getDocs(decksRef)

            decks.value = snapshot.docs.map(doc => {
                const data = doc.data()
                return {
                    id: doc.id,
                    userId: authStore.user!.id,
                    name: data.name,
                    format: data.format,
                    description: data.description,
                    colors: data.colors || [],
                    mainboard: data.mainboard || [],
                    sideboard: data.sideboard || [],
                    thumbnail: data.thumbnail || '',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                    isPublic: data.isPublic || false,
                    stats: data.stats || calculateStats(data.mainboard || [], data.sideboard || []),
                } as Deck
            })

            console.log(`✅ ${decks.value.length} decks cargados`)
        } catch (error) {
            console.error('Error loading decks:', error)
            toastStore.show('Error al cargar decks', 'error')
        } finally {
            loading.value = false
        }
    }

    /**
     * CREAR nuevo deck
     */
    const createDeck = async (input: CreateDeckInput): Promise<string | null> => {
        if (!authStore.user?.id) return null

        loading.value = true
        try {
            const decksRef = collection(db, 'users', authStore.user.id, 'decks')

            const stats = calculateStats([], [])

            const docRef = await addDoc(decksRef, {
                name: input.name,
                format: input.format,
                description: input.description,
                colors: input.colors,
                mainboard: [],
                sideboard: [],
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
                mainboard: [],
                sideboard: [],
                thumbnail: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                isPublic: false,
                stats,
            }

            decks.value.push(newDeck)
            currentDeck.value = newDeck
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
     * CARGAR un deck específico
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
            const deck: Deck = {
                id: docSnap.id,
                userId: authStore.user.id,
                name: data.name,
                format: data.format,
                description: data.description,
                colors: data.colors || [],
                mainboard: data.mainboard || [],
                sideboard: data.sideboard || [],
                thumbnail: data.thumbnail || '',
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                isPublic: data.isPublic || false,
                stats: data.stats || calculateStats(data.mainboard || [], data.sideboard || []),
            }

            currentDeck.value = deck
            return deck
        } catch (error) {
            console.error('Error loading deck:', error)
            toastStore.show('Error al cargar deck', 'error')
            return null
        }
    }

    /**
     * AGREGAR carta al mainboard
     */
    const addCardToMainboard = async (deckId: string, card: DeckCard): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            // Agregar a mainboard
            deck.mainboard.push(card)

            // Recalcular stats
            deck.stats = calculateStats(deck.mainboard, deck.sideboard)
            deck.updatedAt = new Date()

            // Guardar en Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                mainboard: deck.mainboard,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = deck
            }

            console.log(`✅ Carta agregada al mainboard: ${card.name}`)
            return true
        } catch (error) {
            console.error('Error adding card to mainboard:', error)
            toastStore.show('Error al agregar carta', 'error')
            return false
        }
    }

    /**
     * AGREGAR carta al sideboard
     */
    const addCardToSideboard = async (deckId: string, card: DeckCard): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            // Agregar a sideboard
            card.isInSideboard = true
            deck.sideboard.push(card)

            // Recalcular stats
            deck.stats = calculateStats(deck.mainboard, deck.sideboard)
            deck.updatedAt = new Date()

            // Guardar en Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                sideboard: deck.sideboard,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = deck
            }

            console.log(`✅ Carta agregada al sideboard: ${card.name}`)
            return true
        } catch (error) {
            console.error('Error adding card to sideboard:', error)
            toastStore.show('Error al agregar carta al sideboard', 'error')
            return false
        }
    }

    /**
     * ELIMINAR carta del deck
     */
    const removeCard = async (deckId: string, cardId: string, isFromSideboard: boolean): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            if (isFromSideboard) {
                deck.sideboard = deck.sideboard.filter(c => c.id !== cardId)
            } else {
                deck.mainboard = deck.mainboard.filter(c => c.id !== cardId)
            }

            // Recalcular stats
            deck.stats = calculateStats(deck.mainboard, deck.sideboard)
            deck.updatedAt = new Date()

            // Guardar en Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                mainboard: deck.mainboard,
                sideboard: deck.sideboard,
                stats: deck.stats,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = deck
            }

            console.log(`✅ Carta eliminada del deck`)
            return true
        } catch (error) {
            console.error('Error removing card:', error)
            toastStore.show('Error al eliminar carta', 'error')
            return false
        }
    }

    /**
     * ACTUALIZAR información del deck
     */
    const updateDeck = async (deckId: string, updates: Partial<Deck>): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const deck = decks.value.find(d => d.id === deckId)
            if (!deck) return false

            Object.assign(deck, updates)
            deck.updatedAt = new Date()

            // Guardar en Firestore
            const deckRef = doc(db, 'users', authStore.user.id, 'decks', deckId)
            await updateDoc(deckRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            })

            if (currentDeck.value?.id === deckId) {
                currentDeck.value = deck
            }

            console.log(`✅ Deck actualizado: ${updates.name || deckId}`)
            return true
        } catch (error) {
            console.error('Error updating deck:', error)
            toastStore.show('Error al actualizar deck', 'error')
            return false
        }
    }

    /**
     * ELIMINAR deck completo
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

            toastStore.show('✓ Deck eliminado', 'success')
            return true
        } catch (error) {
            console.error('Error deleting deck:', error)
            toastStore.show('Error al eliminar deck', 'error')
            return false
        }
    }

    /**
     * LIMPIAR estado (logout)
     */
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

        // Methods
        loadDecks,
        createDeck,
        loadDeck,
        addCardToMainboard,
        addCardToSideboard,
        removeCard,
        updateDeck,
        deleteDeck,
        clear,
    }
})