import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Card, CardCondition } from '../types/card';
import { getCardBySetAndNumber } from '../services/scryfall'
import { parseMoxfieldDeck } from '../utils/deckParser'

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
    const importDeck = async (
        deckText: string,
        condition: CardCondition = 'NM',
        includeSideboard: boolean = false
    ) => {
        if (!authStore.user) return { success: 0, failed: 0, errors: [] as string[] }

        try {
            const parsed = parseMoxfieldDeck(deckText)
            const cardsToImport = includeSideboard
                ? [...parsed.mainboard, ...parsed.sideboard]
                : parsed.mainboard

            if (cardsToImport.length === 0) {
                toastStore.show('No se detectaron cartas', 'error')
                return { success: 0, failed: 0, errors: [] }
            }

            if (cardsToImport.length > 500) {
                toastStore.show('Máximo 500 cartas por importación', 'error')
                return { success: 0, failed: 0, errors: [] }
            }

            let success = 0
            let failed = 0
            const errors: string[] = []

            for (const parsedCard of cardsToImport) {
                await new Promise(resolve => setTimeout(resolve, 100)) // Rate limit

                const card = await getCardBySetAndNumber(
                    parsedCard.setCode,
                    parsedCard.collectorNumber
                )

                if (!card) {
                    failed++
                    errors.push(`${parsedCard.name} (${parsedCard.setCode} ${parsedCard.collectorNumber})`)
                    continue
                }

                const price = parseFloat(card.prices.usd || '0')

                await addCard({
                    scryfallId: card.id,
                    name: card.name,
                    edition: card.set_name,
                    quantity: parsedCard.quantity,
                    condition,
                    foil: false,
                    price,
                    image: card.image_uris?.normal || '',
                })

                success++
            }

            if (success > 0) {
                toastStore.show(`${success} cartas importadas`, 'success')
            }
            if (failed > 0) {
                toastStore.show(`${failed} cartas no encontradas`, 'error')
            }

            return { success, failed, errors }
        } catch (error) {
            console.error('Error importing deck:', error)
            toastStore.show('Error al importar mazo', 'error')
            return { success: 0, failed: 0, errors: [] }
        }
    }

    return {
        cards,
        loading,
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
        importDeck
    };
});