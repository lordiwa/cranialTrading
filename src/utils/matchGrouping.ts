import type { PublicCard, PublicPreference } from '../services/publicCards'

export interface UserMatchGroup {
  cards: PublicCard[]
  prefs: PublicPreference[]
  username: string
  location: string
  email: string
}

/**
 * Groups matching public cards and preferences by userId.
 * Pure function — no Vue reactivity, no stores, no Firestore.
 * Extracted verbatim from src/views/DashboardView.vue groupMatchesByUser.
 */
export const groupMatchesByUser = (
  matchingCards: PublicCard[],
  matchingPrefs: PublicPreference[],
): Map<string, UserMatchGroup> => {
  const userMatches = new Map<string, UserMatchGroup>()

  for (const card of matchingCards) {
    if (!userMatches.has(card.userId)) {
      userMatches.set(card.userId, {
        cards: [],
        prefs: [],
        username: card.username,
        location: card.location ?? 'Unknown',
        email: card.email ?? '',
      })
    }
    const entry = userMatches.get(card.userId)
    if (entry) entry.cards.push(card)
  }

  for (const pref of matchingPrefs) {
    if (!userMatches.has(pref.userId)) {
      userMatches.set(pref.userId, {
        cards: [],
        prefs: [],
        username: pref.username,
        location: pref.location ?? 'Unknown',
        email: pref.email ?? '',
      })
    }
    const entry = userMatches.get(pref.userId)
    if (entry) entry.prefs.push(pref)
  }

  return userMatches
}
