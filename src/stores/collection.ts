import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    doc,
    query,
    where,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Card, CardCondition, CardStatus } from '../types/card';

export const useCollectionStore = defineStore('collection', () => {
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    const cards = ref<Card[]>([]);
    const loading = ref(false);

    // Load all cards for current user
    const loadCollection = async () => {
        if (!authStore.user) return;
        loading.value = true;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const snapshot = await getDocs(colRef);

            cards.value = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Card[];
        } catch (error) {
            console.error('Error loading collection:', error);
            toastStore.show('Error al cargar colección', 'error');
        } finally {
            loading.value = false;
        }
    };

    // Add a new card to collection
    const addCard = async (cardData: Omit<Card, 'id'>) => {
        if (!authStore.user) return;
        loading.value = true;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const docRef = await addDoc(colRef, {
                ...cardData,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });

            cards.value.push({
                id: docRef.id,
                ...cardData,
            });

            toastStore.show(`${cardData.name} agregado a colección`, 'success');
            return docRef.id;
        } catch (error) {
            console.error('Error adding card:', error);
            toastStore.show('Error al agregar carta', 'error');
        } finally {
            loading.value = false;
        }
    };

    // Update card details
    const updateCard = async (cardId: string, updates: Partial<Card>) => {
        if (!authStore.user) return;

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId);
            await updateDoc(cardRef, {
                ...updates,
                updatedAt: Timestamp.now(),
            });

            const index = cards.value.findIndex((c) => c.id === cardId);
            if (index > -1) {
                cards.value[index] = {
                    ...cards.value[index],
                    ...updates,
                };
            }

            toastStore.show('Carta actualizada', 'success');
        } catch (error) {
            console.error('Error updating card:', error);
            toastStore.show('Error al actualizar carta', 'error');
        }
    };

    // Delete a single card
    const deleteCard = async (cardId: string) => {
        if (!authStore.user) return;

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId);
            await deleteDoc(cardRef);

            cards.value = cards.value.filter((c) => c.id !== cardId);
            toastStore.show('Carta eliminada', 'success');
        } catch (error) {
            console.error('Error deleting card:', error);
            toastStore.show('Error al eliminar carta', 'error');
        }
    };

    // Delete all cards that belong to a deck (by deckName)
    const deleteDeck = async (deckName: string) => {
        if (!authStore.user || !deckName) return false;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const q = query(colRef, where('deckName', '==', deckName));
            const snapshot = await getDocs(q);

            const batchDeletes: Promise<any>[] = [];
            snapshot.docs.forEach((d) => {
                const cardRef = doc(db, 'users', authStore.user.id, 'cards', d.id);
                batchDeletes.push(deleteDoc(cardRef));
            });

            await Promise.all(batchDeletes);
            await loadCollection();
            toastStore.show(`Mazo "${deckName}" eliminado`, 'success');
            return true;
        } catch (error) {
            console.error('Error deleting deck:', error);
            toastStore.show('Error al eliminar mazo', 'error');
            return false;
        }
    };

    // Delete ALL cards for current user
    const deleteAllCards = async () => {
        if (!authStore.user) return false;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const snapshot = await getDocs(colRef);

            const batchDeletes: Promise<any>[] = [];
            snapshot.docs.forEach((d) => {
                const cardRef = doc(db, 'users', authStore.user.id, 'cards', d.id);
                batchDeletes.push(deleteDoc(cardRef));
            });

            await Promise.all(batchDeletes);
            cards.value = [];
            toastStore.show('Todas las cartas fueron eliminadas', 'success');
            return true;
        } catch (error) {
            console.error('Error deleting all cards:', error);
            toastStore.show('Error al eliminar cartas', 'error');
            return false;
        }
    };

    // Process deck import
    const processDeckImport = async (
        deckText: string,
        condition: CardCondition,
        includeSideboard: boolean,
        deckName?: string,
        progressCallback?: (current: number, total: number) => void
    ) => {
        const lines = deckText.split('\n').filter((line) => line.trim());
        const processedCards: any[] = [];
        const errors: string[] = [];
        let successCount = 0;
        let failCount = 0;

        let inSideboard = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line) continue;

            if (
                line.toLowerCase().includes('sideboard') ||
                line.toLowerCase().includes('side board')
            ) {
                inSideboard = true;
                continue;
            }

            if (inSideboard && !includeSideboard) continue;

            // Parse card line: "2 Black Lotus" or "1x Lightning Bolt"
            const match = line.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\))?$/i);
            if (!match) {
                failCount++;
                errors.push(`No se pudo parsear: ${line}`);
                continue;
            }

            const quantity = parseInt(match[1]);
            const cardName = match[2].trim();
            const setCode = match[3] || null;

            // TODO: Fetch from Scryfall API
            // For now, store the card with placeholder data
            processedCards.push({
                name: cardName,
                quantity,
                condition,
                edition: setCode || 'Unknown',
                foil: false,
                price: 0, // Will be fetched from Scryfall
                image: '',
                scryfallId: '',
                status: 'collection' as CardStatus,
                public: false,
                deckName: deckName || `Deck${Date.now()}`,
            });

            successCount++;
            progressCallback?.(successCount + failCount, lines.length);
        }

        return {
            success: successCount,
            failed: failCount,
            errors,
            processedCards,
        };
    };

    // Direct import with prepared cards
    const processDirectImport = async (
        cardsToImport: any[],
        deckName: string,
        condition: CardCondition,
        progressCallback?: (current: number, total: number) => void
    ) => {
        const processedCards = cardsToImport.map((card) => ({
            ...card,
            condition,
            deckName,
            status: 'collection' as CardStatus,
            public: false,
        }));

        progressCallback?.(cardsToImport.length, cardsToImport.length);

        return {
            success: processedCards.length,
            failed: 0,
            errors: [],
            processedCards,
        };
    };

    // Confirm import and save to Firestore
    const confirmImport = async (cardsToSave: any[]) => {
        if (!authStore.user) return false;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const batchAdds: Promise<any>[] = [];

            for (const card of cardsToSave) {
                batchAdds.push(
                    addDoc(colRef, {
                        ...card,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    })
                );
            }

            await Promise.all(batchAdds);
            await loadCollection();
            toastStore.show(`${cardsToSave.length} cartas importadas`, 'success');
            return true;
        } catch (error) {
            console.error('Error importing cards:', error);
            toastStore.show('Error al importar cartas', 'error');
            return false;
        }
    };

    // Clear all data
    const clear = () => {
        cards.value = [];
    };

    return {
        cards,
        loading,
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
        deleteDeck,
        deleteAllCards,
        processDeckImport,
        processDirectImport,
        confirmImport,
        clear,
    };
});