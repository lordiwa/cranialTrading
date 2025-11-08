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
        if (!authStore.user) {
            console.log('[MATCHES] No user authenticated');
            return;
        }

        loading.value = true;
        try {
            console.log('[MATCHES] Finding matches for user:', authStore.user.id);

            // Get all users to find matches
            const usersRef = collection(db, 'users');
            const usersSnapshot = await getDocs(usersRef);

            const foundMatches: SimpleMatch[] = [];

            // Get current user's preferences
            const myPrefsRef = collection(db, 'users', authStore.user.id, 'preferencias');
            const myPrefsSnapshot = await getDocs(myPrefsRef);

            // Get current user's cards
            const myCardsRef = collection(db, 'users', authStore.user.id, 'cards');
            const myCardsSnapshot = await getDocs(myCardsRef);

            // For each user
            for (const userDoc of usersSnapshot.docs) {
                if (userDoc.id === authStore.user.id) continue; // Skip self

                const otherUserId = userDoc.id;
                const otherUserData = userDoc.data();

                try {
                    // Get other user's preferences
                    const otherPrefsRef = collection(db, 'users', otherUserId, 'preferencias');
                    const otherPrefsSnapshot = await getDocs(otherPrefsRef);

                    // Get other user's cards
                    const otherCardsRef = collection(db, 'users', otherUserId, 'cards');
                    const otherCardsSnapshot = await getDocs(otherCardsRef);

                    // MATCH TYPE 1: Other user BUSCO/CAMBIO my physical cards
                    otherPrefsSnapshot.forEach(prefDoc => {
                        const preference = prefDoc.data();
                        if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
                            myCardsSnapshot.forEach(cardDoc => {
                                const card = cardDoc.data();
                                if (card.name?.toLowerCase() === preference.name?.toLowerCase()) {
                                    foundMatches.push({
                                        id: `${authStore.user!.id}_${otherUserId}_${cardDoc.id}_${prefDoc.id}_sell`,
                                        type: 'VENDO',
                                        myCard: { ...card, id: cardDoc.id },
                                        otherUserId,
                                        otherUsername: otherUserData.username || 'Usuario',
                                        otherLocation: otherUserData.location,
                                        otherPreference: { ...preference, id: prefDoc.id },
                                        createdAt: new Date(),
                                    });
                                    console.log('[MATCHES] Match found - User', otherUserData.username, 'wants:', preference.name);
                                }
                            });
                        }
                    });

                    // MATCH TYPE 2: I BUSCO/CAMBIO other user's physical cards
                    myPrefsSnapshot.forEach(prefDoc => {
                        const preference = prefDoc.data();
                        if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
                            otherCardsSnapshot.forEach(cardDoc => {
                                const card = cardDoc.data();
                                if (card.name?.toLowerCase() === preference.name?.toLowerCase()) {
                                    foundMatches.push({
                                        id: `${authStore.user!.id}_${otherUserId}_${cardDoc.id}_${prefDoc.id}_buy`,
                                        type: 'BUSCO',
                                        otherCard: { ...card, id: cardDoc.id },
                                        otherUserId,
                                        otherUsername: otherUserData.username || 'Usuario',
                                        otherLocation: otherUserData.location,
                                        myPreference: { ...preference, id: prefDoc.id },
                                        createdAt: new Date(),
                                    });
                                    console.log('[MATCHES] Match found - User', otherUserData.username, 'has:', card.name);
                                }
                            });
                        }
                    });

                    // MATCH TYPE 3: My VENDO preference matches other user's BUSCO preference
                    myPrefsSnapshot.forEach(myPrefDoc => {
                        const myPreference = myPrefDoc.data();
                        if (myPreference.type === 'VENDO') {
                            otherPrefsSnapshot.forEach(otherPrefDoc => {
                                const otherPreference = otherPrefDoc.data();
                                if (otherPreference.type === 'BUSCO') {
                                    if (myPreference.name?.toLowerCase() === otherPreference.name?.toLowerCase()) {
                                        // Find my physical card
                                        let myCard = null;
                                        myCardsSnapshot.forEach(cardDoc => {
                                            const card = cardDoc.data();
                                            if (card.scryfallId === myPreference.scryfallId) {
                                                myCard = { ...card, id: cardDoc.id };
                                            }
                                        });

                                        if (myCard) {
                                            foundMatches.push({
                                                id: `${authStore.user!.id}_${otherUserId}_${myPrefDoc.id}_${otherPrefDoc.id}_vendo_busco`,
                                                type: 'VENDO',
                                                myCard,
                                                otherUserId,
                                                otherUsername: otherUserData.username || 'Usuario',
                                                otherLocation: otherUserData.location,
                                                otherPreference: { ...otherPreference, id: otherPrefDoc.id },
                                                createdAt: new Date(),
                                            });
                                            console.log('[MATCHES] Match found (VENDO-BUSCO) - User', otherUserData.username, 'wants:', otherPreference.name);
                                        }
                                    }
                                }
                            });
                        }
                    });

                    // MATCH TYPE 4: My BUSCO preference matches other user's VENDO preference
                    myPrefsSnapshot.forEach(myPrefDoc => {
                        const myPreference = myPrefDoc.data();
                        if (myPreference.type === 'BUSCO') {
                            otherPrefsSnapshot.forEach(otherPrefDoc => {
                                const otherPreference = otherPrefDoc.data();
                                if (otherPreference.type === 'VENDO') {
                                    if (myPreference.name?.toLowerCase() === otherPreference.name?.toLowerCase()) {
                                        // Find other user's physical card
                                        let otherCard = null;
                                        otherCardsSnapshot.forEach(cardDoc => {
                                            const card = cardDoc.data();
                                            if (card.scryfallId === otherPreference.scryfallId) {
                                                otherCard = { ...card, id: cardDoc.id };
                                            }
                                        });

                                        if (otherCard) {
                                            foundMatches.push({
                                                id: `${authStore.user!.id}_${otherUserId}_${myPrefDoc.id}_${otherPrefDoc.id}_busco_vendo`,
                                                type: 'BUSCO',
                                                otherCard,
                                                otherUserId,
                                                otherUsername: otherUserData.username || 'Usuario',
                                                otherLocation: otherUserData.location,
                                                myPreference: { ...myPreference, id: myPrefDoc.id },
                                                createdAt: new Date(),
                                            });
                                            console.log('[MATCHES] Match found (BUSCO-VENDO) - User', otherUserData.username, 'has:', otherCard.name);
                                        }
                                    }
                                }
                            });
                        }
                    });

                } catch (userError) {
                    console.log('[MATCHES] Error processing user', otherUserId, ':', userError);
                    // Continue with next user if this one fails
                }
            }

            matches.value = foundMatches;
            console.log('[MATCHES] Found', foundMatches.length, 'matches');
        } catch (error) {
            console.error('[MATCHES] Error finding matches:', error);
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