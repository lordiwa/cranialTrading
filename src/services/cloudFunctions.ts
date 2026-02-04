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
  myCards: any[]
  otherCards: any[]
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
  } catch (error: any) {
    console.error('[CloudFunctions] notifyMatchUser error:', error)

    // Handle specific error codes
    if (error.code === 'functions/unauthenticated') {
      throw new Error('User must be authenticated to send match notifications')
    }
    if (error.code === 'functions/invalid-argument') {
      throw new Error(error.message || 'Invalid match notification data')
    }
    if (error.code === 'functions/permission-denied') {
      throw new Error('Permission denied')
    }

    // Re-throw for other errors
    throw error
  }
}
