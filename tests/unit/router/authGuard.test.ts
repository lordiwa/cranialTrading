/**
 * TASK-129 (perf F2) — router.beforeEach guard extracted into a testable,
 * injectable factory (createAuthGuard) so slow/never-resolving Firebase Auth
 * can be simulated without mounting real vue-router or Firebase.
 *
 * Root cause fixed here: the pre-129 guard blocked EVERY first navigation
 * (guest routes included) on a while-loop waiting for authStore.loading —
 * even /login and static pages waited for the identitytoolkit round-trip.
 *
 * Behavior under test:
 * (a) routes with neither requiresAuth nor requiresGuest resolve without
 *     waiting on auth at all.
 * (b) requiresGuest routes use the localStorage last-known auth state: if
 *     last-known says authenticated, wait then decide (today's behavior,
 *     no flicker for a real logged-in user); otherwise paint immediately
 *     and redirect afterward only if auth turns out to resolve logged-in.
 * (c) requiresAuth routes keep the exact wait-then-decide behavior as
 *     before, including the 2s re-check timeout fallback.
 */
import type { RouteLocationNormalized } from 'vue-router'
import { createAuthGuard, shouldBlockOnAuthLoading, type AuthGuardStore } from '@/router/authGuard'
import { setLastKnownAuthState } from '@/utils/authLastKnown'

const asRoute = (meta: RouteLocationNormalized['meta'], fullPath = '/x'): RouteLocationNormalized =>
  ({ meta, fullPath } as RouteLocationNormalized)

/**
 * Fake Pinia-shaped auth store with full manual control over when `loading`
 * flips false — lets tests prove the guard does/doesn't wait without any
 * real Firebase round-trip.
 */
const createFakeAuthStore = (initialLoading: boolean, initialUser: unknown = null) => {
  const listeners = new Set<() => void>()
  const store: AuthGuardStore = {
    loading: initialLoading,
    user: initialUser,
    $subscribe: (callback: () => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
  const resolve = (nextUser: unknown) => {
    store.user = nextUser
    store.loading = false
    listeners.forEach((cb) => { cb() })
  }
  return { store, resolve }
}

beforeEach(() => {
  localStorage.clear()
})

describe('createAuthGuard — (a) routes requiring neither auth nor guest', () => {
  it('resolves immediately even while auth is loading and never resolves', async () => {
    const { store } = createFakeAuthStore(true) // never resolves in this test
    const next = vi.fn()
    const redirect = vi.fn()
    const guard = createAuthGuard(store, redirect)

    await guard(asRoute({}), asRoute({}), next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('createAuthGuard — (b) requiresGuest, last-known = guest/unknown', () => {
  it('paints /login immediately (RED evidence: next() before auth resolves), then redirects once auth resolves logged-in', async () => {
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const redirect = vi.fn()
    const guard = createAuthGuard(store, redirect)

    const pending = guard(asRoute({ requiresGuest: true }, '/login'), asRoute({}), next)

    await Promise.resolve()
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(redirect).not.toHaveBeenCalled()

    resolve({ id: 'u1' })
    await pending

    expect(redirect).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledWith('/saved-matches')
    expect(next).toHaveBeenCalledTimes(1) // no loop: next() was never called a second time
  })

  it('paints /login immediately and does NOT redirect when auth resolves still-guest', async () => {
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const redirect = vi.fn()
    const guard = createAuthGuard(store, redirect)

    const pending = guard(asRoute({ requiresGuest: true }, '/login'), asRoute({}), next)
    resolve(null)
    await pending

    expect(next).toHaveBeenCalledWith()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('treats an explicit last-known "guest" the same as no stored value', async () => {
    setLastKnownAuthState('guest')
    const { store } = createFakeAuthStore(true)
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    await Promise.race([guard(asRoute({ requiresGuest: true }, '/login'), asRoute({}), next), Promise.resolve()])

    expect(next).toHaveBeenCalledWith()
  })
})

describe('createAuthGuard — (b) requiresGuest, last-known = authenticated', () => {
  it('waits for auth to resolve before deciding (proves it does NOT paint immediately in this case)', async () => {
    setLastKnownAuthState('authenticated')
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const redirect = vi.fn()
    const guard = createAuthGuard(store, redirect)

    const pending = guard(asRoute({ requiresGuest: true }, '/login'), asRoute({}), next)

    await Promise.resolve()
    expect(next).not.toHaveBeenCalled()

    resolve({ id: 'u1' })
    await pending

    expect(next).toHaveBeenCalledWith('/saved-matches')
    expect(redirect).not.toHaveBeenCalled() // decided synchronously via next(), not the async path
  })

  it('falls through to /login when auth actually resolves logged-out despite a stale "authenticated" last-known', async () => {
    setLastKnownAuthState('authenticated')
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    const pending = guard(asRoute({ requiresGuest: true }, '/login'), asRoute({}), next)
    resolve(null)
    await pending

    expect(next).toHaveBeenCalledWith()
  })
})

describe('createAuthGuard — (c) requiresAuth keeps today\'s exact wait-then-decide behavior', () => {
  it('waits for auth (does not resolve navigation before auth settles)', async () => {
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    const pending = guard(asRoute({ requiresAuth: true }, '/collection'), asRoute({}), next)
    await Promise.resolve()
    expect(next).not.toHaveBeenCalled()

    resolve({ id: 'u1' })
    await pending
    expect(next).toHaveBeenCalledWith()
  })

  it('redirects unauthenticated users to /login with returnUrl intact', async () => {
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    const pending = guard(asRoute({ requiresAuth: true }, '/collection?foo=bar'), asRoute({}), next)
    resolve(null)
    await pending

    expect(next).toHaveBeenCalledWith({ path: '/login', query: { returnUrl: '/collection?foo=bar' } })
  })

  it('resolves immediately when auth is already resolved (not loading)', async () => {
    const { store } = createFakeAuthStore(false, { id: 'u1' })
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    await guard(asRoute({ requiresAuth: true }, '/collection'), asRoute({}), next)

    expect(next).toHaveBeenCalledWith()
  })

  it('auth error path: an auth resolution that lands on no-user (e.g. failed silent refresh) still redirects to /login without hanging', async () => {
    const { store, resolve } = createFakeAuthStore(true)
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    const pending = guard(asRoute({ requiresAuth: true }, '/settings'), asRoute({}), next)
    resolve(undefined) // e.g. onAuthStateChanged(null) after a failed refresh
    await pending

    expect(next).toHaveBeenCalledWith({ path: '/login', query: { returnUrl: '/settings' } })
  })

  it('falls back to the 2s re-check timeout when the $subscribe callback never fires (regression lock for legacy behavior)', async () => {
    vi.useFakeTimers()
    const store: AuthGuardStore = {
      loading: true,
      user: null,
      $subscribe: () => () => { /* never invokes the callback */ },
    }
    const next = vi.fn()
    const guard = createAuthGuard(store, vi.fn())

    const pending = guard(asRoute({ requiresAuth: true }, '/collection'), asRoute({}), next)

    // Auth resolves "out of band" (missed reactivity tick) — only the 2s
    // fallback timer will notice and unblock the guard.
    store.loading = false
    await vi.advanceTimersByTimeAsync(2000)
    await pending

    expect(next).toHaveBeenCalledWith({ path: '/login', query: { returnUrl: '/collection' } })
    vi.useRealTimers()
  })
})

describe('shouldBlockOnAuthLoading — pure decision reused by App.vue\'s full-screen loader gate', () => {
  it('never blocks once auth has resolved, regardless of meta', () => {
    expect(shouldBlockOnAuthLoading({ requiresAuth: true }, false, null)).toBe(false)
    expect(shouldBlockOnAuthLoading({ requiresGuest: true }, false, 'authenticated')).toBe(false)
  })

  it('never blocks a route with neither requiresAuth nor requiresGuest, even while loading', () => {
    expect(shouldBlockOnAuthLoading({}, true, null)).toBe(false)
  })

  it('blocks a requiresAuth route while loading', () => {
    expect(shouldBlockOnAuthLoading({ requiresAuth: true }, true, null)).toBe(true)
  })

  it('blocks a requiresGuest route while loading only when last-known is authenticated', () => {
    expect(shouldBlockOnAuthLoading({ requiresGuest: true }, true, 'authenticated')).toBe(true)
    expect(shouldBlockOnAuthLoading({ requiresGuest: true }, true, 'guest')).toBe(false)
    expect(shouldBlockOnAuthLoading({ requiresGuest: true }, true, null)).toBe(false)
  })
})
