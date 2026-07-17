/**
 * TASK-124 — "cambiar email" post-registro must update the SAME just-created
 * account (verifyBeforeUpdateEmail), never spin up a second Firebase Auth
 * account. Rafael's grooming decision (2026-07-17), option (e): no second
 * registration ⇒ no orphan /usernames reservation ⇒ no misleading
 * "username taken" toast when the user re-submits with a different email.
 *
 * Covers: (a) happy path calls verifyBeforeUpdateEmail on auth.currentUser,
 * never createUserWithEmailAndPassword/reserveUsername; (b) success toast;
 * (c) auth/requires-recent-login and other Firebase error codes map to a
 * useful message — never the register flow's "username taken" string;
 * (d) no-current-user guard; (e) regression — the plain register() flow is
 * untouched by this addition.
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const setDocMock = vi.fn()
const getDocMock = vi.fn()
const createUserWithEmailAndPasswordMock = vi.fn()
const verifyBeforeUpdateEmailMock = vi.fn()
const sendEmailVerificationMock = vi.fn()
const deleteUserMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserWithEmailAndPasswordMock(...args),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendEmailVerification: (...args: unknown[]) => sendEmailVerificationMock(...args),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  verifyBeforeUpdateEmail: (...args: unknown[]) => verifyBeforeUpdateEmailMock(...args),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  setDocMock.mockReset()
  getDocMock.mockReset()
  createUserWithEmailAndPasswordMock.mockReset()
  verifyBeforeUpdateEmailMock.mockReset()
  sendEmailVerificationMock.mockReset().mockResolvedValue(undefined)
  deleteUserMock.mockReset()
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line import/first
import { useToastStore } from '@/stores/toast'
// eslint-disable-next-line import/first
import { auth as authMock } from '@/services/firebase'

describe('changeRegistrationEmail', () => {
  it('calls verifyBeforeUpdateEmail on the current user and creates no new account', async () => {
    const currentUser = { uid: 'uid1', email: 'old@example.com' }
    authMock.currentUser = currentUser as never
    verifyBeforeUpdateEmailMock.mockResolvedValueOnce(undefined)

    const store = useAuthStore()
    const result = await store.changeRegistrationEmail('new@example.com')

    expect(result).toBe(true)
    expect(verifyBeforeUpdateEmailMock).toHaveBeenCalledWith(currentUser, 'new@example.com')
    expect(createUserWithEmailAndPasswordMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled() // no reserveUsername, no new user doc
  })

  it('shows a success toast on success', async () => {
    authMock.currentUser = { uid: 'uid1', email: 'old@example.com' } as never
    verifyBeforeUpdateEmailMock.mockResolvedValueOnce(undefined)

    const store = useAuthStore()
    const toastStore = useToastStore()
    await store.changeRegistrationEmail('new@example.com')

    const lastToast = toastStore.toasts.at(-1)
    expect(lastToast?.type).toBe('success')
    expect(lastToast?.message).toBe('auth.messages.changeEmailSent')
  })

  it('maps auth/requires-recent-login to a useful message, never "username taken"', async () => {
    authMock.currentUser = { uid: 'uid1', email: 'old@example.com' } as never
    verifyBeforeUpdateEmailMock.mockRejectedValueOnce({ code: 'auth/requires-recent-login' })

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.changeRegistrationEmail('new@example.com')

    expect(result).toBe(false)
    const lastToast = toastStore.toasts.at(-1)
    expect(lastToast?.message).toBe('auth.messages.changeEmailRequiresRecentLogin')
    expect(lastToast?.message).not.toBe('auth.messages.usernameTaken')
  })

  it('maps auth/email-already-in-use to a dedicated message', async () => {
    authMock.currentUser = { uid: 'uid1', email: 'old@example.com' } as never
    verifyBeforeUpdateEmailMock.mockRejectedValueOnce({ code: 'auth/email-already-in-use' })

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.changeRegistrationEmail('new@example.com')

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.changeEmailInUse')
  })

  it('falls back to a generic change-email error for unknown codes', async () => {
    authMock.currentUser = { uid: 'uid1', email: 'old@example.com' } as never
    verifyBeforeUpdateEmailMock.mockRejectedValueOnce({ code: 'auth/network-request-failed' })

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.changeRegistrationEmail('new@example.com')

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.changeEmailError')
  })

  it('returns false and shows notAuthenticated when there is no current user', async () => {
    authMock.currentUser = null

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.changeRegistrationEmail('new@example.com')

    expect(result).toBe(false)
    expect(verifyBeforeUpdateEmailMock).not.toHaveBeenCalled()
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.notAuthenticated')
  })

  it('LOW-2 guard: does not call verifyBeforeUpdateEmail when newEmail matches the current email', async () => {
    authMock.currentUser = { uid: 'uid1', email: 'same@example.com' } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.changeRegistrationEmail('same@example.com')

    expect(result).toBe(false)
    expect(verifyBeforeUpdateEmailMock).not.toHaveBeenCalled()
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.changeEmailSameAsCurrent')
  })

  it('regression: the plain register() flow is untouched by this addition', async () => {
    createUserWithEmailAndPasswordMock.mockResolvedValueOnce({ user: { uid: 'uidX' } })
    setDocMock.mockResolvedValue(undefined) // reserveUsername + user doc
    getDocMock.mockResolvedValueOnce({ exists: () => false }) // loadUserData lookup post-register

    const store = useAuthStore()
    const result = await store.register('a@b.com', 'password123', 'someuser', 'Buenos Aires')

    expect(result).toBe(true)
    expect(createUserWithEmailAndPasswordMock).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'password123')
    expect(sendEmailVerificationMock).toHaveBeenCalled()
    expect(verifyBeforeUpdateEmailMock).not.toHaveBeenCalled()
  })
})
