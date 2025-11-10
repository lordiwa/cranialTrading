import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Preference, PreferenceType } from '../types/preferences';
import { CardCondition } from '../types/card';
import { getCardBySetAndNumber } from '../services/scryfall';
import { parseMoxfieldDeck } from '../utils/deckParser';

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
            preferences.value = [];
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

    const deletePreferenceByCard = async (scryfallId: string, edition: string) => {
        if (!authStore.user) return;

        try {
            const prefRef = collection(db, 'users', authStore.user.id, 'preferencias');
            const snapshot = await getDocs(prefRef);

            for (const docSnap of snapshot.docs) {
                const pref = docSnap.data();
                if (pref.scryfallId === scryfallId && pref.edition === edition && (pref.type === 'VENDO' || pref.type === 'CAMBIO' || pref.type === 'BUSCO')) {
                    await deleteDoc(doc(db, 'users', authStore.user.id, 'preferencias', docSnap.id));
                }
            }

            await loadPreferences();
        } catch (error) {
            console.error('Error deleting preference by card:', error);
        }
    };

    const updatePreferenceType = async (scryfallId: string, edition: string, newType: 'VENDO' | 'CAMBIO' | 'BUSCO') => {
        if (!authStore.user) return;

        try {
            const prefRef = collection(db, 'users', authStore.user.id, 'preferencias');
            const snapshot = await getDocs(prefRef);

            for (const docSnap of snapshot.docs) {
                const pref = docSnap.data();
                if (pref.scryfallId === scryfallId && pref.edition === edition && (pref.type === 'VENDO' || pref.type === 'CAMBIO' || pref.type === 'BUSCO')) {
                    await updateDoc(doc(db, 'users', authStore.user.id, 'preferencias', docSnap.id), {
                        type: newType,
                    });
                }
            }

            await loadPreferences();
            toastStore.show('Preferencia actualizada', 'success');
        } catch (error) {
            console.error('Error updating preference type:', error);
            toastStore.show('Error al actualizar preferencia', 'error');
        }
    };

    const processDeckImport = async (
        deckText: string,
        condition: CardCondition = 'NM',
        includeSideboard: boolean = false,
        onProgress?: (current: number, total: number) => void
    ) => {
        if (!authStore.user) return {
            success: 0,
            failed: 0,
            errors: [] as string[],
            processedPreferences: [] as any[]
        }

        try {
            const parsed = parseMoxfieldDeck(deckText)
            const cardsToImport = includeSideboard
                ? [...parsed.mainboard, ...parsed.sideboard]
                : parsed.mainboard

            if (cardsToImport.length === 0) {
                toastStore.show('No se detectaron cartas', 'error')
                return { success: 0, failed: 0, errors: [], processedPreferences: [] }
            }

            if (cardsToImport.length > 500) {
                toastStore.show('Máximo 500 cartas por importación', 'error')
                return { success: 0, failed: 0, errors: [], processedPreferences: [] }
            }

            let success = 0
            let failed = 0
            const errors: string[] = []
            const processedPreferences: any[] = []
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
                    processedPreferences.push({
                        scryfallId: card.id,
                        name: card.name,
                        type: 'BUSCO',
                        quantity: parsedCard.quantity,
                        condition,
                        edition: card.set_name,
                        image: card.image_uris?.normal || '',
                    })
                    success++
                }

                if (onProgress) {
                    onProgress(i + 1, total)
                }
            }

            return { success, failed, errors, processedPreferences }
        } catch (error) {
            console.error('Error processing deck import:', error)
            toastStore.show('Error al procesar mazo', 'error')
            return { success: 0, failed: 0, errors: [], processedPreferences: [] }
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
        condition: CardCondition = 'NM',
        onProgress?: (current: number, total: number) => void
    ) => {
        if (!authStore.user) return {
            success: 0,
            failed: 0,
            errors: [] as string[],
            processedPreferences: [] as any[]
        }

        try {
            if (cards.length === 0) {
                toastStore.show('No se detectaron cartas', 'error')
                return { success: 0, failed: 0, errors: [], processedPreferences: [] }
            }

            if (cards.length > 500) {
                toastStore.show('Máximo 500 cartas por importación', 'error')
                return { success: 0, failed: 0, errors: [], processedPreferences: [] }
            }

            let success = 0
            let failed = 0
            const errors: string[] = []
            const processedPreferences: any[] = []
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
                    processedPreferences.push({
                        scryfallId: card.id,
                        name: card.name,
                        type: 'BUSCO',
                        quantity: cardData.quantity,
                        condition,
                        edition: card.set_name,
                        image: card.image_uris?.normal || '',
                    })
                    success++
                }

                if (onProgress) {
                    onProgress(i + 1, total)
                }
            }

            return { success, failed, errors, processedPreferences }
        } catch (error) {
            console.error('Error processing direct import:', error)
            toastStore.show('Error al procesar mazo', 'error')
            return { success: 0, failed: 0, errors: [], processedPreferences: [] }
        }
    }

    const confirmImport = async (preferencesToImport: any[]) => {
        if (!authStore.user || preferencesToImport.length === 0) return false

        try {
            const prefRef = collection(db, 'users', authStore.user.id, 'preferencias')

            // Consolidate duplicates
            const consolidatedPrefs = new Map<string, any>()

            for (const prefData of preferencesToImport) {
                const key = `${prefData.scryfallId}_${prefData.edition}`

                if (consolidatedPrefs.has(key)) {
                    const existing = consolidatedPrefs.get(key)
                    existing.quantity += prefData.quantity
                } else {
                    consolidatedPrefs.set(key, { ...prefData })
                }
            }

            // Add all consolidated preferences
            for (const prefData of consolidatedPrefs.values()) {
                await addDoc(prefRef, {
                    ...prefData,
                    createdAt: new Date(),
                })
            }

            await loadPreferences()
            toastStore.show(`${consolidatedPrefs.size} preferencias creadas`, 'success')
            return true
        } catch (error) {
            console.error('Error confirming import:', error)
            toastStore.show('Error al guardar preferencias', 'error')
            return false
        }
    }

    return {
        preferences,
        loading,
        loadPreferences,
        addPreference,
        updatePreference,
        deletePreference,
        deletePreferenceByCard,
        updatePreferenceType,
        processDeckImport,
        processDirectImport,
        confirmImport,
    };
});

