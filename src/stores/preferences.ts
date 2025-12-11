import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Preference } from '../types/preferences'

export const usePreferencesStore = defineStore('preferences', () => {
    const authStore = useAuthStore()
    const _preferences = ref<Preference[]>([])
    const loading = ref(false)

    const preferences = computed(() => _preferences.value)

    /**
     * CARGAR preferencias desde Firestore
     * Ruta: users/{userId}/preferencias/{preferenceId}
     */
    const loadPreferences = async () => {
        if (!authStore.user?.id) {
            console.warn('⚠️ No user logged in')
            return
        }

        loading.value = true
        try {
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferencias')
            const snapshot = await getDocs(prefsRef)

            _preferences.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as Preference[]

            console.log(`✅ Loaded ${_preferences.value.length} preferences for user ${authStore.user.id}`)

        } catch (error) {
            console.error('❌ Error loading preferences:', error)
            _preferences.value = []
        } finally {
            loading.value = false
        }
    }

    /**
     * AGREGAR una preferencia
     */
    const addPreference = async (prefData: Omit<Preference, 'id'>) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferencias')
            const docRef = await addDoc(prefsRef, {
                ...prefData,
                createdAt: new Date().toISOString(),
            })

            const newPref = { id: docRef.id, ...prefData } as Preference
            _preferences.value.push(newPref)

            console.log('✅ Preference added:', prefData.name)
            return newPref
        } catch (error) {
            console.error('❌ Error adding preference:', error)
            throw error
        }
    }

    /**
     * ACTUALIZAR una preferencia
     */
    const updatePreference = async (prefId: string, updates: Partial<Preference>) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferencias', prefId)
            await updateDoc(prefRef, updates)

            const index = _preferences.value.findIndex(p => p.id === prefId)
            if (index >= 0) {
                _preferences.value[index] = { ..._preferences.value[index], ...updates }
            }

            console.log('✅ Preference updated:', prefId)
        } catch (error) {
            console.error('❌ Error updating preference:', error)
            throw error
        }
    }

    /**
     * ELIMINAR una preferencia
     */
    const deletePreference = async (prefId: string) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferencias', prefId)
            await deleteDoc(prefRef)

            _preferences.value = _preferences.value.filter(p => p.id !== prefId)
            console.log('✅ Preference deleted:', prefId)
        } catch (error) {
            console.error('❌ Error deleting preference:', error)
            throw error
        }
    }

    /**
     * LIMPIAR estado local (logout)
     */
    const clear = () => {
        _preferences.value = []
    }

    return {
        preferences,
        loading,
        loadPreferences,
        addPreference,
        updatePreference,
        deletePreference,
        clear,
    }
})