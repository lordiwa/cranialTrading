/**
 * TASK-124 review follow-up — HIGH-1 + MEDIUM-2.
 *
 * HIGH-1: loadUserData (auth-state load, exercised here via login()) must
 * sync the /users/{uid} doc's `email` field to Firebase Auth's current email
 * when they diverge. changeRegistrationEmail's verifyBeforeUpdateEmail
 * (TASK-124) changes the Auth email out-of-band — only once the user clicks
 * the confirmation link — so without this sync the Firestore doc goes stale
 * forever. Downstream reads of `authStore.user.email` (SettingsView,
 * UserPopover, and critically UserProfileView's senderEmail on the
 * trade-contact flow) would keep using the abandoned address.
 *
 * MEDIUM-2: verifyBeforeUpdateEmail revokes refresh tokens once the link is
 * clicked, so the "I VERIFIED" button's checkEmailVerification →
 * firebaseUser.reload() call is expected to throw auth/user-token-expired
 * (or auth/user-disabled) right after an email change. That must map to a
 * dedicated "sign in again with your new email" message, not the generic
 * verifyEmailError toast.
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const setDocMock = vi.fn()
const getDocMock = vi.fn()
const updateDocMock = vi.fn()
const signInWithEmailAndPasswordMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  where: vi.fn(),
}))

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPasswordMock(...args),
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
  setDocMock.mockReset()
  getDocMock.mockReset()
  updateDocMock.mockReset()
  signInWithEmailAndPasswordMock.mockReset()
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line import/first
import { useToastStore } from '@/stores/toast'
// eslint-disable-next-line import/first
import { auth as authMock } from '@/services/firebase'

describe('loadUserData email sync (HIGH-1)', () => {
  it('syncs a stale /users doc email to the current Firebase Auth email on login', async () => {
    authMock.currentUser = { uid: 'uid3', email: 'new@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uid3', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        email: 'old@example.com',
        username: 'someuser',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('new@example.com', 'pw')

    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ col: 'users', id: 'uid3' }),
      { email: 'new@example.com' }
    )
    expect(store.user?.email).toBe('new@example.com')
  })

  it('does not write when the doc email already matches Firebase Auth', async () => {
    authMock.currentUser = { uid: 'uid4', email: 'same@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uid4', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        email: 'same@example.com',
        username: 'someuser',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('same@example.com', 'pw')

    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

describe('checkEmailVerification error mapping (MEDIUM-2)', () => {
  it('maps auth/user-token-expired to a "sign in again with your new email" message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/user-token-expired' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.emailChangedReauth')
  })

  it('maps auth/user-disabled to the same reauth message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/user-disabled' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.emailChangedReauth')
  })

  it('regression: other reload failures keep the generic verifyEmailError message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/network-request-failed' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.verifyEmailError')
  })
})
