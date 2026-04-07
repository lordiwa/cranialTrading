/**
 * Cloud Functions Client Service
 *
 * Provides typed interfaces for calling Firebase Cloud Functions.
 * These functions run with admin privileges and can bypass security rules.
 */
import { getFunctions, httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { getApp } from 'firebase/app'

// Initialize functions with the Firebase app
const functions = getFunctions(getApp())

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

export async function buildCardIndex(
  userId?: string
): Promise<BuildCardIndexResponse> {
  const callable = httpsCallable<
    { userId?: string },
    BuildCardIndexResponse
  >(functions, 'buildCardIndex', { timeout: 300000 })
  const result = await callable({ userId })
  return result.data
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
