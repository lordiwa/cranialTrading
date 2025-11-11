import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Card, CardCondition } from '../types/card';
import { getCardBySetAndNumber } from '../services/scryfall'
import { parseMoxfieldDeck } from '../utils/deckParser'

// Helper: remove undefined fields recursively so Firestore won't reject documents
function sanitizeForFirestore(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
        if (v === undefined) continue;
        // leave Dates and Firestore Timestamps untouched
        if (v instanceof Date) {
            out[k] = v;
        } else if (v === null || typeof v !== 'object') {
            out[k] = v;
        } else {
            out[k] = sanitizeForFirestore(v);
        }
    }
    return out;
}

// Helper: generate a compact randomized deck name when none was provided
function generateRandomDeckName(): string {
    // Format: DeckName_YYMMDD_HHMM_<5char>
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `DeckName${yy}${mm}${dd}${hh}${min}_${rand}`;
}

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

            cards.value = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    status: data.status || 'collection',
                    deckName: data.deckName || undefined,
                    public: data.public || false,
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                } as Card;
            });
        } catch (error) {
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
        status: 'collection' | 'sell' | 'trade' | 'busco';
        deckName?: string;
        public?: boolean;
    }) => {
        if (!authStore.user) return;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const finalDeckName = cardData.deckName ?? generateRandomDeckName();
            const payload = sanitizeForFirestore({
                ...cardData,
                deckName: finalDeckName,
                public: cardData.public ?? false,
                updatedAt: new Date(),
            });
            await addDoc(colRef, payload);

            await loadCollection();

            // Toast específico - mostrar status y mazo
            const statusLabel =
                cardData.status === 'sell' ? 'VENDO' :
                    cardData.status === 'trade' ? 'CAMBIO' :
                        cardData.status === 'busco' ? 'BUSCO' :
                            'Colección';

            let toastMsg = `Carta agregada`;

            if (cardData.status !== 'collection') {
                toastMsg += ` como ${statusLabel}`;
            }

            if (cardData.deckName) {
                toastMsg += ` al mazo "${finalDeckName}"`;
            }

            toastStore.show(toastMsg, 'success');
        } catch (error) {
            toastStore.show('Error al agregar carta', 'error');
        }
    };

    const updateCard = async (cardId: string, updates: Partial<Card>) => {
        if (!authStore.user) return;

        try {
            const cardRef = doc(db, 'users', authStore.user.id, 'cards', cardId);
            const payload = sanitizeForFirestore({
                ...updates,
                updatedAt: new Date(),
            });
            await updateDoc(cardRef, payload);

            await loadCollection();
            toastStore.show('Carta actualizada', 'success');
        } catch (error) {
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
            toastStore.show('Error al eliminar carta', 'error');
        }
    };

    const processDeckImport = async (
        deckText: string,
        condition: CardCondition = 'NM',
        includeSideboard: boolean = false,
        deckName?: string,
        onProgress?: (current: number, total: number) => void
    ) => {
        if (!authStore.user) return {
            success: 0,
            failed: 0,
            errors: [] as string[],
            processedCards: [] as any[]
        }

        try {
            const parsed = parseMoxfieldDeck(deckText)
            const cardsToImport = includeSideboard
                ? [...parsed.mainboard, ...parsed.sideboard]
                : parsed.mainboard

            // generate one deck name for the whole import (if none provided)
            const importDeckName = deckName ?? generateRandomDeckName()

            if (cardsToImport.length === 0) {
                toastStore.show('No se detectaron cartas', 'error')
                return { success: 0, failed: 0, errors: [], processedCards: [] }
            }

            if (cardsToImport.length > 500) {
                toastStore.show('Máximo 500 cartas por importación', 'error')
                return { success: 0, failed: 0, errors: [], processedCards: [] }
            }

            let success = 0
            let failed = 0
            const errors: string[] = []
            const processedCards: any[] = []
            const total = cardsToImport.length

            for (let i = 0; i < cardsToImport.length; i++) {
                const parsedCard = cardsToImport[i]

                await new Promise(resolve => setTimeout(resolve, 75))

                let card = null
                let retries = 0

                while (retries < 3 && !card) {
                    try {
                        card = await getCardBySetAndNumber(
                            parsedCard.setCode,
                            parsedCard.collectorNumber
                        )
                        break
                    } catch (error: any) {
                        if (error.status === 429 && retries < 2) {
                            await new Promise(resolve => setTimeout(resolve, 500))
                            retries++
                        } else {
                            break
                        }
                    }
                }

                if (!card) {
                    failed++
                    errors.push(`${parsedCard.name} (${parsedCard.setCode} ${parsedCard.collectorNumber})`)
                } else {
                    const price = parseFloat(card.prices.usd || '0')
                    processedCards.push({
                        scryfallId: card.id,
                        name: card.name,
                        edition: card.set_name,
                        quantity: parsedCard.quantity,
                        condition,
                        foil: false,
                        price,
                        image: card.image_uris?.normal || '',
                        status: 'collection',
                        // use the same deck name for the whole import
                        deckName: importDeckName,
                        public: false,
                    })
                    success++
                }

                if (onProgress) {
                    onProgress(i + 1, total)
                }
            }

            return { success, failed, errors, processedCards }
        } catch (error) {
            toastStore.show('Error al procesar mazo', 'error')
            return { success: 0, failed: 0, errors: [], processedCards: [] }
        }
    }

    const processDirectImport = async (
        cards: Array<{
            quantity: number
            name: string
            setCode: string
            collectorNumber: string
            scryfallId: string
        }>,
        deckName: string,
        condition: CardCondition = 'NM',
        onProgress?: (current: number, total: number) => void
    ) => {
        if (!authStore.user) return {
            success: 0,
            failed: 0,
            errors: [] as string[],
            processedCards: [] as any[]
        }

        try {
            if (cards.length === 0) {
                toastStore.show('No se detectaron cartas', 'error')
                return { success: 0, failed: 0, errors: [], processedCards: [] }
            }

            if (cards.length > 500) {
                toastStore.show('Máximo 500 cartas por importación', 'error')
                return { success: 0, failed: 0, errors: [], processedCards: [] }
            }

            // ensure the whole direct import uses the same deck name
            const importDeckNameDirect = deckName ?? generateRandomDeckName()

            let success = 0
            let failed = 0
            const errors: string[] = []
            const processedCards: any[] = []
            const total = cards.length

            for (let i = 0; i < cards.length; i++) {
                const cardData = cards[i]

                await new Promise(resolve => setTimeout(resolve, 75))

                let card = null
                let retries = 0

                while (retries < 3 && !card) {
                    try {
                        card = await getCardBySetAndNumber(
                            cardData.setCode,
                            cardData.collectorNumber
                        )
                        break
                    } catch (error: any) {
                        if (error.status === 429 && retries < 2) {
                            await new Promise(resolve => setTimeout(resolve, 500))
                            retries++
                        } else {
                            break
                        }
                    }
                }

                if (!card) {
                    failed++
                    errors.push(`${cardData.name} (${cardData.setCode} ${cardData.collectorNumber})`)
                } else {
                    const price = parseFloat(card.prices.usd || '0')
                    processedCards.push({
                        scryfallId: card.id,
                        name: card.name,
                        edition: card.set_name,
                        quantity: cardData.quantity,
                        condition,
                        foil: false,
                        price,
                        image: card.image_uris?.normal || '',
                        status: 'collection',
                        // use the import's deck name for all cards
                        deckName: importDeckNameDirect,
                        public: false,
                    })
                    success++
                }

                if (onProgress) {
                    onProgress(i + 1, total)
                }
            }

            return { success, failed, errors, processedCards }
        } catch (error) {
            toastStore.show('Error al procesar mazo', 'error')
            return { success: 0, failed: 0, errors: [], processedCards: [] }
        }
    }

    const confirmImport = async (cardsToImport: any[]) => {
        if (!authStore.user || cardsToImport.length === 0) return false

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards')
            const snapshot = await getDocs(colRef)
            const existingCards = new Map<string, any>()

            snapshot.docs.forEach(doc => {
                const card = doc.data()
                const key = `${card.scryfallId}_${card.condition}_${card.foil}_${card.status || 'collection'}_${card.deckName || ''}`
                existingCards.set(key, { id: doc.id, ...card })
            })

            // --- normalize: ensure entire batch uses the same deck name ---
            const firstProvidedName = cardsToImport.find(c => c.deckName)?.deckName
            const batchDeckName = firstProvidedName ?? generateRandomDeckName()
            // assign batchDeckName to any card that lacks a deckName
            // FORCE: assign the same batchDeckName to every incoming card (override any provided names)
            const normalizedCards = cardsToImport.map(c => ({ ...c, deckName: batchDeckName }))

            const consolidatedCards = new Map<string, any>()

            for (const cardData of normalizedCards) {
                const key = `${cardData.scryfallId}_${cardData.condition}_${cardData.foil}_${cardData.status}_${cardData.deckName}`

                if (consolidatedCards.has(key)) {
                    const existing = consolidatedCards.get(key)
                    existing.quantity += cardData.quantity
                } else {
                    consolidatedCards.set(key, { ...cardData })
                }
            }

            for (const [key, cardData] of consolidatedCards.entries()) {
                if (existingCards.has(key)) {
                    const existing = existingCards.get(key)
                    const cardRef = doc(db, 'users', authStore.user.id, 'cards', existing.id)
                    const payload = sanitizeForFirestore({
                        quantity: existing.quantity + cardData.quantity,
                        public: existing.public ?? false,
                        updatedAt: new Date(),
                    })
                    await updateDoc(cardRef, payload)
                } else {
                    // ensure deckName is explicit and use the batchDeckName if somehow missing
                    const writePayload = sanitizeForFirestore({
                        ...cardData,
                        // already normalized; ensure explicit batch name
                        deckName: batchDeckName,
                        public: cardData.public ?? false,
                        updatedAt: new Date(),
                    })

                    await addDoc(colRef, writePayload)
                }
            }

            await loadCollection()
            toastStore.show(`${normalizedCards.length} cartas procesadas`, 'success')
            return true
        } catch (error) {
            toastStore.show('Error al guardar cartas', 'error')
            return false
        }
    }

    // Delete all cards that belong to a deck (by deckName)
    const deleteDeck = async (deckName: string) => {
        if (!authStore.user || !deckName) return false;

        try {
            const colRef = collection(db, 'users', authStore.user.id, 'cards');
            const q = query(colRef, where('deckName', '==', deckName));
            const snapshot = await getDocs(q);

            const batchDeletes: Promise<any>[] = [];
            snapshot.docs.forEach(d => {
                const cardRef = doc(db, 'users', authStore.user.id, 'cards', d.id);
                batchDeletes.push(deleteDoc(cardRef));
            });

            await Promise.all(batchDeletes);
            await loadCollection();
            toastStore.show(`Mazo "${deckName}" eliminado`, 'success');
            return true;
        } catch (error) {
            toastStore.show('Error al eliminar mazo', 'error');
            return false;
        }
    }

    return {
        cards,
        loading,
        loadCollection,
        addCard,
        updateCard,
        deleteCard,
        processDeckImport,
        processDirectImport,
        confirmImport
       ,deleteDeck
    };
});
