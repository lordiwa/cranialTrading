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
import { db } from './firestore'
import type { Card } from '../types/card'

/** Firestore caps an 'in' filter at 30 values. */
const FIRESTORE_IN_LIMIT = 30

/**
 * How many chunk queries may be in flight at once.
 *
 * The match finders used to await their chunks ONE AT A TIME, so a 59k-card
 * collection turned into thousands of serial round-trips on the post-login
 * landing. Unbounded Promise.all is not the answer either — Firestore multiplexes
 * over a limited number of connections and a few thousand simultaneous getDocs
 * just queues with extra memory. 8 is the usual sweet spot.
 */
const MAX_CONCURRENT_CHUNK_QUERIES = 8

/** Split a list into fixed-size chunks. Pure — exported for unit testing. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Map over items with at most `limit` workers running concurrently, preserving
 * input order in the result. Rejects as soon as any task rejects.
 *
 * Pure (given a pure worker) — exported for unit testing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    // Each runner pulls the next index until the queue drains, so a slow task
    // never blocks the others behind a fixed partition.
    for (let i = next++; i < items.length; i = next++) {
      // The loop condition already bounds i, so the indexed access is defined —
      // the cast only satisfies noUncheckedIndexedAccess.
      results[i] = await worker(items[i] as T, i)
    }
  })

  await Promise.all(runners)
  return results
}

export interface PublicCard {
  docId: string // Firestore document ID
  cardId: string // matches the user's card document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  cardNameLower: string // lowercased cardName — matches the prefix query in publicCardSearch.ts
  scryfallId: string
  setCode: string // TASK-138 AC3: Scryfall set code, NOT card.edition (human-readable set_name — see cardEnrichment.ts canonical rule). '' when the source card had no setCode yet; docs written before this field existed are patched in-memory by UserProfileView's enrichPublicCardsInMemory (needsEnrichment/buildEnrichmentPatch already backfill setCode for display — no separate backfill script needed).
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
      setCode: card.setCode ?? '',
      status: card.status as 'trade' | 'sale',
      price: card.price || 0,
      edition: card.edition || '',
      condition: card.condition || 'NM',
      foil: card.foil || false,
      quantity: card.quantity || 1,
      image: card.image || '',
      location: userLocation,
      // TASK-169: el email NO se publica aca. public_cards se lee SIN login
      // (TASK-085, a proposito, para que un visitante vea quien vende), asi que
      // copiar el correo del dueño en cada documento permitia bajarse en masa
      // los emails de toda la plataforma con una peticion anonima. Verificado
      // en vivo contra dev antes de este arreglo. El contacto vive ahora en
      // contact_info/{userId}, que exige estar logueado para leerse.
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
          setCode: card.setCode ?? '',
          status: card.status as 'trade' | 'sale',
          price: card.price || 0,
          edition: card.edition || '',
          condition: card.condition || 'NM',
          foil: card.foil || false,
          quantity: card.quantity || 1,
          image: card.image || '',
          location: userLocation,
          // TASK-169: sin email, ver syncCardToPublic
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
  // TASK-169: sin email, ver syncCardToPublic
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
        setCode: card.setCode ?? '',
        status: card.status,
        price: card.price || 0,
        edition: card.edition || '',
        condition: card.condition || 'NM',
        foil: card.foil || false,
        quantity: card.quantity || 1,
        image: card.image || '',
        location: userLocation ?? '',
        // TASK-169: sin email, ver syncCardToPublic
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
  // TASK-169: sin email, ver syncCardToPublic
  return data
}

export async function syncAllUserPreferences(
  preferences: PreferenceInput[],
  userId: string,
  username: string,
  userLocation?: string,
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
      batch.set(publicPrefRef, buildPreferenceData(pref, userId, username, userAvatarUrl, userLocation))
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

  // Firestore 'in' query limited to 30 items, so chunk — and run the chunks
  // concurrently (bounded): serially awaiting them made this thousands of
  // sequential round-trips on a large collection.
  const chunks = chunkList(cardNames, FIRESTORE_IN_LIMIT)

  const perChunk = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNK_QUERIES, async (chunk) => {
    const q = query(
      collection(db, 'public_cards'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    const found: PublicCard[] = []
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicCard
      if (data.userId !== excludeUserId) {
        found.push({ ...data, docId: docSnap.id })
      }
    })
    return found
  })

  return perChunk.flat()
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

  // Parallel sibling of findCardsMatchingPreferences above — same bounded fanout.
  const chunks = chunkList(cardNames, FIRESTORE_IN_LIMIT)

  const perChunk = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNK_QUERIES, async (chunk) => {
    const q = query(
      collection(db, 'public_preferences'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    const found: PublicPreference[] = []
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicPreference
      if (data.userId !== excludeUserId) {
        found.push({ ...data, docId: docSnap.id })
      }
    })
    return found
  })

  return perChunk.flat()
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

/**
 * Server-side prefix search over a single user's public cards (TASK-138 AC1).
 *
 * Text search on the public profile used to filter only whatever page(s)
 * getUserPublicCardsPage had already loaded (~60 of potentially 5000+ cards)
 * — finding a specific card in a large profile was effectively impossible
 * from the UI. This queries `cardNameLower` directly against Firestore,
 * scoped to `userId`, so it reaches cards regardless of pagination state.
 *
 * Requires the composite index `public_cards: userId ASC, cardNameLower ASC`
 * (firestore.indexes.json) — deploy is manual, done by the team lead.
 *
 * Deliberately NOT cursor-paginated like getUserPublicCardsPage: this is a
 * single capped page (default 50). A "find this card" search returning 50
 * name-prefix matches within one user's profile covers the realistic case;
 * paginating search results themselves would double the gen-token/debounce
 * surface in usePublicProfileCards for a scenario (>50 same-prefix cards for
 * one seller) rare enough not to justify it here.
 */
export async function searchUserPublicCards(
  userId: string,
  term: string,
  pageSize = 50
): Promise<PublicCardsPage> {
  const termLower = term.trim().toLowerCase()
  if (termLower.length < 2) {
    return { cards: [], cursor: null, hasMore: false }
  }

  const constraints = [
    where('userId', '==', userId),
    where('cardNameLower', '>=', termLower),
    where('cardNameLower', '<=', termLower + ''),
    orderBy('cardNameLower'),
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
