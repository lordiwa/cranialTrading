/**
 * Lightweight stats service. Uses Firestore aggregation queries when
 * available (cheap, server-side count) with a defensive fallback to
 * full-collection reads.
 */
import { collection, getCountFromServer, getDocs } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Returns the total number of registered users (excluding the calling
 * user is the caller's responsibility — this returns the raw count).
 *
 * AMENDMENT A — fail-closed with nested try/catch:
 * Prefers getCountFromServer (Firestore v9.12+; we run firebase ^11 so
 * it is always available). On any failure of the aggregation query,
 * falls back to a full-collection getDocs read. If THAT also fails
 * (e.g. Firestore Security Rules rejection), returns 0.
 *
 * Caller clamps via Math.max(0, result - 1) for self-exclusion.
 */
export const getTotalUserCount = async (): Promise<number> => {
  const usersRef = collection(db, 'users')
  try {
    const snapshot = await getCountFromServer(usersRef)
    return snapshot.data().count
  } catch {
    try {
      const docsSnap = await getDocs(usersRef)
      return docsSnap.docs.length
    } catch {
      return 0 // Fail-closed; caller clamps Math.max(0, n - 1)
    }
  }
}
