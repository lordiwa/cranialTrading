/**
 * Public Cards Service
 *
 * Manages denormalized public collections for efficient match queries.
 * Instead of loading ALL users to find matches, we query indexed collections.
 *
 * Collections:
 * - /public_cards/{docId} - Cards available for trade/sale
 * - /public_preferences/{docId} - Cards users are looking for
 */

import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  setDoc,
  startAfter,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Card } from '../types/card'

export interface PublicCard {
  docId: string // Firestore document ID
  cardId: string // matches the user's card document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  cardNameLower: string // lowercased cardName — matches the prefix query in publicCardSearch.ts
  scryfallId: string
  status: 'trade' | 'sale'
  price: number
  edition: string
  condition: string
  foil: boolean
  quantity: number
  image: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

export interface PreferenceInput {
  id: string
  cardName?: string
  name?: string
  scryfallId?: string
  maxPrice?: number
  minCondition?: string
}

export interface PublicPreference {
  docId: string // Firestore document ID
  prefId: string // matches the user's preference document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  scryfallId: string
  maxPrice?: number
  minCondition?: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

/**
 * Sync a single card to public_cards collection
 * Only syncs cards with status 'trade' or 'sale' AND public: true
 */
export async function syncCardToPublic(
  card: Card,
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicCardId = `${userId}_${card.id}`
  const publicCardRef = doc(db, 'public_cards', publicCardId)

  // TASK-085: whitelist sale/trade explicitly (not a 'collection' blacklist) —
  // public_cards is now readable by anonymous users, so a 'wishlist' card
  // marked public must never slip through as "not collection".
  const isPublicCard = (card.status === 'sale' || card.status === 'trade') && card.public === true

  if (isPublicCard) {
    const publicCard = {
      cardId: card.id,
      userId,
      username,
      avatarUrl: userAvatarUrl ?? null,
      cardName: card.name,
      cardNameLower: card.name.toLowerCase(),
      scryfallId: card.scryfallId,
      status: card.status as 'trade' | 'sale',
      price: card.price || 0,
      edition: card.edition || '',
      condition: card.condition || 'NM',
      foil: card.foil || false,
      quantity: card.quantity || 1,
      image: card.image || '',
      location: userLocation,
      email: userEmail,
      updatedAt: Timestamp.now(),
    }
    await setDoc(publicCardRef, publicCard)
  } else {
    // Remove from public if not public or status changed
    await deleteDoc(publicCardRef).catch(() => { /* doc may not exist */ })
  }
}

/**
 * Batch sync multiple cards to public_cards using writeBatch
 * Much faster than individual syncCardToPublic calls for bulk operations
 */
export async function batchSyncCardsToPublic(
  cards: Card[],
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null,
  onProgress?: (completedChunks: number, totalChunks: number) => void
): Promise<void> {
  if (cards.length === 0) return

  const BATCH_SIZE = 400
  const totalChunks = Math.ceil(cards.length / BATCH_SIZE)
  let completedChunks = 0

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = cards.slice(i, i + BATCH_SIZE)

    for (const card of chunk) {
      const publicCardId = `${userId}_${card.id}`
      const publicCardRef = doc(db, 'public_cards', publicCardId)
      // TASK-085: whitelist sale/trade (see syncCardToPublic comment above).
      const isPublicCard = (card.status === 'sale' || card.status === 'trade') && card.public === true

      if (isPublicCard) {
        batch.set(publicCardRef, {
          cardId: card.id,
          userId,
          username,
          avatarUrl: userAvatarUrl ?? null,
          cardName: card.name,
          cardNameLower: card.name.toLowerCase(),
          scryfallId: card.scryfallId,
          status: card.status as 'trade' | 'sale',
          price: card.price || 0,
          edition: card.edition || '',
          condition: card.condition || 'NM',
          foil: card.foil || false,
          quantity: card.quantity || 1,
          image: card.image || '',
          location: userLocation,
          email: userEmail,
          updatedAt: Timestamp.now(),
        })
      } else {
        batch.delete(publicCardRef)
      }
    }

    await batch.commit()
    completedChunks++
    onProgress?.(completedChunks, totalChunks)
  }
}

/**
 * Remove a card from public_cards collection
 */
export async function removeCardFromPublic(cardId: string, userId: string): Promise<void> {
  const publicCardId = `${userId}_${cardId}`
  await deleteDoc(doc(db, 'public_cards', publicCardId)).catch(() => { /* doc may not exist */ })
}

/**
 * Sync a preference to public_preferences collection
 */
export async function syncPreferenceToPublic(
  preference: PreferenceInput,
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicPrefId = `${userId}_${preference.id}`
  const publicPrefRef = doc(db, 'public_preferences', publicPrefId)

  // Filter out undefined values (Firestore doesn't accept them)
  const publicPref: Record<string, string | number | Timestamp | null> = {
    prefId: preference.id,
    userId,
    username,
    avatarUrl: userAvatarUrl ?? null,
    cardName: preference.cardName ?? preference.name ?? '',
    scryfallId: preference.scryfallId ?? '',
    updatedAt: Timestamp.now(),
  }
  if (preference.maxPrice !== undefined) publicPref.maxPrice = preference.maxPrice
  if (preference.minCondition !== undefined) publicPref.minCondition = preference.minCondition
  if (userLocation) publicPref.location = userLocation
  if (userEmail) publicPref.email = userEmail
  await setDoc(publicPrefRef, publicPref)
}

/**
 * Remove a preference from public_preferences collection
 */
export async function removePreferenceFromPublic(prefId: string, userId: string): Promise<void> {
  const publicPrefId = `${userId}_${prefId}`
  await deleteDoc(doc(db, 'public_preferences', publicPrefId)).catch(() => { /* doc may not exist */ })
}

/**
 * Bulk sync all user's cards to public collection
 * Used on initial setup or when user updates profile
 */
export async function syncAllUserCards(
  cards: Card[],
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  // TASK-085: whitelist sale/trade (see syncCardToPublic comment above).
  const publicCards = cards.filter(c => (c.status === 'sale' || c.status === 'trade') && c.public === true)

  // First, remove all existing public cards for this user
  const existingQuery = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400 (Firestore limit is 500)
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add new cards in batches
  for (let i = 0; i < publicCards.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = publicCards.slice(i, i + BATCH_SIZE)

    for (const card of chunk) {
      const publicCardId = `${userId}_${card.id}`
      const publicCardRef = doc(db, 'public_cards', publicCardId)
      batch.set(publicCardRef, {
        cardId: card.id,
        userId,
        username,
        avatarUrl: userAvatarUrl ?? null,
        cardName: card.name,
        cardNameLower: card.name.toLowerCase(),
        scryfallId: card.scryfallId,
        status: card.status,
        price: card.price || 0,
        edition: card.edition || '',
        condition: card.condition || 'NM',
        foil: card.foil || false,
        quantity: card.quantity || 1,
        image: card.image || '',
        location: userLocation ?? '',
        email: userEmail ?? '',
        updatedAt: Timestamp.now(),
      })
    }
    await batch.commit()
  }
}

/**
 * Bulk sync all user's preferences to public collection
 */
function buildPreferenceData(
  pref: PreferenceInput,
  userId: string,
  username: string,
  userAvatarUrl?: string | null,
  userLocation?: string,
  userEmail?: string
): Record<string, string | number | Timestamp | null> {
  const data: Record<string, string | number | Timestamp | null> = {
    prefId: pref.id,
    userId,
    username,
    avatarUrl: userAvatarUrl ?? null,
    cardName: pref.cardName ?? pref.name ?? '',
    scryfallId: pref.scryfallId ?? '',
    updatedAt: Timestamp.now(),
  }
  if (pref.maxPrice !== undefined) data.maxPrice = pref.maxPrice
  if (pref.minCondition !== undefined) data.minCondition = pref.minCondition
  if (userLocation) data.location = userLocation
  if (userEmail) data.email = userEmail
  return data
}

export async function syncAllUserPreferences(
  preferences: PreferenceInput[],
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  // First, remove all existing public preferences for this user
  const existingQuery = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add preferences in batches
  for (let i = 0; i < preferences.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = preferences.slice(i, i + BATCH_SIZE)

    for (const pref of chunk) {
      const publicPrefId = `${userId}_${pref.id}`
      const publicPrefRef = doc(db, 'public_preferences', publicPrefId)
      batch.set(publicPrefRef, buildPreferenceData(pref, userId, username, userAvatarUrl, userLocation, userEmail))
    }
    await batch.commit()
  }
}

/**
 * Find public cards that match user's preferences (BUSCO matches)
 * Returns cards from other users that I'm looking for
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findCardsMatchingPreferences(
  preferences: PreferenceInput[],
  excludeUserId: string
): Promise<PublicCard[]> {
  if (preferences.length === 0) {
    return []
  }

  // Get unique card names from preferences
  const cardNames = [...new Set(
    preferences
      .map(p => p.cardName ?? p.name ?? '')
      .filter((name): name is string => !!name && name.length > 0)
  )]

  if (cardNames.length === 0) {
    return []
  }

  // Firestore 'in' query limited to 30 items, so chunk if needed
  const chunks: string[][] = []
  for (let i = 0; i < cardNames.length; i += 30) {
    chunks.push(cardNames.slice(i, i + 30))
  }

  const results: PublicCard[] = []

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'public_cards'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicCard
      if (data.userId !== excludeUserId) {
        results.push({ ...data, docId: docSnap.id })
      }
    })
  }

  return results
}

/**
 * Find public preferences that match user's cards (VENDO matches)
 * Returns preferences from other users for cards I have
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findPreferencesMatchingCards(
  cards: Card[],
  excludeUserId: string
): Promise<PublicPreference[]> {
  const tradeableCards = cards.filter(c => c.status === 'trade' || c.status === 'sale')
  if (tradeableCards.length === 0) return []

  // Get unique card names from tradeable cards
  const cardNames = [...new Set(
    tradeableCards
      .map(c => c.name)
      .filter(name => name && name.length > 0)
  )]

  if (cardNames.length === 0) return []

  // Firestore 'in' query limited to 30 items, so chunk if needed
  const chunks: string[][] = []
  for (let i = 0; i < cardNames.length; i += 30) {
    chunks.push(cardNames.slice(i, i + 30))
  }

  const results: PublicPreference[] = []

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'public_preferences'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicPreference
      if (data.userId !== excludeUserId) {
        results.push({ ...data, docId: docSnap.id })
      }
    })
  }

  return results
}

/**
 * Get all public cards for a specific user (for bidirectional matching)
 */
export async function getUserPublicCards(userId: string): Promise<PublicCard[]> {
  const q = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicCard))
}

export interface PublicCardsPage {
  cards: PublicCard[]
  /** Last doc of this page — pass back in as `cursor` to fetch the next page. Null once exhausted. */
  cursor: QueryDocumentSnapshot | null
  hasMore: boolean
}

/**
 * Server-side-paginated query for a single user's public cards (TASK-136).
 *
 * Used by the public profile view instead of reading the owner's private
 * users/{uid}/cards subcollection — that subcollection is readable by
 * anyone (see firestore.rules comment) and the view used to download it in
 * full (thousands of docs, including private ones) and filter client-side.
 * /public_cards is safe-by-construction: writers here only ever publish
 * sale/trade cards with public===true (see syncCardToPublic above).
 *
 * Orders by `cardName` to reuse the existing `userId ASC, cardName ASC`
 * composite index (firestore.indexes.json) — no new index deploy needed.
 * Fetches `pageSize + 1` docs to detect `hasMore` without a separate count
 * query; the extra doc is trimmed before returning.
 */
export async function getUserPublicCardsPage(
  userId: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot | null = null
): Promise<PublicCardsPage> {
  const constraints = [
    where('userId', '==', userId),
    orderBy('cardName'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize + 1),
  ]
  const snapshot = await getDocs(query(collection(db, 'public_cards'), ...constraints))

  const hasMore = snapshot.docs.length > pageSize
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs

  return {
    cards: pageDocs.map(d => ({ ...d.data(), docId: d.id }) as PublicCard),
    cursor: pageDocs.length > 0 ? (pageDocs[pageDocs.length - 1] ?? null) : null,
    hasMore,
  }
}

export interface PublicCardStatusCounts {
  sale: number
  trade: number
}

/**
 * Exact sale/trade totals for a user's public profile header (TASK-136 M4,
 * round 2). Decoupled from getUserPublicCardsPage's pagination so the header
 * chips always show the profile's true totals, not just however many cards
 * have been scrolled into view so far.
 *
 * Deliberately two equality-only queries (userId== + status==) rather than
 * one query with an orderBy — equality-only compound filters use Firestore's
 * automatic single-field indexes, so this never needs a new composite index
 * (verified against the deployed index set; see firestore.indexes.json).
 */
export async function getUserPublicCardStatusCounts(userId: string): Promise<PublicCardStatusCounts> {
  const baseCol = collection(db, 'public_cards')
  const [saleSnap, tradeSnap] = await Promise.all([
    getCountFromServer(query(baseCol, where('userId', '==', userId), where('status', '==', 'sale'))),
    getCountFromServer(query(baseCol, where('userId', '==', userId), where('status', '==', 'trade'))),
  ])
  return { sale: saleSnap.data().count, trade: tradeSnap.data().count }
}

/**
 * Total public-card count for a user (TASK-139). Used by UserProfileHoverCard —
 * previously the hover card downloaded the visited user's ENTIRE
 * users/{uid}/cards subcollection via getDocs(where('public','==',true)) just
 * to read snapshot.size, the last residual reader of that ajena subcollection
 * in src/ (blocking TASK-087's firestore.rules tightening). A single
 * equality-only aggregate query gives the same total in one billed read: every
 * doc in /public_cards is already sale or trade by construction (see
 * syncCardToPublic above), so userId== alone equals sale+trade summed —
 * no need for getUserPublicCardStatusCounts' two-query split here.
 *
 * KNOWN DIVERGENCE from the old subcollection count: the old query counted
 * ANY status with public===true (including a 'collection' or 'wishlist' card
 * a user marked public), while /public_cards only ever contains sale/trade
 * (TASK-085 whitelist). Profiles with public wishlist/collection cards will
 * show a lower number here than before — same product-decision gap already
 * flagged as M3 on TASK-136 (pending Rafael).
 */
export async function getUserPublicCardsCount(userId: string): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, 'public_cards'), where('userId', '==', userId))
  )
  return snap.data().count
}

/**
 * Get all public preferences for a specific user (for bidirectional matching)
 */
export async function getUserPublicPreferences(userId: string): Promise<PublicPreference[]> {
  const q = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicPreference))
}

/**
 * Shape of a public_cards search result — matches the inline interface
 * formerly defined in src/views/DashboardView.vue.
 *
 * AMENDMENT B — `extends DocumentData` is REQUIRED so the consumer's
 * `{ id: d.id, ...d.data() } as PublicCardSearchResult` cast compiles.
 */
export interface PublicCardSearchResult extends DocumentData {
  id: string
  cardName?: string
  userId?: string
  edition?: string
  condition?: string
  price?: number
  image?: string
  username?: string
  avatarUrl?: string
  status?: string
  scryfallId?: string
  cardId?: string
  quantity?: number
  foil?: boolean
  location?: string
}

/**
 * Search the denormalized public_cards collection for a card name.
 * Excludes the caller's own cards. Currently does a full-collection
 * scan + client-side substring match (matches DashboardView's prior
 * behavior verbatim — to be optimized in a future phase if scale demands).
 *
 * AMENDMENT B — slice(0, 20) preserves DashboardView:975 cap.
 *
 * @param term Search term, case-insensitive substring match on cardName
 * @param excludeUserId Caller's userId — results owned by this user are filtered out
 */
export const searchPublicCards = async (
  term: string,
  excludeUserId: string,
): Promise<PublicCardSearchResult[]> => {
  const trimmed = term.trim()
  if (!trimmed) return []
  const normalised = trimmed.toLowerCase()

  const cardsRef = collection(db, 'public_cards')
  const snapshot = await getDocs(cardsRef)

  const results: PublicCardSearchResult[] = []
  for (const docSnap of snapshot.docs) {
    const data = { id: docSnap.id, ...docSnap.data() } as PublicCardSearchResult
    if (data.userId === excludeUserId) continue
    const name = (data.cardName ?? '').toLowerCase()
    if (!name.includes(normalised)) continue
    results.push(data)
  }
  return results.slice(0, 20) // Preserves DashboardView:975 cap
}
