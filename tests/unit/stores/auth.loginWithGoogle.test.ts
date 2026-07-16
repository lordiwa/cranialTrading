/**
 * Regression lock for TASK-118 — Google sign-in shared flow.
 *
 * loginWithGoogle() is the single store method that HeaderLoginDropdown
 * (login + register entry point, unchanged) and RegisterView (new, TASK-118)
 * both call directly — it is the one place a Google-auth regression would
 * break all three UI entry points at once. It had no test coverage before
 * this ticket. Covers: new-user path (username reservation via the shared
 * reserveUniqueUsername helper, D-07/SCRUM-73), returning-user path (no
 * re-creation of the user doc), and the popup-closed-by-user cancel path
 * (no error toast, clean false return).
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const setDocMock = vi.fn()
const getDocMock = vi.fn()
const signInWithPopupMock = vi.fn()

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
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  setDocMock.mockReset()
  getDocMock.mockReset()
  signInWithPopupMock.mockReset()
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'

describe('loginWithGoogle', () => {
  it('reserves a unique username and creates the user doc for a brand-new Google user', async () => {
    signInWithPopupMock.mockResolvedValueOnce({
      user: { uid: 'uid1', displayName: 'Rafael M', email: 'rafael@example.com', photoURL: 'http://x/p.png' },
    })
    getDocMock
      .mockResolvedValueOnce({ exists: () => false }) // users/uid1 lookup
      .mockResolvedValueOnce({ exists: () => false }) // no user doc for loadUserData
    setDocMock.mockResolvedValue(undefined) // username reservation + user doc both succeed

    const store = useAuthStore()
    const result = await store.loginWithGoogle()

    expect(result).toBe(true)
    // First setDoc call is the username reservation (usernames/<candidate>).
    const usernameCall = setDocMock.mock.calls[0][0] as { col: string }
    expect(usernameCall.col).toBe('usernames')
    // Second setDoc call creates the user doc with the reserved username + avatar.
    const userDocCall = setDocMock.mock.calls[1][1] as { avatarUrl: string | null; username: string }
    expect(userDocCall.avatarUrl).toBe('http://x/p.png')
    expect(userDocCall.username).toBeTruthy()
  })

  it('does not re-create the user doc for a returning Google user', async () => {
    signInWithPopupMock.mockResolvedValueOnce({
      user: { uid: 'uid2', displayName: 'Existing User', email: 'existing@example.com', photoURL: null },
    })
    getDocMock
      .mockResolvedValueOnce({ exists: () => true }) // users/uid2 already exists
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ email: 'existing@example.com', username: 'existing_user', location: '', createdAt: { toDate: () => new Date() } }),
      })

    const store = useAuthStore()
    const result = await store.loginWithGoogle()

    expect(result).toBe(true)
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('returns false without an error toast when the user closes the popup', async () => {
    signInWithPopupMock.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' })

    const store = useAuthStore()
    const result = await store.loginWithGoogle()

    expect(result).toBe(false)
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
