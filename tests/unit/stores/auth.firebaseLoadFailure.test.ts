/**
 * TASK-132 review fix (HIGH-1, MEDIUM-1) — regression locks.
 *
 * HIGH-1: loadFirebaseDeps/ensureSubscription used to memoize a REJECTED
 * promise forever — a failed SDK import (network blip, stale deployment)
 * permanently stalled auth resolution with no way to recover short of a
 * full page reload. Fix: clear the memo on failure so the next call
 * attempts a fresh import, and never leave `loading` stuck true.
 *
 * MEDIUM-1: initAuth()'s re-entrancy branch used to call ensureSubscription()
 * directly on a second call (e.g. App.vue's onMounted re-calling initAuth()
 * right after main.ts's own call), starting the SDK download immediately
 * and defeating the whole point of deferring it past first paint.
 *
 * Every test that touches the failure path here uses vi.resetModules() and
 * re-imports pinia + the store fresh — loadFirebaseDeps's memo lives at
 * MODULE scope (by design, so it survives Pinia store resets in
 * production), which means it persists across tests in the SAME file
 * unless the whole module registry is reset. Without this, a test that
 * lets a retry succeed would permanently "poison" firebaseDepsPromise into
 * a resolved state for every test declared after it.
 */
import { vi } from 'vitest'

const state = vi.hoisted(() => ({
  authAccessAttempts: 0,
  authShouldFailOnce: false,
  dbAccessAttempts: 0,
  dbShouldFailOnce: false,
}))

const getDocMock = vi.fn()
const onAuthStateChangedMock = vi.fn()
const signInWithEmailAndPasswordMock = vi.fn()

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

// The `auth` export is a GETTER instead of a plain value so a test can make
// exactly the NEXT access throw — this makes loadFirebaseDeps()'s internal
// `.then(([...]) => ({ ..., auth: services.auth, ... }))` mapper throw,
// which is observably identical (from every caller's perspective) to the
// underlying dynamic import() itself having failed: either way,
// loadFirebaseDeps()'s returned promise rejects.
vi.mock('@/services/firebase', () => ({
  get auth() {
    state.authAccessAttempts++
    if (state.authShouldFailOnce) {
      state.authShouldFailOnce = false
      throw new Error('simulated chunk load failure')
    }
    return { currentUser: null }
  },
  db: {},
}))
// TASK-178 phase 2: `db` is a getter for the same reason `auth` above is —
// so a test can make exactly the next access throw, which makes
// loadFirestoreDeps()'s mapper reject. Needed as its OWN switch now that the
// two halves load and memoize independently: firestore-only callers
// (checkUsernameAvailable, reserveUsername, ...) no longer touch `auth` at
// all, so the auth switch can't reach them any more.
vi.mock('@/services/firestore', () => ({
  get db() {
    state.dbAccessAttempts++
    if (state.dbShouldFailOnce) {
      state.dbShouldFailOnce = false
      throw new Error('simulated firestore chunk load failure')
    }
    return {}
  },
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
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

/** Fresh pinia + fresh store + fresh toast store, all from the SAME reset module registry. */
async function freshStores() {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useAuthStore } = await import('@/stores/auth')
  const { useToastStore } = await import('@/stores/toast')
  return { store: useAuthStore(), toastStore: useToastStore() }
}

beforeEach(() => {
  vi.resetModules()
  state.authAccessAttempts = 0
  state.authShouldFailOnce = false
  state.dbAccessAttempts = 0
  state.dbShouldFailOnce = false
  getDocMock.mockReset()
  onAuthStateChangedMock.mockReset()
  signInWithEmailAndPasswordMock.mockReset()
})

describe('loadFirebaseDeps memoized-rejection fix (HIGH-1)', () => {
  it('a failed FIRESTORE import is not cached forever — the next call attempts a fresh import and can succeed', async () => {
    getDocMock.mockResolvedValue({ exists: () => false })
    state.dbShouldFailOnce = true
    const { store } = await freshStores()

    // First call: the underlying deps load fails. checkUsernameAvailable's
    // own catch-all returns false gracefully — the important assertion is
    // what happens on the SECOND call, not this one.
    const firstResult = await store.checkUsernameAvailable('someuser')
    expect(firstResult).toBe(false)
    expect(state.dbAccessAttempts).toBe(1)

    // Second call: if the rejected promise were still memoized (the bug),
    // this would replay the SAME failure without ever touching the mock
    // again. Because it's cleared, this attempts a fresh import — the
    // getter fires again (attempt 2) and this time succeeds.
    const secondResult = await store.checkUsernameAvailable('someuser')
    expect(secondResult).toBe(true)
    expect(state.dbAccessAttempts).toBe(2)
  })

  // TASK-178 phase 2: same guarantee, now proven on the auth half too — the
  // two memos are separate variables, so the recovery behaviour had to be
  // re-established for each rather than inherited from the single old one.
  it('a failed AUTH import is not cached forever either', async () => {
    state.authShouldFailOnce = true
    const { store } = await freshStores()

    await store.firebaseNeededNow()
    expect(state.authAccessAttempts).toBe(1)
    expect(onAuthStateChangedMock).not.toHaveBeenCalled()

    await store.firebaseNeededNow()
    expect(state.authAccessAttempts).toBe(2)
    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
  })

  // TASK-178 phase 2, the split's actual load-bearing claim: the boot path
  // (ensureSubscription, what the router guard waits on) must resolve WITHOUT
  // the Firestore half being loaded at all. `db` is a getter, so an untouched
  // dbAccessAttempts is direct evidence that services/firestore was never
  // pulled in — which is what keeps the 112KB firestore chunk off the boot
  // request list. If someone later reroutes ensureSubscription back through
  // loadFirebaseDeps(), this goes red.
  it('the boot subscription resolves without ever loading the Firestore half', async () => {
    const { store } = await freshStores()

    await store.firebaseNeededNow()

    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
    expect(state.authAccessAttempts).toBe(1)
    expect(state.dbAccessAttempts).toBe(0)
  })

  // Each memo clears only itself: a dead Firestore chunk must not evict an
  // auth subscription that loaded fine (they used to share one variable).
  it('a Firestore failure does not tear down the already-loaded auth half', async () => {
    getDocMock.mockResolvedValue({ exists: () => false })
    const { store } = await freshStores()

    await store.firebaseNeededNow()
    expect(state.authAccessAttempts).toBe(1)

    state.dbShouldFailOnce = true
    await store.checkUsernameAvailable('someuser')

    // The auth half was never re-imported — its memo survived intact.
    expect(state.authAccessAttempts).toBe(1)
    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
  })
})

describe('ensureSubscription failure handling (HIGH-1)', () => {
  it('a failed SDK load flips loading to false and surfaces a retryable toast instead of stalling forever', async () => {
    state.authShouldFailOnce = true
    const { store, toastStore } = await freshStores()

    expect(store.loading).toBe(true)
    await store.firebaseNeededNow()

    expect(store.loading).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.connectionError')
    expect(onAuthStateChangedMock).not.toHaveBeenCalled()
  })

  // TASK-165: a failed SDK load must resolve the session question too (not
  // just `loading`), otherwise the router guard's new sessionKnown-based wait
  // (see router/authGuard.ts) would hang forever instead of falling through
  // to the same "treat as logged-out" outcome `loading` already gets here.
  it('a failed SDK load also resolves sessionKnown=true/hasSession=false, so the guard does not hang', async () => {
    state.authShouldFailOnce = true
    const { store } = await freshStores()

    expect(store.sessionKnown).toBe(false)
    await store.firebaseNeededNow()

    expect(store.sessionKnown).toBe(true)
    expect(store.hasSession).toBe(false)
  })

  it('after a failure, a later trigger (e.g. a retry) attempts a fresh subscription instead of replaying the dead promise', async () => {
    state.authShouldFailOnce = true
    const { store } = await freshStores()

    await store.firebaseNeededNow() // fails, memo cleared
    expect(onAuthStateChangedMock).not.toHaveBeenCalled()

    await store.firebaseNeededNow() // retried — succeeds this time
    expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
    expect(store.loading).toBe(false)
  })
})

describe('initAuth deferral holds across a second call (MEDIUM-1)', () => {
  it('calling initAuth() twice before the paint/timeout signal fires does NOT trigger the subscription early', async () => {
    vi.useFakeTimers()
    try {
      const { store } = await freshStores()

      const p1 = store.initAuth()
      const p2 = store.initAuth() // App.vue's onMounted re-call, same tick-ish

      // Give any stray microtasks a chance to run without advancing the
      // fake clock at all — the deferred trigger must NOT have fired yet.
      await Promise.resolve()
      await Promise.resolve()
      expect(onAuthStateChangedMock).not.toHaveBeenCalled()

      // Advance past the 3000ms fallback (no real #app/header/main/input/
      // button exists in this DOM, so the timeout branch is what resolves
      // waitForFirstPaintOrTimeout here).
      await vi.advanceTimersByTimeAsync(3000)
      await Promise.all([p1, p2])

      expect(onAuthStateChangedMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('login() classifies a deps-load failure separately from invalid credentials (LOW-1)', () => {
  it('shows the connection-error toast, not "invalid credentials", when the SDK fails to load', async () => {
    state.authShouldFailOnce = true
    const { store, toastStore } = await freshStores()

    const result = await store.login('a@b.com', 'password123')

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.connectionError')
    expect(signInWithEmailAndPasswordMock).not.toHaveBeenCalled()
  })

  it('regression: real invalid-credentials failures are unaffected', async () => {
    signInWithEmailAndPasswordMock.mockRejectedValueOnce({ code: 'auth/wrong-password' })
    const { store, toastStore } = await freshStores()

    const result = await store.login('a@b.com', 'wrongpassword')

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.invalidCredentials')
  })
})
