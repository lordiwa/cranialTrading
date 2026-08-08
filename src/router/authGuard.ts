import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import { getLastKnownAuthState, type LastKnownAuthState } from '../utils/authLastKnown';

/**
 * Minimal shape of the auth store this guard depends on — kept narrow (not
 * the full useAuthStore() return type) so it can be driven by a fake store
 * in unit tests without mocking Firebase or Pinia reactivity.
 */
export interface AuthGuardStore {
    loading: boolean;
    user: unknown;
    // TASK-165: independent of loading/user (which only resolve once the full
    // profile — /users/{uid} getDoc — has loaded). sessionKnown flips true as
    // soon as Firebase Auth's onAuthStateChanged has fired once; hasSession
    // mirrors whether that resolved to a logged-in user. Used ONLY by the
    // requiresAuth branch below, so a requiresAuth navigation (e.g. /inicio)
    // can unblock — and let its own view chunk start downloading — without
    // waiting on the profile read. requiresGuest keeps using loading/user
    // unchanged (untouched by this ticket).
    sessionKnown: boolean;
    hasSession: boolean;
    // TASK-126 round 2: needed so the requiresGuest branch can special-case
    // /register for an authenticated-but-unverified session (see below) —
    // without it the guard could not distinguish that case from a fully
    // logged-in user and would redirect it away before RegisterView (whose
    // own TASK-126 round-1 fix depends on actually reaching /register) ever
    // mounted.
    emailVerified: boolean;
    // Method shorthand (not an arrow-typed property) so TS checks this
    // bivariantly — the real Pinia store's $subscribe callback takes
    // (mutation, state) args, while callers here only ever pass a 0-arg
    // callback; both must be assignable to this interface.
    $subscribe(callback: () => void): () => void;
    // TASK-132 review fix: optional eager Firebase-load trigger. The guard
    // is the one place that knows, synchronously, whether the PENDING
    // navigation is itself gated on auth resolving — call it right before
    // any wait path that blocks the current navigation, so the SDK starts
    // downloading immediately instead of behind stores/auth.ts's deferred
    // "wait for paint" trigger (which can never fire first on these routes,
    // since their view can't paint until auth resolves — that circularity
    // deadlocked a logged-in E2E navigation before this fix). Optional so
    // existing fake-store tests that don't care about this keep working.
    firebaseNeededNow?: () => void;
}

/** Narrow meta shape needed by the auth-loading decisions below. */
export interface AuthGuardMeta {
    requiresAuth?: boolean;
    requiresGuest?: boolean;
}

/**
 * Waits for authStore.loading to flip false, re-subscribing every 2s in case
 * the $subscribe callback is missed. Unchanged from the pre-TASK-129 router
 * guard — requiresAuth routes (and requiresGuest routes with a last-known
 * "authenticated" state) still wait exactly like this.
 */
const waitForAuthReady = async (authStore: AuthGuardStore): Promise<void> => {
    // Assumes authStore.loading eventually resolves. If it never does, this
    // re-arms the 2s fallback forever (dangling detached promise) — unchanged
    // from the pre-TASK-129 behavior, not something this ticket restructures.
    while (authStore.loading) {
        await new Promise<void>((resolve) => {
            const unwatch = authStore.$subscribe(() => {
                if (!authStore.loading) {
                    unwatch();
                    resolve();
                }
            });
            setTimeout(() => {
                try { unwatch(); } catch { /* ignore */ }
                resolve();
            }, 2000);
        });
        if (!authStore.loading) break;
    }
};

/**
 * TASK-165: same re-subscribing wait-loop shape as waitForAuthReady above,
 * but gated on sessionKnown instead of the full-profile `loading` flag —
 * used only by the requiresAuth branch, which does not need the profile to
 * decide whether to redirect to /login.
 */
const waitForSessionKnown = async (authStore: AuthGuardStore): Promise<void> => {
    while (!authStore.sessionKnown) {
        await new Promise<void>((resolve) => {
            const unwatch = authStore.$subscribe(() => {
                if (authStore.sessionKnown) {
                    unwatch();
                    resolve();
                }
            });
            setTimeout(() => {
                try { unwatch(); } catch { /* ignore */ }
                resolve();
            }, 2000);
        });
        if (authStore.sessionKnown) break;
    }
};

/**
 * TASK-129 (perf F2): builds the router.beforeEach guard.
 * - (a) Routes with neither requiresAuth nor requiresGuest resolve
 *   immediately — no wait on the Firebase Auth round-trip.
 * - (b) requiresGuest routes (login) consult the localStorage last-known
 *   auth state: if it says authenticated, wait then decide (today's
 *   behavior — avoids a flicker for the common already-logged-in case);
 *   otherwise paint /login immediately and redirect afterward via
 *   `redirect` only if auth turns out to resolve authenticated.
 * - (c) requiresAuth routes keep the exact wait-then-decide behavior as
 *   before, including the 2s re-check timeout fallback.
 *
 * `redirect` is called for the "already painted /login, auth resolved
 * authenticated after the fact" case — in production this is router.push.
 *
 * `isStillCurrent` guards that same deferred redirect (review fix batch,
 * MEDIUM-1): the app may have navigated away from the guarded route (e.g.
 * user clicked to /about) while auth was still resolving in the background.
 * Without this check the redirect would fire unconditionally once auth
 * resolves authenticated, yanking the user back to /saved-matches and
 * cancelling whatever navigation they made in the meantime — a real risk on
 * every first deploy, since every already-logged-in user has no stored
 * last-known yet and always takes this optimistic-paint path once. Defaults
 * to "always current" so existing callers/tests that don't care about this
 * are unaffected; production wiring (router/index.ts) passes the real check.
 */
export const createAuthGuard = (
    authStore: AuthGuardStore,
    redirect: (path: string) => void,
    isStillCurrent: () => boolean = () => true
) => {
    return async (to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext): Promise<void> => {
        const requiresAuth = to.meta.requiresAuth;
        const requiresGuest = to.meta.requiresGuest;

        if (!requiresAuth && !requiresGuest) {
            next();
            return;
        }

        if (requiresGuest) {
            // TASK-126 round 2 (reviewer HIGH on 7d391e1): this guard used to
            // redirect ANY authenticated user away from every requiresGuest
            // route — including /register — without checking emailVerified.
            // That made RegisterView's own round-1 fix (show the
            // pending-verification screen instead of a blank form on remount)
            // unreachable in production: an unverified logged-in user was
            // bounced to /saved-matches before RegisterView ever mounted.
            // Scoped strictly to /register — every other requiresGuest route
            // (starting with /login) keeps redirecting exactly as before.
            const isUnverifiedSessionOnRegister = (): boolean =>
                to.path === '/register' && Boolean(authStore.user) && !authStore.emailVerified;

            if (getLastKnownAuthState() === 'authenticated') {
                // TASK-132 review fix: this branch WAITS on auth before deciding
                // (last-known says the user is probably logged in) — nothing
                // paints until it resolves, so there is no first-paint window to
                // protect by deferring; start the SDK download now.
                authStore.firebaseNeededNow?.();
                await waitForAuthReady(authStore);
                if (authStore.user && !isUnverifiedSessionOnRegister()) {
                    next('/inicio');
                } else {
                    next();
                }
                return;
            }

            // Last-known says guest (or nothing stored yet): paint /login now.
            next();

            if (authStore.loading) {
                await waitForAuthReady(authStore);
            }
            if (authStore.user && isStillCurrent() && !isUnverifiedSessionOnRegister()) {
                redirect('/inicio');
            }
            return;
        }

        // requiresAuth: TASK-165 — waits on sessionKnown (Firebase Auth
        // resolving whether there IS a session) instead of the full-profile
        // `loading` flag, so the navigation — and the target route's own
        // async chunk import() — unblocks without waiting on the
        // /users/{uid} profile read. App.vue's own loader (shouldShowAuthLoading,
        // still gated on `loading`) keeps covering the screen until the
        // profile is actually ready, so this only lets the chunk fetch and
        // the profile read run in PARALLEL instead of sequentially — no
        // visible behavior change, no risk to the ~30 consumers elsewhere in
        // the app that assume `loading === false` implies `user` is fully
        // populated (see stores/auth.ts). Same as above — start the SDK
        // download now rather than behind a "wait for paint" signal that
        // paint itself is blocked on (TASK-132 review fix).
        authStore.firebaseNeededNow?.();
        await waitForSessionKnown(authStore);

        if (!authStore.hasSession) {
            next({ path: '/login', query: { returnUrl: to.fullPath } });
            return;
        }

        next();
    };
};

/**
 * Pure decision shared by App.vue's full-screen auth loader gate. Mirrors
 * createAuthGuard's own call on which routes are allowed to paint before
 * Firebase Auth resolves, so the loader never covers a route the router
 * already decided not to block on.
 *
 * `routeConfirmed` (review fix batch, HIGH-1): App.vue feeds this the
 * CURRENT route's meta via useRoute(), which during the app's very first
 * (still-pending) navigation is Vue Router's START_LOCATION sentinel — an
 * empty meta ({}) with matched:[]. Read at face value that looks exactly
 * like "route requiring neither guard" and would return false, letting
 * App.vue render a blank RouterView + footer shell for the ENTIRE auth
 * round-trip on any requiresAuth deep-link (or the '/' → /saved-matches
 * redirect) instead of the loader. Pass `false` while the route hasn't been
 * confirmed yet so this blocks optimistically in that window; defaults to
 * `true` so every existing 3-arg call site is unaffected. Once a guest route
 * IS confirmed (e.g. /login, guard already called next() synchronously) this
 * still returns false for it — AC1's early paint is preserved.
 */
export const shouldBlockOnAuthLoading = (
    meta: AuthGuardMeta,
    authLoading: boolean,
    lastKnown: LastKnownAuthState | null,
    routeConfirmed = true
): boolean => {
    if (!authLoading) return false;
    if (!routeConfirmed) return true;
    if (!meta.requiresAuth && !meta.requiresGuest) return false;
    if (meta.requiresGuest) return lastKnown === 'authenticated';
    return true;
};
