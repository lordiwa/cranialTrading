/**
 * Regression lock for TASK-172 — reCAPTCHA/gapi iframe loads on every app
 * boot even when nobody uses Google sign-in.
 *
 * Root cause: services/firebase.ts used to pass `popupRedirectResolver:
 * browserPopupRedirectResolver` to initializeAuth(), which makes Firebase
 * Auth eagerly mount the popup/redirect resolver (and the reCAPTCHA/gapi
 * iframe it injects) at app-init time, not at sign-in time. The fix moves
 * the resolver to be a per-call third argument of signInWithPopup() (see
 * stores/auth.ts loginWithGoogle, tested separately in
 * auth.loginWithGoogle.test.ts) instead of a global initializeAuth() option.
 *
 * This lock only needs to prove initializeAuth() is no longer called with a
 * popupRedirectResolver option — it does not need real Firebase.
 */
import { vi } from 'vitest'

const initializeAuthMock = vi.fn(() => ({ currentUser: null }))
const browserPopupRedirectResolverMock = { __marker: 'browserPopupRedirectResolver' }

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: { __marker: 'browserLocalPersistence' },
  browserPopupRedirectResolver: browserPopupRedirectResolverMock,
  initializeAuth: (...args: unknown[]) => initializeAuthMock(...args),
}))

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  memoryLocalCache: vi.fn(() => ({})),
}))

beforeEach(() => {
  vi.resetModules()
  initializeAuthMock.mockClear()
})

describe('services/firebase initializeAuth call', () => {
  it('does not pass popupRedirectResolver to initializeAuth', async () => {
    await import('@/services/firebase')

    expect(initializeAuthMock).toHaveBeenCalledTimes(1)
    const options = initializeAuthMock.mock.calls[0][1] as Record<string, unknown>
    expect(options).not.toHaveProperty('popupRedirectResolver')
    expect(options.persistence).toBeDefined()
  })
})
