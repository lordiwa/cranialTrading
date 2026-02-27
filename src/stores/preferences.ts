import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'
import { addDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import { type Preference, type PreferenceType } from '../types/preferences'
import {
    syncAllUserPreferences,
    syncPreferenceToPublic,
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
                    .catch((err: unknown) => { console.error('[PublicSync] Error syncing preference:', err); })
            }

            console.log('✅ Preference added:', prefData.name)
            return newPref
        } catch (error) {
            console.error('❌ Error adding preference:', error)
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
        syncAllToPublic,
        clear,
    }
})
