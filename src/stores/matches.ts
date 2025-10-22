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

                    // Get current user's preferences
                    const myPrefsRef = collection(db, 'users', authStore.user.id, 'preferencias');
                    const myPrefsSnapshot = await getDocs(myPrefsRef);

                    // Get current user's cards
                    const myCardsRef = collection(db, 'users', authStore.user.id, 'cards');
                    const myCardsSnapshot = await getDocs(myCardsRef);

                    // Check if other user wants any of my cards
                    otherPrefsSnapshot.forEach(prefDoc => {
                        const preference = prefDoc.data();
                        myCardsSnapshot.forEach(cardDoc => {
                            const card = cardDoc.data();
                            if (card.name?.toLowerCase() === preference.name?.toLowerCase() &&
                                card.edition?.toLowerCase() === preference.edition?.toLowerCase()) {
                                // Other user wants this card and we have it
                                if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
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
                            }
                        });
                    });

                    // Check if I want any of other user's cards
                    myPrefsSnapshot.forEach(prefDoc => {
                        const preference = prefDoc.data();
                        otherCardsSnapshot.forEach(cardDoc => {
                            const card = cardDoc.data();
                            if (card.name?.toLowerCase() === preference.name?.toLowerCase() &&
                                card.edition?.toLowerCase() === preference.edition?.toLowerCase()) {
                                // We want this card and they have it
                                if (preference.type === 'BUSCO' || preference.type === 'CAMBIO') {
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
                            }
                        });
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
