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
    // Method shorthand (not an arrow-typed property) so TS checks this
    // bivariantly — the real Pinia store's $subscribe callback takes
    // (mutation, state) args, while callers here only ever pass a 0-arg
    // callback; both must be assignable to this interface.
    $subscribe(callback: () => void): () => void;
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
 */
export const createAuthGuard = (
    authStore: AuthGuardStore,
    redirect: (path: string) => void
) => {
    return async (to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext): Promise<void> => {
        const requiresAuth = to.meta.requiresAuth;
        const requiresGuest = to.meta.requiresGuest;

        if (!requiresAuth && !requiresGuest) {
            next();
            return;
        }

        if (requiresGuest) {
            if (getLastKnownAuthState() === 'authenticated') {
                await waitForAuthReady(authStore);
                if (authStore.user) {
                    next('/saved-matches');
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
            if (authStore.user) {
                redirect('/saved-matches');
            }
            return;
        }

        // requiresAuth: unchanged wait-then-decide behavior.
        await waitForAuthReady(authStore);

        if (!authStore.user) {
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
 */
export const shouldBlockOnAuthLoading = (
    meta: AuthGuardMeta,
    authLoading: boolean,
    lastKnown: LastKnownAuthState | null
): boolean => {
    if (!authLoading) return false;
    if (!meta.requiresAuth && !meta.requiresGuest) return false;
    if (meta.requiresGuest) return lastKnown === 'authenticated';
    return true;
};
