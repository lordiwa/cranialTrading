/**
 * TASK-129 (perf F2): initAuth's onAuthStateChanged handler must write the
 * resolved state to the localStorage last-known cache (@/utils/authLastKnown)
 * synchronously, in both branches, so the router guard and App.vue's loader
 * gate can make an optimistic decision on the NEXT app load without waiting
 * on the Firebase round-trip. Does not touch initAuth's existing timing —
 * only asserts the two new writes.
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

const signOutMock = vi.fn()

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: (...args: unknown[]) => signOutMock(...args),
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
  localStorage.clear()
  getDocMock.mockReset()
  onAuthStateChangedMock.mockReset()
  signOutMock.mockReset()
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line import/first
import { getLastKnownAuthState, setLastKnownAuthState } from '@/utils/authLastKnown'

describe('auth store — last-known auth state cache (TASK-129)', () => {
  // NOTE: initAuth() guards on a module-level `authUnsubscribe` singleton
  // (src/stores/auth.ts) and is a no-op on a second call within the same
  // module instance — so this exercises both transitions through ONE
  // initAuth() call and ONE captured onAuthStateChanged callback, same as a
  // real Firebase subscription observing the user sign out then sign back
  // in, rather than splitting into two separate `it()` blocks.
  it('writes "guest" then "authenticated" synchronously as onAuthStateChanged transitions, before loadUserData settles', () => {
    let capturedCallback: ((user: unknown) => void) | undefined
    onAuthStateChangedMock.mockImplementation((_auth: unknown, cb: (user: unknown) => void) => {
      capturedCallback = cb
      return () => {}
    })
    // loadUserData's getDoc never resolves in this test — proves the
    // "authenticated" write happens BEFORE that async round-trip settles.
    getDocMock.mockImplementation(() => new Promise(() => {}))

    const store = useAuthStore()
    store.initAuth()

    capturedCallback?.(null)
    expect(getLastKnownAuthState()).toBe('guest')
    expect(store.loading).toBe(false)

    capturedCallback?.({ uid: 'u1', emailVerified: true })
    expect(getLastKnownAuthState()).toBe('authenticated')
  })
})

describe('auth store — logout writes last-known "guest" explicitly (review fix batch LOW-1)', () => {
  it('writes "guest" before reloading, without relying on onAuthStateChanged(null) (which early-returns while isLoggingOut is true)', async () => {
    const reloadSpy = vi.spyOn(globalThis.location, 'reload').mockImplementation(() => {})
    setLastKnownAuthState('authenticated')
    signOutMock.mockResolvedValueOnce(undefined)

    const store = useAuthStore()
    await store.logout()

    expect(getLastKnownAuthState()).toBe('guest')
    expect(reloadSpy).toHaveBeenCalledTimes(1)

    reloadSpy.mockRestore()
  })
})
