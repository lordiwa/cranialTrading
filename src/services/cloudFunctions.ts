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

// Initialize functions with the Firebase app
const functions = getFunctions(getApp())

// TASK-237 AC2: a cached ID token, kept fresh by onIdTokenChanged, so the
// unload-time beacon (sendCardIndexDeltaBeacon below) never needs to await
// auth.currentUser.getIdToken() itself — a pagehide/visibilitychange
// handler is not guaranteed to get to run any code queued after an await,
// so the token has to already be sitting here, synchronously, by the time
// the page starts tearing down.
let _cachedIdToken: string | null = null
onIdTokenChanged(auth, (user) => {
  if (!user) {
    _cachedIdToken = null
    return
  }
  void user.getIdToken().then((token) => { _cachedIdToken = token })
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
