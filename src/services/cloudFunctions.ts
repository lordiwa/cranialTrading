/**
 * Cloud Functions Client Service
 *
 * Provides typed interfaces for calling Firebase Cloud Functions.
 * These functions run with admin privileges and can bypass security rules.
 */
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { getApp } from 'firebase/app'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from './firebase'
import { logSanitizedError } from '../utils/logSanitizedError'

// Initialize functions with the Firebase app
const functions = getFunctions(getApp())

// TASK-237 AC2: a cached ID token, kept fresh by onIdTokenChanged, so the
// unload-time beacon (sendCardIndexDeltaBeacon below) never needs to await
// auth.currentUser.getIdToken() itself — a pagehide/visibilitychange
// handler is not guaranteed to get to run any code queued after an await,
// so the token has to already be sitting here, synchronously, by the time
// the page starts tearing down.
let _cachedIdToken: string | null = null

// TASK-237 LOW-2: a generation counter guards against a stale getIdToken()
// resolving AFTER a later onIdTokenChanged(null) logout has already cleared
// the cache — without this, the in-flight promise from the earlier (now
// logged-out) user's token fetch repopulates _cachedIdToken with a token
// that no longer belongs to anyone signed in. Every callback invocation
// (login or logout) bumps the generation; a getIdToken() result is only
// written back if its own generation is still current when it resolves.
let _tokenGeneration = 0
onIdTokenChanged(auth, (user) => {
  const generation = ++_tokenGeneration
  if (!user) {
    _cachedIdToken = null
    return
  }
  void user.getIdToken().then((token) => {
    if (generation !== _tokenGeneration) return // superseded by a later auth change — discard
    _cachedIdToken = token
  }).catch((err: unknown) => {
    // Best-effort refresh, same as the rest of this cache's error handling:
    // a rejection here (network down, revoked token) just leaves
    // _cachedIdToken at its previous value — not retried, the next
    // onIdTokenChanged callback (or the current in-flight token's own
    // natural expiry) will get another chance.
    logSanitizedError('[cloudFunctions] Failed to refresh cached ID token', err, 'warn')
  })
})

/**
 * Match notification data sent to the Cloud Function
 */
export interface MatchNotificationData {
  targetUserId: string
  matchId: string
  fromUserId: string
  fromUsername: string
  fromLocation?: string | null
  fromAvatarUrl?: string | null
  myCards: Record<string, unknown>[]
  otherCards: Record<string, unknown>[]
  myTotalValue?: number
  theirTotalValue?: number
  valueDifference?: number
  compatibility: number
  type: 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
}

/**
 * Response from the notifyMatchUser Cloud Function
 */
export interface NotifyMatchResponse {
  success: boolean
  alreadyExists?: boolean
}

/**
 * Notify another user about a match via Cloud Function.
 * This bypasses Firestore security rules to write to another user's collection.
 *
 * @param data - The match notification data
 * @returns Promise with the function result
 *
 * @example
 * ```ts
 * await notifyMatchUser({
 *   targetUserId: 'user123',
 *   matchId: 'match_abc_123',
 *   fromUserId: currentUser.id,
 *   fromUsername: currentUser.username,
 *   myCards: [{ name: 'Lightning Bolt', quantity: 4 }],
 *   otherCards: [],
 *   compatibility: 85,
 *   type: 'UNIDIRECTIONAL'
 * })
 * ```
 */
export async function notifyMatchUser(
  data: MatchNotificationData
): Promise<NotifyMatchResponse> {
  const callable = httpsCallable<MatchNotificationData, NotifyMatchResponse>(
    functions,
    'notifyMatchUser'
  )

  try {
    const result: HttpsCallableResult<NotifyMatchResponse> = await callable(data)
    return result.data
  } catch (error: unknown) {
    console.error('[CloudFunctions] notifyMatchUser error:', error)

    // Handle specific error codes
    const firebaseError = error as { code?: string; message?: string }
    if (firebaseError.code === 'functions/unauthenticated') {
      throw new Error('User must be authenticated to send match notifications')
    }
    if (firebaseError.code === 'functions/invalid-argument') {
      throw new Error(firebaseError.message ?? 'Invalid match notification data')
    }
    if (firebaseError.code === 'functions/permission-denied') {
      throw new Error('Permission denied')
    }

    // Re-throw for other errors
    throw error
  }
}

/**
 * Bulk import cards via Cloud Function (bypasses browser write stream limit).
 * Accepts up to 5000 cards per call. Caller should chunk larger imports.
 */
export interface BulkImportResponse {
  cardIds: string[]
  count: number
}

export async function bulkImportCards(
  cards: Record<string, unknown>[]
): Promise<BulkImportResponse> {
  const callable = httpsCallable<{ cards: Record<string, unknown>[] }, BulkImportResponse>(
    functions,
    'bulkImportCards',
    { timeout: 60000 }
  )
  const result = await callable({ cards })
  return result.data
}

/**
 * Load a chunk of the user's card collection via Cloud Function.
 * Server-side read is ~100x faster than browser SDK for large collections.
 */
export interface CollectionSummary {
  totalCards: number
  statusCounts: Record<string, number>
}

export interface LoadCollectionChunkResponse {
  cards: Record<string, unknown>[]
  lastId: string | null
  hasMore: boolean
  summary?: CollectionSummary
}

export async function loadCollectionChunk(
  startAfterId?: string,
  includeSummary = false,
  normalized = false
): Promise<LoadCollectionChunkResponse> {
  const callable = httpsCallable<
    { limit: number; startAfterId?: string; includeSummary: boolean; normalized: boolean },
    LoadCollectionChunkResponse
  >(functions, 'loadCollectionChunk', { timeout: 60000 })
  const result = await callable({ limit: 10000, startAfterId, includeSummary, normalized })
  return result.data
}

/**
 * Build or rebuild the lightweight card index for the current user.
 * Used for fast filtering & pagination without loading full card data.
 */
export interface BuildCardIndexResponse {
  success: boolean
  totalCards: number
  chunks: number
  elapsed: string
}

export async function buildCardIndex(): Promise<BuildCardIndexResponse> {
  const callable = httpsCallable<Record<string, never>, BuildCardIndexResponse>(
    functions,
    'buildCardIndex',
    { timeout: 300000 }
  )
  const result = await callable({})
  return result.data
}

/**
 * TASK-247 tanda 2c: reconcile the caller's own public-profile index
 * (functions/index.js's `reconcilePublicCardIndex`, wired in tanda 2b but
 * never invoked from the client until this tanda). Self-only — the server
 * derives the target user from `request.auth.uid`, there is no userId
 * parameter to pass. See src/services/publicCards.ts's write functions for
 * where this is called: once per sync operation (not per card), so the
 * fanout is bounded by how often a user's public set changes, not by how
 * many public_cards documents exist.
 *
 * TASK-247 tanda 2c review round (LOW-1): `refused`/`message` removed —
 * they're the shape `reconcilePublicCardIndexForUser` returns internally
 * on a refusal (functions/lib/publicCardIndexReconciler.js), but
 * functions/index.js's onCall (:1951-1952) always converts a `refused`
 * result into a thrown `HttpsError('failed-precondition', ...)` before
 * returning — this callable's success path can never actually carry those
 * fields. The only consumer (scheduleIndexReconcile's triggerIndexReconcileNow,
 * publicCards.ts) discards the return value entirely and handles a refusal
 * via `.catch()` like any other error, so this type only needs to describe
 * what a successful response can actually contain.
 */
export interface ReconcilePublicCardIndexResponse {
  strategy?: string
  isDivergent?: boolean
  reason?: string
  totalChunks?: number
  count?: number
  dryRun?: boolean
}

export async function reconcilePublicCardIndex(): Promise<ReconcilePublicCardIndexResponse> {
  const callable = httpsCallable<Record<string, never>, ReconcilePublicCardIndexResponse>(
    functions,
    'reconcilePublicCardIndex',
    { timeout: 300000 }
  )
  const result = await callable({})
  return result.data
}

/**
 * TASK-232: apply a batch of card_index deltas server-side. Replaces the
 * browser writing card_index chunks directly for status-change/delete
 * mutations — see functions/index.js's applyCardIndexDelta doc comment for
 * the full mechanism (chunkId resolved server-side, fallback scan for
 * missing chunkId on delete, allowInsert compensation for a failed delete).
 */
export interface CardIndexDeltaMutation {
  cardId: string
  action: 'update' | 'delete'
  /**
   * Only for the deleteCard/batchDeleteCards compensation call after a
   * delete-delta already succeeded but the actual doc delete then failed —
   * lets the server re-insert an entry it just removed instead of skipping
   * (the doc still exists, with its real chunkId, at that point).
   */
  allowInsert?: boolean
}

export interface ApplyCardIndexDeltaResponse {
  applied: number
  skipped: number
  skippedIds: string[]
  fallbackUsed: number
}

export async function applyCardIndexDelta(
  mutations: CardIndexDeltaMutation[]
): Promise<ApplyCardIndexDeltaResponse> {
  const callable = httpsCallable<{ mutations: CardIndexDeltaMutation[] }, ApplyCardIndexDeltaResponse>(
    functions,
    'applyCardIndexDelta',
    { timeout: 60000 }
  )
  const result = await callable({ mutations })
  return result.data
}

/**
 * TASK-237 AC2: last-chance delivery for pending card_index deltas when the
 * page is being torn down (reload/navigate/close) before
 * scheduleCardIndexDeltaFlush's 2s debounce elapses.
 *
 * Deliberately NOT httpsCallable — the Functions SDK builds a normal fetch
 * with no keepalive flag, and a normal in-flight fetch gets cancelled by
 * the browser once the page starts unloading (the known beforeunload trap
 * named in the ticket). fetch(..., { keepalive: true }) is the documented
 * way to survive that; it requires building the callable HTTP request by
 * hand (POST https://REGION-PROJECT.cloudfunctions.net/NAME with a
 * {"data": ...} body and a bearer token), since httpsCallable has no way to
 * opt into keepalive.
 *
 * keepalive requests are capped at 64 KiB total body size across all
 * in-flight keepalive fetches (browser-enforced, not negotiable) — fine for
 * the handful of single-card edits a user can plausibly queue in one
 * pending debounce window, but not a general-purpose transport. If the
 * pending batch is unusually large, or this beacon fails outright (network
 * gone, token stale, whatever), TASK-237 AC4's load-time reconciliation is
 * the backstop, not a retry here — there is nothing left to retry from once
 * the page is gone.
 */
export function sendCardIndexDeltaBeacon(mutations: CardIndexDeltaMutation[]): boolean {
  if (mutations.length === 0) return false
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  if (!projectId) return false

  // us-central1 is the project's default — functions/index.js never calls
  // setGlobalOptions({ region }) nor passes a region to any onCall, so every
  // function (applyCardIndexDelta included) deploys to the Firebase default.
  const url = `https://us-central1-${projectId}.cloudfunctions.net/applyCardIndexDelta`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_cachedIdToken) headers.Authorization = `Bearer ${_cachedIdToken}`

  try {
    void fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { mutations } }),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget by design (see doc comment above) — outcome
      // unknown, same accepted uncertainty as _runServerDeltaFlush's normal
      // path.
    })
    return true
  } catch {
    return false
  }
}

/**
 * Load full card objects by IDs with scryfall_cache join.
 * Used for paginated grid display (50-200 cards at a time).
 */
export interface LoadCardPageResponse {
  cards: Record<string, unknown>[]
}

export async function loadCardPage(
  cardIds: string[]
): Promise<LoadCardPageResponse> {
  const callable = httpsCallable<
    { cardIds: string[] },
    LoadCardPageResponse
  >(functions, 'loadCardPage', { timeout: 30000 })
  const result = await callable({ cardIds })
  return result.data
}

/**
 * Query the card_index for a user with server-side filtering, sorting, and pagination.
 * Returns one page of results plus total matching count.
 */
export interface QueryCardIndexRequest {
  userId: string
  filters: {
    search?: string
    status?: string[]
    edition?: string[]
    color?: string[]
    rarity?: string[]
    type?: string[]
    foil?: boolean
    condition?: string[]
    minPrice?: number
    maxPrice?: number
  }
  sort: {
    field: 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'
    direction: 'asc' | 'desc'
  }
  page: number
  pageSize: number
  mode?: 'cards' | 'ids'
}

export interface QueryCardIndexResponse {
  cards: Record<string, unknown>[] | string[]  // Record[] when mode='cards', string[] when mode='ids'
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export async function queryCardIndex(
  params: QueryCardIndexRequest
): Promise<QueryCardIndexResponse> {
  const callable = httpsCallable<QueryCardIndexRequest, QueryCardIndexResponse>(
    functions,
    'queryCardIndex',
    { timeout: 30000 }
  )

  try {
    const result = await callable(params)
    return result.data
  } catch (error: unknown) {
    console.error('[CloudFunctions] queryCardIndex error:', error)

    const firebaseError = error as { code?: string; message?: string }
    if (firebaseError.code === 'functions/unauthenticated') {
      throw new Error('User must be authenticated to query card index')
    }
    if (firebaseError.code === 'functions/invalid-argument') {
      throw new Error(firebaseError.message ?? 'Invalid query parameters')
    }
    if (firebaseError.code === 'functions/internal') {
      throw new Error(firebaseError.message ?? 'Internal server error')
    }

    throw error
  }
}

/**
 * TASK-247 tanda 3: query the PUBLIC card index of the seller whose profile
 * is being viewed (functions/index.js's `queryPublicCardIndex`, whose module
 * functions/lib/publicCardIndexQuery.js carries the full write-up).
 *
 * Two things about this signature are deliberate and are the opposite of
 * `queryCardIndex` right above it:
 *
 * 1. `userId` is REQUIRED and names someone else. `queryCardIndex` had its
 *    userId parameter REMOVED by TASK-214 precisely because it let a caller
 *    read another user's `card_index` — the whole inventory, private cards
 *    included. This function reads `public_card_index`, which is derived
 *    exclusively from `public_cards` (`allow read: if true` in
 *    firestore.rules), so the userId is not a trust boundary here; the
 *    server still validates it against a whitelist regex because the index
 *    path is built by string interpolation and a `/` would name a different
 *    collection entirely.
 * 2. There is no auth requirement. An anonymous visitor browsing a public
 *    profile is the primary use case.
 *
 * `total` is `number | null`: null means the server caught the index
 * mid-rebuild and is refusing to name a count it cannot stand behind, rather
 * than reporting one that could be half the truth. Callers must render that
 * as "updating", never as 0 and never as `cards.length`.
 */
export interface PublicIndexCard {
  s: string   // scryfallId — the client derives the image URL from this
  i: string   // the owner's card document id
  n: string   // display name, `//` intact for split cards
  q: number   // quantity
  p: number   // price
  st: 'sale' | 'trade'
  f: boolean  // foil
  cn: string  // condition
  sc: string  // set code
  ed: string  // human-readable set name
  co: string[] // colors (W/U/B/R/G), [] for colorless
  r: string   // rarity initial: c/u/r/m
  t: string   // type line
  /**
   * produced_mana — present ONLY for cards that produce mana, which in
   * practice means lands. Lands print no `colors`, so this is the only thing
   * that can colour a Swamp; the server filters on it too (see
   * functions/lib/publicCardIndexQuery.js's matchesColor). Omitted rather
   * than sent as `[]` because an empty array still costs 8 bytes on every
   * one of the ~70% of rows that are not lands — measured +480 B per 60-row
   * page if always sent, vs ~+234 B (3.1 ms at 600 Kbps) sending it only
   * where it means something.
   */
  pm?: string[]
}

export interface QueryPublicCardIndexRequest {
  userId: string
  filters?: {
    search?: string
    status?: string[]
    /** OR-inclusive letters (W/U/B/R/G, plus C for colorless). A B/G card matches both B and G. */
    color?: string[]
    rarity?: string[]
    type?: string[]
    manaValue?: (number | string)[]
    edition?: string[]
    keywords?: string[]
    formats?: string[]
    foil?: boolean
    condition?: string[]
    minPrice?: number
    maxPrice?: number
    powerMin?: number
    powerMax?: number
    toughnessMin?: number
    toughnessMax?: number
    fullArt?: boolean
  }
  sort?: {
    field: 'name' | 'price' | 'edition' | 'quantity' | 'dateAdded'
    direction: 'asc' | 'desc'
  }
  page?: number
  pageSize?: number
  mode?: 'cards' | 'facets'
}

export interface PublicCardIndexState {
  /**
   * Whether this seller's index has ever been built (`_meta` exists). An
   * unbuilt index is NOT an empty shop, and until TASK-247 tanda 4 ronda 2
   * the two were indistinguishable — every count came back 0 either way,
   * while the profile header kept showing the seller's real "1703 for sale".
   * MEASURED 2026-08-19: zero accounts have a built index in either project,
   * so this is every profile's state until the backfill runs.
   */
  built: boolean
  schemaVersion: number
  totalChunks: number
  /** How many entries the index itself believes it holds. */
  count: number
  /** A reconciliation holds a fresh lease right now. */
  reconciling: boolean
  /** The index was caught mid-rebuild; `total` is null and counts are not trustworthy. */
  partial: boolean
  /**
   * Entries a color filter dropped for having no usable color data (measured
   * 2026-08-18: 474 of 6,647, 7.1%). `null` under `partial`, for the same
   * reason `total` and `facets` are: a firm "474 hidden" next to "we cannot
   * tell you how many there are" would be the inconsistency the mid-rebuild
   * detector exists to avoid.
   */
  missing: number | null
}

export interface PublicCardIndexFacets {
  color: Record<string, number>
  status: Record<string, number>
  rarity: Record<string, number>
  type: Record<string, number>
}

export interface QueryPublicCardIndexResponse {
  cards: PublicIndexCard[]
  total: number | null
  page: number
  pageSize: number
  hasMore: boolean
  /**
   * `null` for the same reason `total` is: under `indexState.partial` these
   * are counts over an incomplete read of the index, so the server refuses to
   * state them rather than let the UI put a confident number on a chip.
   */
  facets: PublicCardIndexFacets | null
  indexState: PublicCardIndexState
}

export async function queryPublicCardIndex(
  params: QueryPublicCardIndexRequest
): Promise<QueryPublicCardIndexResponse> {
  const callable = httpsCallable<QueryPublicCardIndexRequest, QueryPublicCardIndexResponse>(
    functions,
    'queryPublicCardIndex',
    { timeout: 30000 }
  )

  try {
    const result = await callable(params)
    return result.data
  } catch (error: unknown) {
    logSanitizedError('[CloudFunctions] queryPublicCardIndex error', error)

    const firebaseError = error as { code?: string; message?: string }
    if (firebaseError.code === 'functions/invalid-argument') {
      throw new Error(firebaseError.message ?? 'Invalid query parameters')
    }
    if (firebaseError.code === 'functions/internal') {
      throw new Error(firebaseError.message ?? 'Internal server error')
    }

    throw error
  }
}
