import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { SimpleMatch } from './matches';

export const useSavedMatchesStore = defineStore('savedMatches', () => {
    const savedMatches = ref<(SimpleMatch & { savedAt: Date; docId: string })[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    const saveMatch = async (match: SimpleMatch) => {
        if (!authStore.user) return;

        try {
            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_guardados');
            const docRef = await addDoc(matchesRef, {
                ...match,
                savedAt: new Date(),
            });

            // Add to local state
            savedMatches.value.push({
                ...match,
                savedAt: new Date(),
                docId: docRef.id,
            });

            toastStore.show('Match guardado', 'success');
            return true;
        } catch (error) {
            console.error('Error saving match:', error);
            toastStore.show('Error al guardar match', 'error');
            return false;
        }
    };

    const loadSavedMatches = async () => {
        if (!authStore.user) return;

        loading.value = true;
        try {
            const matchesRef = collection(db, 'users', authStore.user.id, 'matches_guardados');
            const snapshot = await getDocs(matchesRef);

            savedMatches.value = snapshot.docs.map(doc => ({
                ...doc.data() as SimpleMatch,
                savedAt: doc.data().savedAt?.toDate() || new Date(),
                docId: doc.id,
            }));

            console.log('[SAVED_MATCHES] Loaded', savedMatches.value.length, 'saved matches');
        } catch (error) {
            console.error('Error loading saved matches:', error);
            toastStore.show('Error al cargar matches guardados', 'error');
        } finally {
            loading.value = false;
        }
    };

    const deleteSavedMatch = async (docId: string) => {
        if (!authStore.user) return;

        try {
            const matchRef = doc(db, 'users', authStore.user.id, 'matches_guardados', docId);
            await deleteDoc(matchRef);

            savedMatches.value = savedMatches.value.filter(m => m.docId !== docId);
            toastStore.show('Match eliminado', 'success');
        } catch (error) {
            console.error('Error deleting saved match:', error);
            toastStore.show('Error al eliminar match', 'error');
        }
    };

    const isMatchSaved = (matchId: string): boolean => {
        return savedMatches.value.some(m => m.id === matchId);
    };

    return {
        savedMatches,
        loading,
        saveMatch,
        loadSavedMatches,
        deleteSavedMatch,
        isMatchSaved,
    };
});

