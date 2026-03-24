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
