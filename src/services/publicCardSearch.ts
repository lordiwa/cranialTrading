/**
 * Public-card search against the `public_cards` Firestore collection (TASK-075).
 *
 * Extracted from useGlobalSearch so both the header dropdown and /search can
 * share a single implementation. The query is prefix-based on `cardNameLower`
 * and ALWAYS capped with limit() — there is intentionally no fallback that
 * downloads the whole collection: on failure we log and return [].
 */

import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from './firebase'

export interface PublicCardResult {
  id: string
  cardId?: string
  scryfallId?: string
  cardName?: string
  cardNameLower?: string
  edition?: string
  userId?: string
  username?: string
  location?: string
  avatarUrl?: string
  quantity?: number
  condition?: string
  foil?: boolean
  price?: number
  image?: string
  status?: string
}

export async function searchPublicCards(
  term: string,
  currentUserId: string | null,
  max = 20
): Promise<PublicCardResult[]> {
  const normalized = term.trim().toLowerCase()
  if (normalized.length < 2) return []

  try {
    const publicCardsRef = collection(db, 'public_cards')
    const publicCardsQuery = query(
      publicCardsRef,
      where('cardNameLower', '>=', normalized),
      where('cardNameLower', '<=', normalized + ''),
      limit(max)
    )
    const snapshot = await getDocs(publicCardsQuery)

    return snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PublicCardResult))
      .filter(card => currentUserId === null || card.userId !== currentUserId)
  } catch (error) {
    console.error('Error searching public cards:', error)
    return []
  }
}
