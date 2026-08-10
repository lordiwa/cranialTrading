import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firestore';
import { normalizeUsername } from '../utils/username';

/**
 * Deterministic username → uid resolution (D-10, UNIQ-04).
 * Index-first via /usernames/{norm}; legacy where/limit(1) fallback for
 * users not yet backfilled (safe during migration, D-17). Fixes the SCRUM-70
 * non-deterministic limit(1) that resolved duplicates to the wrong account.
 */
export async function resolveUsernameToUid(
  uname: string
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const norm = normalizeUsername(uname);
  if (!norm) return null;

  // 1. Index-first.
  const indexSnap = await getDoc(doc(db, 'usernames', norm));
  if (indexSnap.exists()) {
    const uid = (indexSnap.data() as { uid?: string }).uid;
    if (uid) {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        return { id: uid, data: userSnap.data() as Record<string, unknown> };
      }
    }
  }

  // 2. Legacy fallback (not-yet-backfilled users).
  const usersCol = collection(db, 'users');
  const legacy = await getDocs(query(usersCol, where('username', '==', norm), limit(1)));
  const first = legacy.docs[0];
  if (!legacy.empty && first) {
    return { id: first.id, data: first.data() as Record<string, unknown> };
  }

  // 3. Unresolved.
  return null;
}
