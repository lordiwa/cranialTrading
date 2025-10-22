import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Preference, PreferenceType } from '../types/preferences';

export const usePreferencesStore = defineStore('preferences', () => {
    const preferences = ref<Preference[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    const loadPreferences = async () => {
        if (!authStore.user) {
            console.log('[PREFERENCES] No user, skipping load');
            return;
        }

        loading.value = true;
        try {
            const prefRef = collection(db, 'users', authStore.user.id, 'preferencias');
            const snapshot = await getDocs(prefRef);

            preferences.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
            } as Preference));

            console.log('[PREFERENCES] Loaded', preferences.value.length, 'preferences');
        } catch (error: any) {
            console.error('[PREFERENCES] Error loading preferences:', error.code, error.message);
            // Si hay error de permisos o colección no existe, mostrar lista vacía
            preferences.value = [];
            // Solo mostrar toast si es un error diferente de permission-denied
            if (error.code !== 'permission-denied') {
                toastStore.show('Error al cargar preferencias', 'error');
            }
        } finally {
            loading.value = false;
        }
    };

    const addPreference = async (prefData: {
        scryfallId: string;
        name: string;
        type: PreferenceType;
        quantity: number;
        condition: string;
        edition: string;
        image: string;
    }) => {
        if (!authStore.user) return;

        try {
            const prefRef = collection(db, 'users', authStore.user.id, 'preferencias');
            await addDoc(prefRef, {
                ...prefData,
                createdAt: new Date(),
            });

            await loadPreferences();
            toastStore.show('Preferencia creada', 'success');
        } catch (error) {
            console.error('Error adding preference:', error);
            toastStore.show('Error al crear preferencia', 'error');
        }
    };

    const updatePreference = async (prefId: string, updates: Partial<Preference>) => {
        if (!authStore.user) return;

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferencias', prefId);
            await updateDoc(prefRef, updates);

            await loadPreferences();
            toastStore.show('Preferencia actualizada', 'success');
        } catch (error) {
            console.error('Error updating preference:', error);
            toastStore.show('Error al actualizar preferencia', 'error');
        }
    };

    const deletePreference = async (prefId: string) => {
        if (!authStore.user) return;

        try {
            const prefRef = doc(db, 'users', authStore.user.id, 'preferencias', prefId);
            await deleteDoc(prefRef);

            preferences.value = preferences.value.filter(p => p.id !== prefId);
            toastStore.show('Preferencia eliminada', 'success');
        } catch (error) {
            console.error('Error deleting preference:', error);
            toastStore.show('Error al eliminar preferencia', 'error');
        }
    };

    return {
        preferences,
        loading,
        loadPreferences,
        addPreference,
        updatePreference,
        deletePreference,
    };
});