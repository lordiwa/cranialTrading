/**
 * TASK-182 — the header's "show the logged-in navigation?" decision.
 *
 * Why this exists as its own pure function instead of staying the inline
 * `!!authStore.user` computed it used to be: dropping requiresAuth from
 * /inicio means the page now paints BEFORE Firebase Auth has resolved. With
 * the old predicate, a logged-in user would get a header with no navigation
 * at all for the whole auth round-trip (every nav element in AppHeader.vue
 * sits behind v-if="isAuthenticated"), and then watch it pop in — a layout
 * jump on every single load, traded for the faster paint. Not an acceptable
 * trade, so the unresolved window is filled optimistically from the
 * localStorage cache TASK-129 already maintains.
 *
 * The asymmetry is deliberate and is the whole point: 'authenticated' is a
 * confident guess worth acting on, while 'guest' and null are not — showing
 * logged-in navigation to someone who turns out to be a guest is a worse
 * failure than showing none to someone who turns out to be logged in.
 */
import { shouldRenderAuthenticatedChrome } from '@/utils/authChrome'

describe('shouldRenderAuthenticatedChrome', () => {
  // THE REGRESSION LOCK. The first implementation of this predicate took
  // `!!authStore.user` and was caught by measurement — not by review — doing
  // the opposite of its purpose: the nav painted optimistically and then
  // disappeared, reproducibly, 3 runs out of 3 at 600Kbps. TASK-165 made
  // sessionKnown/hasSession flip synchronously while `user` waits on a
  // Firestore profile read, so "session resolved, profile not loaded yet" is
  // a real and long-lived state on a slow link — the exact state a landing
  // page spends its first second in.
  it('keeps the chrome up while the session is known but the profile is still loading', () => {
    expect(shouldRenderAuthenticatedChrome(true, true, 'authenticated')).toBe(true)
    expect(shouldRenderAuthenticatedChrome(true, true, null)).toBe(true)
  })

  describe('once auth has actually resolved, the cache is irrelevant', () => {
    it('shows the authenticated chrome for a real user, whatever the cache says', () => {
      expect(shouldRenderAuthenticatedChrome(true, true, 'guest')).toBe(true)
      expect(shouldRenderAuthenticatedChrome(true, true, null)).toBe(true)
      expect(shouldRenderAuthenticatedChrome(true, true, 'authenticated')).toBe(true)
    })

    it('hides it for a resolved guest even if the cache still says authenticated', () => {
      // This is the logout case, and the ordering matters: the cache is
      // rewritten to 'guest' by the auth store, but a stale read must never
      // outvote a resolved session.
      expect(shouldRenderAuthenticatedChrome(false, true, 'authenticated')).toBe(false)
      expect(shouldRenderAuthenticatedChrome(false, true, 'guest')).toBe(false)
      expect(shouldRenderAuthenticatedChrome(false, true, null)).toBe(false)
    })
  })

  describe('while auth is still unresolved — the new window this ticket opens', () => {
    it('paints the authenticated chrome when the last known state was authenticated', () => {
      expect(shouldRenderAuthenticatedChrome(false, false, 'authenticated')).toBe(true)
    })

    it('does NOT paint it when the last known state was guest', () => {
      expect(shouldRenderAuthenticatedChrome(false, false, 'guest')).toBe(false)
    })

    it('does NOT paint it on a first-ever visit, with nothing cached', () => {
      expect(shouldRenderAuthenticatedChrome(false, false, null)).toBe(false)
    })
  })
})
