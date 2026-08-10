/**
 * Regression lock for TASK-122 — sanitize Firebase error logging in auth.ts.
 *
 * A pre-existing LOW finding (TASK-118 review) noted that some Firebase Auth
 * error shapes carry a `customData.credential` payload, and auth.ts was
 * logging the raw error object to console.error in the Google login flow.
 * These tests assert the sanitized `logAuthError` helper never leaks the raw
 * object (or its credential) to the console, while user-facing toast
 * behavior stays exactly as before (AC2).
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
vi.mock('@/services/firestore', () => ({ db: {} }))

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
  verifyBeforeUpdateEmail: vi.fn(),
  // TASK-172: loginWithGoogle now reads authFns.browserPopupRedirectResolver
  // to pass it as signInWithPopup's third argument — must be present in the
  // mock or the module-namespace property access itself throws.
  browserPopupRedirectResolver: { __marker: 'browserPopupRedirectResolver' },
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
// eslint-disable-next-line import/first
import { useToastStore } from '@/stores/toast'

describe('auth store error logging sanitization (TASK-122)', () => {
  it('never logs the raw Firebase error object (or customData.credential) on a Google login failure', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secretToken = 'super-secret-oauth-access-token-should-never-be-logged'
    signInWithPopupMock.mockRejectedValueOnce({
      code: 'auth/account-exists-with-different-credential',
      message: 'boom',
      customData: { credential: { accessToken: secretToken } },
    })

    const store = useAuthStore()
    const result = await store.loginWithGoogle()

    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)

    // Every argument passed to console.error must be a plain string or a
    // sanitized {code, message} object — never the raw error, never anything
    // containing the credential.
    const args = consoleErrorSpy.mock.calls[0]
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        expect(arg).not.toHaveProperty('customData')
        expect(Object.keys(arg).sort()).toEqual(['code', 'message'])
      }
      expect(JSON.stringify(arg)).not.toContain(secretToken)
    }

    consoleErrorSpy.mockRestore()
  })

  it('keeps the Google login error toast unchanged for a mapped failure', async () => {
    signInWithPopupMock.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'network down' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = useAuthStore()
    const toastStore = useToastStore()
    const showSpy = vi.spyOn(toastStore, 'show')

    const result = await store.loginWithGoogle()

    expect(result).toBe(false)
    expect(showSpy).toHaveBeenCalledWith('auth.messages.googleLoginError', 'error')
  })

  it('keeps the popup-closed-by-user cancel path silent (no toast) regardless of logging changes', async () => {
    signInWithPopupMock.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = useAuthStore()
    const toastStore = useToastStore()
    const showSpy = vi.spyOn(toastStore, 'show')

    const result = await store.loginWithGoogle()

    expect(result).toBe(false)
    expect(showSpy).not.toHaveBeenCalled()
  })

  // MEDIUM-1 (reviewer follow-up): logAuthError used to destructure `error`
  // directly, which throws on `Promise.reject(null)`/`undefined` and would
  // let that exception escape the catch block before any toast fires.
  it('does not throw when the rejected error is null, and logs a safe {code: undefined, message: undefined} shape', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDocMock.mockRejectedValueOnce(null)

    const store = useAuthStore()
    const result = await store.checkUsernameAvailable('somebody')

    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking username:', { code: undefined, message: undefined })

    consoleErrorSpy.mockRestore()
  })

  // LOW-1 (reviewer follow-up): GeolocationPositionError.code is numeric
  // (1/2/3) — logAuthError used to only accept string codes and silently
  // dropped it.
  it('preserves a numeric error code (e.g. GeolocationPositionError) instead of dropping it', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError)
        },
      },
    })

    const store = useAuthStore()
    const result = await store.detectLocation()

    expect(result).toBeNull()
    const geoWarnCall = consoleWarnSpy.mock.calls.find((call) => call[0] === 'Browser geolocation failed, trying IP-based:')
    expect(geoWarnCall?.[1]).toEqual({ code: 1, message: 'User denied Geolocation' })

    consoleWarnSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
