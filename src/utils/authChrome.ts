import type { LastKnownAuthState } from './authLastKnown';

/**
 * TASK-182: decides whether AppHeader renders its logged-in navigation.
 *
 * Until this ticket, the header simply asked `!!authStore.user`, which was
 * safe because every route that mounts AppHeader had requiresAuth — the
 * router guard held the navigation until Firebase Auth resolved, so by the
 * time the header existed the answer was already known. /inicio no longer
 * waits (that IS the perf fix: the guard's wait was 87% of the boot bundle
 * blocking by design), which opens a window where the header is on screen
 * and the session is genuinely not known yet.
 *
 * In that window the answer comes from the localStorage cache the auth store
 * already writes the instant onAuthStateChanged fires (TASK-129). The
 * asymmetry is the point: a cached 'authenticated' is acted on, while 'guest'
 * and "nothing cached" are not. Guessing wrong towards logged-in shows a
 * visitor navigation they cannot use; guessing wrong towards guest costs a
 * returning user one frame of missing nav — and the cache is only ever
 * absent on a first-ever visit, where 'guest' is also the correct answer.
 *
 * A resolved session always wins over the cache, in both directions — that
 * is what keeps logout from leaving stale navigation on screen.
 *
 * IT MUST BE `hasSession`, NOT `user`, AND THAT IS NOT A DETAIL. The first
 * version of this took `!!authStore.user` and was measured doing the exact
 * thing it exists to prevent: the nav rendered optimistically at first paint
 * and then VANISHED a moment later, reproducibly, 3 runs out of 3. TASK-165
 * split the two signals — sessionKnown/hasSession flip synchronously inside
 * onAuthStateChanged, while `user` only fills in once loadUserData's
 * /users/{uid} Firestore read returns, which is a second or more later on a
 * slow link. Reading `user` therefore opens a window where sessionKnown is
 * already true but user is still null, which this predicate would read as
 * "resolved, and it's a guest". `hasSession` answers the only question the
 * chrome actually asks: is somebody logged in?
 *
 * @param hasSession   whether Firebase Auth resolved to a logged-in session
 * @param sessionKnown whether Firebase Auth has answered at all yet (TASK-165)
 * @param lastKnown    the cached answer from the previous visit, if any
 */
export const shouldRenderAuthenticatedChrome = (
    hasSession: boolean,
    sessionKnown: boolean,
    lastKnown: LastKnownAuthState | null
): boolean => {
    if (sessionKnown) return hasSession;
    return lastKnown === 'authenticated';
};
