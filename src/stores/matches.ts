import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';

export interface SimpleMatch {
    id: string;
    type: 'VENDO' | 'BUSCO';
    otherUserId: string;
    otherUsername: string;
    otherLocation?: string;
    myCard?: any;
    otherCard?: any;
    otherPreference?: any;
    myPreference?: any;
    createdAt: Date;
}

export const useMatchesStore = defineStore('matches', () => {
    const matches = ref<SimpleMatch[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();

    const findMatches = async () => {
        if (!authStore.user) return;

        loading.value = true;
        try {
            // Get all users to find matches
            const usersRef = collection(db, 'users');
            const usersSnapshot = await getDocs(usersRef);

            const foundMatches: SimpleMatch[] = [];

            // Get current user's preferences (from preferences collection)
            const myPrefsRef = collection(db, 'users', authStore.user.id, 'preferencias');
            const myPrefsSnapshot = await getDocs(myPrefsRef);

            // Get current user's cards
            const myCardsRef = collection(db, 'users', authStore.user.id, 'cards');
            const myCardsSnapshot = await getDocs(myCardsRef);

            // Build a deduplicated map of my preferences merging actual preferences and synthetic ones from cards with status 'busco'
            const myPrefMap = new Map<string, any>();
            const makeKey = (p: any) => {
                if (p.scryfallId) return `s:${String(p.scryfallId)}`;
                const name = String(p.name || '').trim().toLowerCase();
                const edition = String(p.edition || '').trim().toLowerCase();
                return `n:${name}|${edition}`;
            };

            myPrefsSnapshot.forEach(p => {
                const data = p.data();
                const key = makeKey(data);
                myPrefMap.set(key, { ...data, id: p.id, _fromCard: false });
            });

            // synthetic BUSCO prefs from my cards
            myCardsSnapshot.forEach(cardDoc => {
                const card = cardDoc.data();
                if (card.status === 'busco') {
                    const synthetic = {
                        id: `card_${cardDoc.id}`,
                        scryfallId: card.scryfallId,
                        name: card.name,
                        type: 'BUSCO',
                        quantity: card.quantity || 1,
                        condition: card.condition,
                        edition: card.edition,
                        image: card.image || '',
                        _fromCard: true,
                        _cardId: cardDoc.id,
                    };
                    const key = makeKey(synthetic);
                    if (!myPrefMap.has(key)) myPrefMap.set(key, synthetic);
                }
            });

            const myPreferences = Array.from(myPrefMap.values());

            // For each other user, search for matches
            for (const userDoc of usersSnapshot.docs) {
                if (userDoc.id === authStore.user.id) continue; // Skip self

                const otherUserId = userDoc.id;
                const otherUserData = userDoc.data();

                try {
                    const otherPrefsRef = collection(db, 'users', otherUserId, 'preferencias');
                    const otherPrefsSnapshot = await getDocs(otherPrefsRef);

                    const otherCardsRef = collection(db, 'users', otherUserId, 'cards');
                    const otherCardsSnapshot = await getDocs(otherCardsRef);

                    const otherPreferences: any[] = [];
                    otherPrefsSnapshot.forEach(p => otherPreferences.push({ ...p.data(), id: p.id }));

                    const otherCards: any[] = [];
                    otherCardsSnapshot.forEach(c => otherCards.push({ ...c.data(), id: c.id }));

                    const myCards: any[] = [];
                    myCardsSnapshot.forEach(c => myCards.push({ ...c.data(), id: c.id }));

                    // MATCH TYPE 1: Other user BUSCO/CAMBIO my physical cards
                    for (const preference of otherPreferences) {
                        if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
                            for (const card of myCards) {
                                if (card.name?.toLowerCase() === preference.name?.toLowerCase()) {
                                    foundMatches.push({
                                        id: `${authStore.user!.id}_${otherUserId}_${card.id}_${preference.id}_sell`,
                                        type: 'VENDO',
                                        myCard: { ...card },
                                        otherUserId,
                                        otherUsername: (otherUserData as any).username || 'Usuario',
                                        otherLocation: (otherUserData as any).location,
                                        otherPreference: { ...preference },
                                        createdAt: new Date(),
                                    });
                                }
                            }
                        }
                    }

                    // MATCH TYPE 2: I BUSCO/CAMBIO other user's physical cards
                    for (const preference of myPreferences) {
                        if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
                            for (const card of otherCards) {
                                if (card.name?.toLowerCase() === preference.name?.toLowerCase()) {
                                    foundMatches.push({
                                        id: `${authStore.user!.id}_${otherUserId}_${card.id}_${preference.id}_buy`,
                                        type: 'BUSCO',
                                        otherCard: { ...card },
                                        otherUserId,
                                        otherUsername: (otherUserData as any).username || 'Usuario',
                                        otherLocation: (otherUserData as any).location,
                                        myPreference: { ...preference },
                                        createdAt: new Date(),
                                    });
                                }
                            }
                        }
                    }

                    // MATCH TYPE 3: My VENDO preference matches other user's BUSCO preference
                    for (const myPreference of myPreferences) {
                        if (myPreference.type === 'VENDO') {
                            for (const otherPreference of otherPreferences) {
                                if (otherPreference.type === 'BUSCO') {
                                    if (myPreference.name?.toLowerCase() === otherPreference.name?.toLowerCase()) {
                                        let myCard = null;
                                        for (const card of myCards) {
                                            if (card.scryfallId === myPreference.scryfallId) {
                                                myCard = { ...card };
                                                break;
                                            }
                                        }

                                        if (myCard) {
                                            foundMatches.push({
                                                id: `${authStore.user!.id}_${otherUserId}_${myPreference.id}_${otherPreference.id}_vendo_busco`,
                                                type: 'VENDO',
                                                myCard,
                                                otherUserId,
                                                otherUsername: (otherUserData as any).username || 'Usuario',
                                                otherLocation: (otherUserData as any).location,
                                                otherPreference: { ...otherPreference },
                                                createdAt: new Date(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // MATCH TYPE 4: My BUSCO preference matches other user's VENDO preference
                    for (const myPreference of myPreferences) {
                        if (myPreference.type === 'BUSCO') {
                            for (const otherPreference of otherPreferences) {
                                if (otherPreference.type === 'VENDO') {
                                    if (myPreference.name?.toLowerCase() === otherPreference.name?.toLowerCase()) {
                                        let otherCard = null;
                                        for (const card of otherCards) {
                                            if (card.scryfallId === otherPreference.scryfallId) {
                                                otherCard = { ...card };
                                                break;
                                            }
                                        }

                                        if (otherCard) {
                                            foundMatches.push({
                                                id: `${authStore.user!.id}_${otherUserId}_${myPreference.id}_${otherPreference.id}_busco_vendo`,
                                                type: 'BUSCO',
                                                otherCard,
                                                otherUserId,
                                                otherUsername: (otherUserData as any).username || 'Usuario',
                                                otherLocation: (otherUserData as any).location,
                                                myPreference: { ...myPreference },
                                                createdAt: new Date(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }

                } catch (userError) {
                    // Continue with next user if this one fails
                }
            }

            matches.value = foundMatches;
        } catch (error) {
            toastStore.show('Error al buscar coincidencias', 'error');
        } finally {
            loading.value = false;
        }
    };

    return {
        matches,
        loading,
        findMatches,
    };
});
