import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Card, CardCondition } from '../types/card';

export const useCollectionStore = defineStore('collection', () => {
    const cards = ref<Card[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    const loadCollection = async () => {
        if (!authStore.user) return;

        loading.value = true;
        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const snapshot = await getDocs(colRef);

            cards.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            } as Card));
        } catch (error) {
            console.error('Error loading collection:', error);
            toastStore.show('Error al cargar colección', 'error');
        } finally {
            loading.value = false;
        }
    };

    const addCard = async (cardData: {
        scryfallId: string;
        name: string;
        edition: string;
        quantity: number;
        condition: CardCondition;
        foil: boolean;
        price: number;
        image: string;
    }) => {
        if (!authStore.user) return;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            await addDoc(colRef, {
                ...cardData,
                updatedAt: new Date(),
            });

            await loadCollection();
            toastStore.show('Carta agregada', 'success');
        } catch (error) {
            console.error('Error adding card:', error);
            toastStore.show('Error al agregar carta', 'error');
        }
    };

    const updateCard = async (cardId: string, updates: Partial<Card>) => {
        if (!authStore.user) return;

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId);
            await updateDoc(cardRef, {
                ...updates,
                updatedAt: new Date(),
            });

            await loadCollection();
            toastStore.show('Carta actualizada', 'success');
        } catch (error) {
            console.error('Error updating card:', error);
            toastStore.show('Error al actualizar carta', 'error');
        }
    };

    const deleteCard = async (cardId: string) => {
        if (!authStore.user) return;

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId);
            await deleteDoc(cardRef);

            cards.value = cards.value.filter(c => c.id !== cardId);
            toastStore.show('Carta eliminada', 'success');
        } catch (error) {
            console.error('Error deleting card:', error);
            toastStore.show('Error al eliminar carta', 'error');
        }
    };

    return {
        cards,
        loading,
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
    };
});