import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Preference, PreferenceType } from '../types/preferences'
import {
    syncPreferenceToPublic,
    removePreferenceFromPublic,
    syncAllUserPreferences,
} from '../services/publicCards'

export const usePreferencesStore = defineStore('preferences', () => {
    const authStore = useAuthStore()
    const _preferences = ref<Preference[]>([])
    const loading = ref(false)

    const preferences = computed(() => _preferences.value)

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

    /**
     * CARGAR preferencias desde Firestore
     * Ruta: users/{userId}/preferences/{preferenceId}
     */
    const loadPreferences = async () => {
        if (!authStore.user?.id) {
            console.warn('⚠️ No user logged in')
            return
        }

        loading.value = true
        try {
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferences')
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
    const addPreference = async (prefData: {
        scryfallId: string
        name: string
        type: PreferenceType
        quantity: number
        condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO'
        edition: string
        image: string
    }) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferences')
            const docRef = await addDoc(prefsRef, {
                ...prefData,
                createdAt: new Date().toISOString(),
            })

            const newPref = { id: docRef.id, ...prefData } as Preference
            _preferences.value.push(newPref)

            // Sync to public (non-blocking)
            const userInfo = getUserInfo()
            if (userInfo) {
                syncPreferenceToPublic(newPref, userInfo.userId, userInfo.username, userInfo.location, userInfo.email, userInfo.avatarUrl)
                    .catch(err => console.error('[PublicSync] Error syncing preference:', err))
            }

            console.log('✅ Preference added:', prefData.name)
            return newPref
        } catch (error) {
            console.error('❌ Error adding preference:', error)
            throw error
        }
    }

    /**
     * ACTUALIZAR una preferencia completa
     */
    const updatePreference = async (prefId: string, updates: Partial<Preference>) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferences', prefId)
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
     * ACTUALIZAR solo el tipo de una preferencia (VENDO/CAMBIO/BUSCO)
     * Usado cuando una carta cambia de estado entre sale/trade/wishlist
     */
    const updatePreferenceType = async (
        scryfallId: string,
        edition: string,
        newType: PreferenceType
    ) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            // Buscar la preferencia por scryfallId y edition
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferences')
            const q = query(
                prefsRef,
                where('scryfallId', '==', scryfallId),
                where('edition', '==', edition)
            )
            const snapshot = await getDocs(q)

            if (snapshot.empty) {
                console.warn(`⚠️ No preference found for ${scryfallId} (${edition})`)
                return
            }

            // Actualizar la primera coincidencia (debería haber solo una)
            const docId = snapshot.docs[0].id
            const prefRef = doc(db, 'users', authStore.user.id, 'preferences', docId)
            await updateDoc(prefRef, { type: newType })

            // Actualizar en memoria
            const index = _preferences.value.findIndex(
                p => p.scryfallId === scryfallId && p.edition === edition
            )
            if (index >= 0) {
                _preferences.value[index].type = newType
            }

            console.log(`✅ Preference type updated: ${scryfallId} → ${newType}`)
        } catch (error) {
            console.error('❌ Error updating preference type:', error)
            throw error
        }
    }

    /**
     * ELIMINAR una preferencia por ID
     */
    const deletePreference = async (prefId: string) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferences', prefId)
            await deleteDoc(prefRef)

            // Remove from public (non-blocking)
            removePreferenceFromPublic(prefId, authStore.user.id)
                .catch(err => console.error('[PublicSync] Error removing preference:', err))

            _preferences.value = _preferences.value.filter(p => p.id !== prefId)
            console.log('✅ Preference deleted:', prefId)
        } catch (error) {
            console.error('❌ Error deleting preference:', error)
            throw error
        }
    }

    /**
     * ELIMINAR preferencia por scryfallId y edition
     * Usado cuando una carta cambia de collection a otro estado
     */
    const deletePreferenceByCard = async (scryfallId: string, edition: string) => {
        if (!authStore.user?.id) throw new Error('No user logged in')

        try {
            // Buscar la preferencia por scryfallId y edition
            const prefsRef = collection(db, 'users', authStore.user.id, 'preferences')
            const q = query(
                prefsRef,
                where('scryfallId', '==', scryfallId),
                where('edition', '==', edition)
            )
            const snapshot = await getDocs(q)

            if (snapshot.empty) {
                console.warn(`⚠️ No preference found for ${scryfallId} (${edition})`)
                return
            }

            // Eliminar todas las coincidencias (debería haber solo una, pero por seguridad)
            for (const doc of snapshot.docs) {
                const prefRef = doc.ref
                await deleteDoc(prefRef)

                // Eliminar de memoria
                _preferences.value = _preferences.value.filter(
                    p => !(p.scryfallId === scryfallId && p.edition === edition)
                )
            }

            console.log(`✅ Preference deleted: ${scryfallId} (${edition})`)
        } catch (error) {
            console.error('❌ Error deleting preference by card:', error)
            throw error
        }
    }

    /**
     * Bulk sync all preferences to public collection
     * Call this once to migrate existing data
     */
    const syncAllToPublic = async (): Promise<void> => {
        const userInfo = getUserInfo()
        if (!userInfo) return

        try {
            await syncAllUserPreferences(
                _preferences.value,
                userInfo.userId,
                userInfo.username,
                userInfo.location,
                userInfo.email,
                userInfo.avatarUrl
            )
            console.log('✅ Preferences synced to public')
        } catch (error) {
            console.error('[PublicSync] Error bulk syncing preferences:', error)
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
        updatePreferenceType,
        deletePreference,
        deletePreferenceByCard,
        syncAllToPublic,
        clear,
    }
})