import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Card } from '../types/card'

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore()
    const _cards = ref<Card[]>([])
    const loading = ref(false)

    const cards = computed(() => _cards.value)

    /**
     * CARGAR colección desde Firestore
     * Ruta: users/{userId}/cards/{cardId}
     */
    const loadCollection = async () => {
        if (!authStore.user?.id) {
            console.warn('⚠️ No user logged in')
            return
        }

        loading.value = true
        try {
            const cardsRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(cardsRef)

            _cards.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as Card[]

            console.log(`✅ Loaded ${_cards.value.length} cards for user ${authStore.user.id}`)

        } catch (error) {
            console.error('❌ Error loading collection:', error)
            _cards.value = []
        } finally {
            loading.value = false
        }
    }

    /**
     * AGREGAR una carta a la colección
     */
    const addCard = async (cardData: Omit<Card, 'id'>) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const cardsRef = collection(db, 'users', authStore.user.id, 'cards')
            const docRef = await addDoc(cardsRef, {
                ...cardData,
                createdAt: new Date().toISOString(),
            })

            const newCard = { id: docRef.id, ...cardData } as Card
            _cards.value.push(newCard)

            console.log('✅ Card added:', cardData.name)
            return newCard
        } catch (error) {
            console.error('❌ Error adding card:', error)
            throw error
        }
    }

    /**
     * ACTUALIZAR una carta
     */
    const updateCard = async (cardId: string, updates: Partial<Card>) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await updateDoc(cardRef, updates)

            const index = _cards.value.findIndex(c => c.id === cardId)
            if (index >= 0) {
                _cards.value[index] = { ..._cards.value[index], ...updates }
            }

            console.log('✅ Card updated:', cardId)
        } catch (error) {
            console.error('❌ Error updating card:', error)
            throw error
        }
    }

    /**
     * ELIMINAR una carta
     */
    const deleteCard = async (cardId: string) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId)
            await deleteDoc(cardRef)

            _cards.value = _cards.value.filter(c => c.id !== cardId)
            console.log('✅ Card deleted:', cardId)
        } catch (error) {
            console.error('❌ Error deleting card:', error)
            throw error
        }
    }

    /**
     * LIMPIAR estado local (logout)
     */
    const clear = () => {
        _cards.value = []
    }

    return {
        cards,
        loading,
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
        clear,
    }
})