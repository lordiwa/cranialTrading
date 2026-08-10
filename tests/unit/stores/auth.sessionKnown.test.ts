/**
 * TASK-165 — decouple the router guard from the full profile load.
 *
 * Root cause fixed here: `loading` only flips false in loadUserData's
 * `finally` (stores/auth.ts), i.e. AFTER the `/users/{uid}` getDoc round-trip
 * settles. The router guard (router/authGuard.ts) waits on that single flag
 * to know whether there's a session — so a requiresAuth navigation (e.g.
 * /inicio) can't even start downloading its own view chunk until the profile
 * read finishes, even though Firebase Auth itself already knows if there's a
 * session much earlier (onAuthStateChanged fires before loadUserData is even
 * called).
 *
 * This introduces two new store fields, written SYNCHRONOUSLY inside the
 * onAuthStateChanged callback (before the async loadUserData call), so a
 * consumer can know "is there a session" without waiting on the profile:
 *  - sessionKnown: true once onAuthStateChanged has fired at least once
 *    (mirrors `loading` conceptually, but for session existence only).
 *  - hasSession: true/false mirroring `Boolean(firebaseUser)`.
 *
 * `loading`/`user` keep their EXACT existing semantics (full profile ready) —
 * this ticket does not touch them, since ~30 other consumers across the app
 * assume `loading === false` implies `user` is fully populated.
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const getDocMock = vi.fn()
const onAuthStateChangedMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  deleteUser: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  getDocMock.mockReset()
  onAuthStateChangedMock.mockReset()
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'

describe('auth store — sessionKnown/hasSession (TASK-165)', () => {
  it('starts with sessionKnown=false and hasSession=false, same as loading=true/user=null', () => {
    const store = useAuthStore()

    expect(store.sessionKnown).toBe(false)
    expect(store.hasSession).toBe(false)
    expect(store.loading).toBe(true)
    expect(store.user).toBe(null)
  })

  it('flips sessionKnown=true and hasSession=true SYNCHRONOUSLY on a logged-in session, before the profile getDoc settles', async () => {
    let capturedCallback: ((user: unknown) => void) | undefined
    onAuthStateChangedMock.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })
    // Never resolves — proves sessionKnown/hasSession don't wait on this.
    getDocMock.mockImplementation(() => new Promise(() => {}))

    const store = useAuthStore()
    await store.firebaseNeededNow()

    capturedCallback?.({ uid: 'u1', emailVerified: true })

    expect(store.sessionKnown).toBe(true)
    expect(store.hasSession).toBe(true)
    // The profile read is still in flight — loading/user must NOT have moved.
    expect(store.loading).toBe(true)
    expect(store.user).toBe(null)
  })

  it('flips sessionKnown=true and hasSession=false on a guest resolution (mirrors loading/user timing exactly)', async () => {
    let capturedCallback: ((user: unknown) => void) | undefined
    onAuthStateChangedMock.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })

    const store = useAuthStore()
    await store.firebaseNeededNow()

    capturedCallback?.(null)

    expect(store.sessionKnown).toBe(true)
    expect(store.hasSession).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.user).toBe(null)
  })

  it('the profile arriving later does not change hasSession — it stays true from the moment the session was known', async () => {
    let capturedCallback: ((user: unknown) => void) | undefined
    onAuthStateChangedMock.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: 'a@b.com', username: 'u1', location: '', createdAt: { toDate: () => new Date() } }),
    })

    const store = useAuthStore()
    await store.firebaseNeededNow()

    capturedCallback?.({ uid: 'u1', emailVerified: true })
    expect(store.hasSession).toBe(true)
    expect(store.loading).toBe(true) // profile still loading

    // Let loadUserData's getDoc settle.
    await vi.waitFor(() => { expect(store.loading).toBe(false) })

    expect(store.hasSession).toBe(true)
    expect(store.user?.username).toBe('u1')
  })
})
