import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User as FirebaseUser } from 'firebase/auth';
import type * as FirebaseAuthNS from 'firebase/auth';
import type * as FirebaseFirestoreNS from 'firebase/firestore';
import type * as FirebaseServicesNS from '../services/firebase';
import type * as FirestoreServiceNS from '../services/firestore';
import { type User } from '../types/user';
import { useToastStore } from './toast';
import { t, useI18n } from '../composables/useI18n';
import { setLastKnownAuthState } from '../utils/authLastKnown';
import { formatDate } from '../utils/formatDate';
import { getErrorCode, logSanitizedError } from '../utils/logSanitizedError';
import { PAINTED_CONTENT_SELECTOR } from '../utils/paintSignal';
import { isValidUsername, normalizeUsername } from '../utils/username';

/**
 * TASK-132 (perf F4): this store used to statically import firebase/auth,
 * firebase/firestore, and services/firebase at the top of the file. Because
 * this store is itself statically reachable from main.ts and App.vue (via
 * useAuthStore), that put the ~115KB gz Firebase chunk on EVERY guest's
 * critical rendering path — Vite modulepreloaded it in index.html and the
 * browser had to fetch+parse+link it before main.ts could execute a single
 * line, regardless of whether the visitor ever logs in.
 *
 * Every Firebase access in this store now goes through this single cached
 * dynamic import instead. The SDK still starts downloading at app boot (via
 * initAuth, called synchronously from main.ts) but as a background fetch
 * that does NOT block module evaluation or first paint — main.ts's mount()
 * call no longer waits on it. Once resolved, the promise is cached so
 * every other method in this store (login, register, etc.) reuses the same
 * loaded SDK instance without re-fetching.
 */
type FirebaseAuthModule = typeof FirebaseAuthNS;
type FirebaseFirestoreModule = typeof FirebaseFirestoreNS;
type FirebaseServicesModule = typeof FirebaseServicesNS;
type FirestoreServiceModule = typeof FirestoreServiceNS;

interface FirebaseDeps {
    authFns: FirebaseAuthModule;
    firestoreFns: FirebaseFirestoreModule;
    auth: FirebaseServicesModule['auth'];
    db: FirestoreServiceModule['db'];
}

/**
 * TASK-132 review fix (HIGH-1, LOW-1): tags any failure that originates from
 * loadFirebaseDeps()'s dynamic import() as distinct from a genuine Firebase
 * Auth/Firestore error (wrong password, permission-denied, etc.), so
 * catch blocks downstream (login, register, ensureSubscription) can show a
 * "check your connection" message instead of misclassifying a network/chunk
 * failure as invalid credentials or a generic save error.
 */
class FirebaseDepsLoadError extends Error {
    constructor(cause: unknown) {
        super('Failed to load the Firebase SDK');
        this.name = 'FirebaseDepsLoadError';
        this.cause = cause;
    }
}

let firebaseDepsPromise: Promise<FirebaseDeps> | null = null;

/**
 * TASK-132: waits until the app has painted real content (the same DOM
 * signal the perf harness itself polls for — scripts/perf-measure.mjs) so
 * the caller can start the Firebase fetch AFTER the current route's own
 * critical chunk has had a chance to render, instead of racing it on a
 * bandwidth-capped connection. Capped by `timeoutMs` so requiresAuth routes
 * — whose content is itself gated on auth resolving, see
 * router/authGuard.ts — can't deadlock waiting on a paint that depends on
 * this same call finishing; they simply fall through to the timeout and
 * start the fetch anyway (unchanged from firing immediately, just with a
 * short deterministic cap).
 */
const waitForFirstPaintOrTimeout = (timeoutMs: number): Promise<void> => {
    return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
            resolve();
            return;
        }
        let done = false;
        const finish = (): void => {
            if (done) return;
            done = true;
            resolve();
        };
        const check = (): void => {
            if (done) return;
            if (document.querySelector(PAINTED_CONTENT_SELECTOR)) {
                finish();
                return;
            }
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
        setTimeout(finish, timeoutMs);
    });
};

const loadFirebaseDeps = (): Promise<FirebaseDeps> => {
    if (!firebaseDepsPromise) {
        // TASK-178 phase 1: mechanical only — still loads Auth AND Firestore
        // together on every call, same as before the split. Behavior is
        // unchanged; only the import path for `db` moved (services/firebase.ts
        // no longer exports it). Splitting this into an auth-only path and a
        // firestore-only path is phase 2, not this commit.
        firebaseDepsPromise = Promise.all([
            import('firebase/auth'),
            import('firebase/firestore'),
            import('../services/firebase'),
            import('../services/firestore'),
        ]).then(([authFns, firestoreFns, services, firestoreService]) => ({
            authFns,
            firestoreFns,
            auth: services.auth,
            db: firestoreService.db,
        })).catch((error: unknown) => {
            // TASK-132 review fix (HIGH-1): a failed dynamic import (network
            // blip, or a stale deployment whose chunk hash no longer exists)
            // used to memoize the REJECTED promise forever — every future
            // caller (login, register, initAuth's subscription, ...) would
            // replay the same dead rejection with no way to recover short of
            // a full page reload. Clear the memo so the NEXT call attempts a
            // fresh import(), then re-throw (tagged) so this specific
            // caller's own catch still runs.
            firebaseDepsPromise = null;
            throw new FirebaseDepsLoadError(error);
        });
    }
    return firebaseDepsPromise;
};

/**
 * TASK-257: uids currently being provisioned by an explicit creation flow
 * (register(), loginWithGoogle()'s new-user branch). Both flows reserve a
 * username and write /users/{uid} themselves, but Firebase Auth fires
 * onAuthStateChanged as soon as the user is signed in — BEFORE either flow's
 * own write lands — which triggers loadUserData()'s unawaited self-heal path
 * (see the callback below, line ~196) concurrently. Two independent
 * reserveUsername + setDoc(users/{uid}) writes then race: whichever lands
 * last wins /users/{uid}.username, while the LOSER's /usernames/{norm} index
 * doc is left pointing at a uid whose doc now says something else — an
 * orphaned index (measured live, TASK-256/257: 5 of 7 orphans in dev had
 * exactly this shape). loadUserData checks this set and skips its self-heal
 * write entirely while the uid is marked as provisioning; the explicit flow
 * calls loadUserData itself once its own write has landed.
 */
const provisioningUids = new Set<string>();

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const loading = ref(true);
    const emailVerified = ref(false);
    const isLoggingOut = ref(false);
    const toastStore = useToastStore();

    /**
     * TASK-165: `loading` only flips false once loadUserData's own
     * `/users/{uid}` getDoc round-trip settles (see loadUserData's `finally`
     * below) — measured in production, that read alone can take 1.5s+. The
     * router guard (router/authGuard.ts) only needs to know WHETHER there is
     * a session, not the full profile, so it can unblock a requiresAuth
     * navigation (and let the route's own view chunk start downloading) as
     * soon as Firebase Auth itself resolves — well before the profile read
     * finishes.
     *
     * sessionKnown/hasSession are written SYNCHRONOUSLY inside the
     * onAuthStateChanged callback below, in both branches, before the async
     * loadUserData() call — mirroring exactly how emailVerified and
     * setLastKnownAuthState already work. `loading`/`user` keep their EXACT
     * existing semantics (full profile ready) — every other consumer in the
     * app that assumes `loading === false` implies `user` is fully populated
     * is unaffected, since this ticket does not touch loading/user's timing
     * at all, only adds two new signals alongside them.
     */
    const sessionKnown = ref(false);
    const hasSession = ref(false);

    // TASK-132 review fix: the ACTUAL download+subscribe work, factored out
    // of initAuth() and memoized on its own (independent of initAuth's
    // re-entrancy) so it can be triggered from two different places —
    // initAuth()'s deferred wait (guest paths) and firebaseNeededNow()'s
    // eager call (auth-blocking paths, see below) — without double-firing.
    // Whichever caller reaches this first wins; the other gets the same
    // cached promise.
    let subscriptionPromise: Promise<void> | null = null;
    const ensureSubscription = (): Promise<void> => {
        if (!subscriptionPromise) {
            subscriptionPromise = loadFirebaseDeps().then(({ authFns, auth }) => {
                // Return value (the real unsubscribe fn) is intentionally
                // not retained — nothing in this store ever tears the
                // subscription down (logout() reloads the page instead,
                // which naturally discards it), and TASK-132's review fix
                // repurposed the old module-level authUnsubscribe variable
                // as a re-entrancy guard for initAuth(), a role now filled
                // by subscriptionPromise/initAuthPromise below instead.
                authFns.onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
                    if (isLoggingOut.value) return;

                    if (firebaseUser) {
                        emailVerified.value = firebaseUser.emailVerified;
                        // TASK-165: session existence is known NOW — written before the
                        // async loadUserData round-trip, same as emailVerified/last-known
                        // above, so the router guard can unblock on this without waiting
                        // for the profile.
                        hasSession.value = true;
                        sessionKnown.value = true;
                        // TASK-129: last-known cache written synchronously, before the
                        // async loadUserData round-trip, so the NEXT app load's router
                        // guard / App.vue loader gate can decide optimistically.
                        setLastKnownAuthState('authenticated');
                        void loadUserData(firebaseUser.uid);
                    } else {
                        user.value = null;
                        emailVerified.value = false;
                        loading.value = false;
                        hasSession.value = false;
                        sessionKnown.value = true;
                        setLastKnownAuthState('guest');
                    }
                });
            }).catch((error: unknown) => {
                // TASK-132 review fix (HIGH-1): a failed SDK load must not
                // leave the app stuck on the auth loader forever — with no
                // catch here, `loading` had no writer left reachable (only
                // the subscription callback above and loadUserData's finally
                // ever flip it false, and neither runs if we never even got
                // a subscription). Resolve the auth question as "unknown, not
                // logged in" — flips the loader off — WITHOUT writing
                // last-known (an unresolved failure is not the same
                // confirmed signal as a real "guest" from Firebase, and must
                // not be cached as one for the next app load's optimistic
                // paint). Reset every memo (this one and initAuth's) so the
                // next trigger — a retried action, a new navigation —
                // attempts a fresh load instead of replaying the same dead
                // promise.
                subscriptionPromise = null;
                initAuthPromise = null;
                loading.value = false;
                // TASK-165: a failed SDK load must resolve the session question too,
                // not just `loading` — otherwise the guard's sessionKnown-based wait
                // would hang forever instead of falling through to the same
                // "treat as logged-out" outcome `loading` already gets here.
                hasSession.value = false;
                sessionKnown.value = true;
                logSanitizedError('Failed to initialize Firebase Auth', error);
                toastStore.show(t('auth.messages.connectionError'), 'error');
            });
        }
        return subscriptionPromise;
    };

    /**
     * TASK-132 review fix: eager escape hatch for the router guard
     * (router/authGuard.ts) — call the moment createAuthGuard determines the
     * CURRENT navigation is itself gated on auth resolving (requiresAuth, or
     * requiresGuest with a stale last-known="authenticated"). On those
     * routes the view cannot paint until auth resolves anyway, so deferring
     * the SDK fetch behind a "wait for paint" signal is not just useless —
     * it's actively worse than loading immediately, since paint can never
     * happen first (view is BaseLoader until authStore.loading flips false),
     * so the deferred trigger always falls through to its timeout AND ONLY
     * THEN starts the download — a real deadlock that timed out a logged-in
     * E2E navigation (/contacts → /saved-matches) during this ticket.
     * Idempotent/safe to call from anywhere, any number of times.
     */
    const firebaseNeededNow = (): Promise<void> => ensureSubscription();

    // TASK-132 review fix (MEDIUM-1): initAuth's own memo, SEPARATE from
    // subscriptionPromise. main.ts's call and App.vue's onMounted call both
    // reach initAuth() — the first call's `??=` wins and every later call
    // (including that App.vue re-call, which fires AFTER app.mount(), i.e.
    // well before first paint) reuses the SAME deferred promise instead of
    // starting its own paint-poller or — the actual bug this fixes —
    // re-triggering ensureSubscription() immediately and defeating the
    // deferral outright.
    let initAuthPromise: Promise<void> | null = null;

    const initAuth = (): Promise<void> => {
        // If firebaseNeededNow() already kicked off (or finished) the real
        // subscription — the router guard decided THIS navigation is itself
        // gated on auth — reuse that instead of ALSO deferring behind the
        // paint signal, which is only useful pre-emptively on the common
        // guest path.
        if (subscriptionPromise) return subscriptionPromise;

        // TASK-132: making the import() dynamic only kept it out of the
        // static module graph (no modulepreload) — the fetch itself was
        // still ISSUED synchronously at boot, so under FAST3G it competed
        // on the wire (a single throughput-capped connection pool) with
        // the current route's own critical chunks (JS/CSS/locale/fonts,
        // all requested in the same burst once the router resolves) and
        // made first paint SLOWER, not faster. waitForFirstPaintOrTimeout
        // gives the route's own chunk a real head start on GUEST routes
        // (the only routes that reach this deferred path in practice —
        // anything auth-gated is instead unblocked immediately via
        // firebaseNeededNow() from the guard, above). 3000ms fallback:
        // measurement showed the real paint signal lands ~1.7s in under
        // FAST3G once the route's own chunk is unblocked (see
        // services/publicCardSearch.ts fix, same ticket) — a short cap
        // risked the timeout branch winning the race and reintroducing the
        // exact bandwidth contention this is meant to avoid.
        initAuthPromise ??= waitForFirstPaintOrTimeout(3000).then(ensureSubscription);
        return initAuthPromise;
    };

    const loadUserData = async (userId: string) => {
        try {
            const { firestoreFns, auth, db } = await loadFirebaseDeps();
            const userDoc = await firestoreFns.getDoc(firestoreFns.doc(db, 'users', userId));
            if (userDoc.exists()) {
                const data = userDoc.data() as {
                    username: string;
                    location: string;
                    createdAt: { toDate: () => Date };
                    lastUsernameChange?: { toDate: () => Date } | null;
                    avatarUrl?: string | null;
                    tourCompleted?: boolean;
                };
                user.value = {
                    id: userId,
                    // TASK-188: el email NO se lee del documento /users. Ese documento
                    // es de lectura publica (el perfil de otro usuario se abre sin
                    // sesion, requisito de producto) y las reglas de Firestore no
                    // filtran por campo, asi que cualquier campo que viva ahi se
                    // descarga sin cuenta. Medido: 134 emails en prod, 232 en dev.
                    // Firebase Auth ya era la fuente de verdad desde TASK-124; ahora
                    // es la unica. Los documentos heredados todavia traen el campo
                    // hasta que corra la migracion — se ignora a proposito.
                    email: auth.currentUser?.email ?? '',
                    username: data.username,
                    location: data.location,
                    createdAt: data.createdAt.toDate(),
                    lastUsernameChange: data.lastUsernameChange?.toDate() ?? null,
                    avatarUrl: data.avatarUrl ?? null,
                    tourCompleted: data.tourCompleted ?? false,
                };

                // TASK-169: mantener contact_info/{uid} al dia. Es donde vive el
                // email desde que se saco de public_cards/public_preferences (que
                // se leen sin login). Se hace aca porque toda carga de sesion
                // pasa por este punto, igual que la sincronizacion de arriba.
                // Best-effort a proposito: si falla, el contacto no aparece en
                // matches, pero no debe cortar el login.
                if (user.value.email) {
                    void import('../services/contactInfo')
                        .then(({ syncContactInfo }) => syncContactInfo(userId, user.value!.email, user.value!.username))
                        .catch(() => { /* no fatal */ });
                }
            } else {
                const firebaseUser = auth.currentUser;
                // TASK-257: an explicit creation flow (register()/loginWithGoogle())
                // is already provisioning /users/{userId} for this uid — its own
                // reserveUsername + setDoc will land shortly, and it calls
                // loadUserData() itself afterwards. Self-healing here too would
                // race it with a SECOND, independently-generated username and
                // orphan whichever /usernames/{norm} index doc loses.
                if (firebaseUser && !provisioningUids.has(userId)) {
                    // D-06b: self-heal must also reserve a unique, normalized username
                    // (was a raw 'Usuario' write that collided for displayName-less users).
                    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback */
                    const rawBase = firebaseUser.displayName
                        || firebaseUser.email?.split('@')[0]
                        || `user_${userId.slice(0, 8)}`;
                    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
                    const reservedUsername = await reserveUniqueUsername(userId, rawBase);

                    user.value = {
                        id: userId,
                        email: firebaseUser.email ?? '',
                        username: reservedUsername,
                        location: '',
                        createdAt: new Date(),
                    };

                    try {
                        // TASK-188: sin `email` — ver el comentario de arriba.
                        await firestoreFns.setDoc(firestoreFns.doc(db, 'users', userId), {
                            username: reservedUsername,
                            location: user.value.location,
                            createdAt: new Date(),
                        });
                    } catch {
                        toastStore.show(t('auth.messages.saveUserError'), 'error');
                    }
                }
            }
        } catch {
            toastStore.show(t('auth.messages.loadUserError'), 'error');
            const { auth } = await loadFirebaseDeps();
            const firebaseUser = auth.currentUser;
            if (firebaseUser) {
                user.value = {
                    id: userId,
                    email: firebaseUser.email ?? '',
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
                    location: '',
                    createdAt: new Date(),
                };
            }
        } finally {
            loading.value = false;
        }
    };

    const register = async (email: string, password: string, username: string, location: string) => {
        // D-06 step 1: validate format BEFORE creating any auth user.
        if (!isValidUsername(username)) {
            toastStore.show(t('auth.messages.usernameInvalidFormat'), 'error');
            return false;
        }

        try {
            const { authFns, firestoreFns, auth, db } = await loadFirebaseDeps();

            // D-06 step 2: create the auth user.
            const userCredential = await authFns.createUserWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;
            const norm = normalizeUsername(username);

            // TASK-257: mark this uid as provisioning BEFORE the next await,
            // synchronously — createUserWithEmailAndPassword's resolution
            // also fires onAuthStateChanged, whose listener (above) calls
            // loadUserData(userId) unawaited. Setting this flag now closes
            // the race window as tightly as this layer can: loadUserData's
            // self-heal branch checks it and skips, instead of reserving and
            // writing a SECOND, differently-generated username concurrently.
            provisioningUids.add(userId);
            try {
                // D-06 step 3: atomically reserve the username.
                const reserved = await reserveUsername(userId, norm);
                if (!reserved) {
                    // D-06 step 4: rollback — delete the just-created auth user
                    // (allowed: it is the freshly-authenticated current user).
                    await authFns.deleteUser(userCredential.user);
                    toastStore.show(t('auth.messages.usernameTaken'), 'error');
                    return false;
                }

                // D-06 step 5: persist the user doc with the NORMALIZED username (D-05).
                // TASK-188: sin `email` — /users es de lectura publica y las reglas no
                // filtran por campo. El email vive en Firebase Auth y en contact_info.
                await firestoreFns.setDoc(firestoreFns.doc(db, 'users', userId), {
                    username: norm,
                    location,
                    createdAt: new Date(),
                });
            } finally {
                provisioningUids.delete(userId);
            }

            await authFns.sendEmailVerification(userCredential.user);
            await loadUserData(userId);
            toastStore.show(t('auth.messages.accountCreated'), 'success');
            return true;
        } catch (error: unknown) {
            // TASK-132 review fix (LOW-1): classify a failed dynamic import
            // (network blip, stale deployment) separately — it would
            // otherwise surface as this catch's raw error.message (an
            // un-localized, user-unfriendly "Failed to load the Firebase
            // SDK") instead of a proper retry-able toast.
            if (error instanceof FirebaseDepsLoadError) {
                toastStore.show(t('auth.messages.connectionError'), 'error');
            } else {
                const errMsg = error instanceof Error ? error.message : t('auth.messages.registerError');
                toastStore.show(errMsg, 'error');
            }
            return false;
        }
    };

    /**
     * TASK-124: update the email of the CURRENT (just-created, unverified)
     * account via Firebase's verifyBeforeUpdateEmail — never creates a
     * second account. Grooming decision (2026-07-17) option (e): this
     * replaces the old "change email" flow's local-only reset, which let a
     * re-submitted register() collide with the user's OWN already-reserved
     * username (register's reserveUsername step, D-06) and roll back into an
     * orphaned account + reservation with a misleading "username taken"
     * toast. Deliberately does not touch reserveUsername/releaseUsername or
     * the /usernames rules (SCRUM-73 territory) — no username changes here.
     */
    const changeRegistrationEmail = async (newEmail: string): Promise<boolean> => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) {
                toastStore.show(t('auth.messages.notAuthenticated'), 'error');
                return false;
            }

            // LOW-2: skip the no-op Firebase call and give a clear message
            // instead of silently no-oping (or, worse, letting Firebase
            // reject it with a confusing code).
            if (firebaseUser.email === newEmail) {
                toastStore.show(t('auth.messages.changeEmailSameAsCurrent'), 'error');
                return false;
            }

            await authFns.verifyBeforeUpdateEmail(firebaseUser, newEmail);
            toastStore.show(t('auth.messages.changeEmailSent'), 'success');
            return true;
        } catch (error: unknown) {
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/requires-recent-login') {
                toastStore.show(t('auth.messages.changeEmailRequiresRecentLogin'), 'error');
            } else if (errorCode === 'auth/invalid-email') {
                toastStore.show(t('auth.messages.changeEmailInvalid'), 'error');
            } else if (errorCode === 'auth/email-already-in-use') {
                toastStore.show(t('auth.messages.changeEmailInUse'), 'error');
            } else {
                toastStore.show(t('auth.messages.changeEmailError'), 'error');
            }
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            const userCredential = await authFns.signInWithEmailAndPassword(auth, email, password);
            await loadUserData(userCredential.user.uid);
            emailVerified.value = userCredential.user.emailVerified;

            if (userCredential.user.emailVerified) {
                toastStore.show(t('auth.messages.loginSuccess'), 'success');
            } else {
                toastStore.show(t('auth.messages.verifyEmail'), 'info');
            }
            return true;
        } catch (error: unknown) {
            // TASK-132 review fix (LOW-1): a failed dynamic import (network
            // blip, stale deployment) must not be reported to the user as
            // "invalid credentials" — that sends them chasing a password
            // reset for a problem a page refresh would fix.
            if (error instanceof FirebaseDepsLoadError) {
                toastStore.show(t('auth.messages.connectionError'), 'error');
            } else {
                toastStore.show(t('auth.messages.invalidCredentials'), 'error');
            }
            return false;
        }
    };

    /**
     * Generate a normalized base username and reserve it atomically, retrying
     * with suffixes on collision (D-07, D-06b). Always converges to a reserved,
     * unique username. Shared by loginWithGoogle (new user) and loadUserData
     * (self-heal) so the two creation paths stay parallel siblings.
     * Final fallback is uid-derived (user_<uid8>) — never the colliding 'Usuario'.
     */
    const reserveUniqueUsername = async (uid: string, base: string): Promise<string> => {
        const normBase = normalizeUsername(base) || `user_${uid.slice(0, 8)}`;
        const suffixes = ['', '_mtg', '_tcg', '_cards', '01', '02', '99', '_pro'];
        for (const suffix of suffixes) {
            const candidate = normalizeUsername(`${normBase}${suffix}`);
            if (await reserveUsername(uid, candidate)) return candidate;
        }
        let guard = 0;
        while (guard < 8) {
            const candidate = normalizeUsername(`${normBase}${Math.floor(Math.random() * 9000) + 1000}`);
            guard++;
            if (await reserveUsername(uid, candidate)) return candidate;
        }
        // Guaranteed-unique last resort.
        const fallback = `user_${uid.slice(0, 8)}`;
        await reserveUsername(uid, fallback);
        return fallback;
    };

    const loginWithGoogle = async () => {
        try {
            const { authFns, firestoreFns, auth, db } = await loadFirebaseDeps();
            const provider = new authFns.GoogleAuthProvider();
            // TASK-172: browserPopupRedirectResolver is passed here (per-call)
            // instead of at initializeAuth() in services/firebase.ts, so the
            // popup/redirect resolver — and the reCAPTCHA/gapi iframe it
            // injects — only loads when someone actually clicks "sign in with
            // Google", not on every app boot.
            const userCredential = await authFns.signInWithPopup(auth, provider, authFns.browserPopupRedirectResolver);
            const firebaseUser = userCredential.user;
            // TASK-257: same guard as register() — signInWithPopup's resolution
            // also fires onAuthStateChanged, whose listener calls
            // loadUserData(uid) unawaited, which can self-heal (reserve+write a
            // DIFFERENT generated username) concurrently with this flow's own
            // provisioning below and orphan the loser's /usernames/{norm} index.
            provisioningUids.add(firebaseUser.uid);

            try {
                // Check if user document exists
                const userDoc = await firestoreFns.getDoc(firestoreFns.doc(db, 'users', firebaseUser.uid));

                if (!userDoc.exists()) {
                    // D-07: derive a base, then reserve a unique username (shared helper).
                    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback */
                    const rawBase = firebaseUser.displayName?.toLowerCase().replaceAll(/\s+/g, '_').replaceAll(/[^a-z0-9_]/g, '')
                        || firebaseUser.email?.split('@')[0]
                        || 'user';
                    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
                    const finalUsername = await reserveUniqueUsername(firebaseUser.uid, rawBase);

                    // TASK-188: sin `email` — /users es de lectura publica.
                    await firestoreFns.setDoc(firestoreFns.doc(db, 'users', firebaseUser.uid), {
                        username: finalUsername,
                        location: '',
                        createdAt: new Date(),
                        avatarUrl: firebaseUser.photoURL ?? null,
                    });
                }
            } finally {
                provisioningUids.delete(firebaseUser.uid);
            }

            await loadUserData(firebaseUser.uid);
            emailVerified.value = true; // Google accounts are always verified
            toastStore.show(t('auth.messages.loginSuccess'), 'success');
            return true;
        } catch (error: unknown) {
            logSanitizedError('Google login error', error);
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/popup-closed-by-user') {
                // User closed popup, no error message needed
                return false;
            }
            toastStore.show(t('auth.messages.googleLoginError'), 'error');
            return false;
        }
    };

    const logout = async () => {
        try {
            isLoggingOut.value = true;
            const { authFns, auth } = await loadFirebaseDeps();
            await authFns.signOut(auth);
            user.value = null;
            emailVerified.value = false;
            // Review fix batch LOW-1: onAuthStateChanged(null) early-returns
            // while isLoggingOut is true, so it never writes 'guest' itself
            // here — today's self-heal-via-reload masks that, but writing it
            // explicitly removes the hidden dependency on the reload path.
            setLastKnownAuthState('guest');
            toastStore.show(t('auth.messages.logoutSuccess'), 'success');
            globalThis.location.reload();
            return true;
        } catch (error: unknown) {
            logSanitizedError('Logout error', error);
            toastStore.show(t('auth.messages.logoutError'), 'error');
            isLoggingOut.value = false;
            return false;
        }
    };

    const sendResetPasswordEmail = async (email: string) => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            await authFns.sendPasswordResetEmail(auth, email);
            toastStore.show(t('auth.messages.recoveryEmailSent'), 'success');
            return true;
        } catch (error: unknown) {
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/user-not-found') {
                toastStore.show(t('auth.messages.emailNotRegistered'), 'error');
            } else {
                toastStore.show(t('auth.messages.sendEmailError'), 'error');
            }
            return false;
        }
    };

    const resetPassword = async (code: string, newPassword: string) => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            await authFns.confirmPasswordReset(auth, code, newPassword);
            toastStore.show(t('auth.messages.passwordReset'), 'success');
            return true;
        } catch (error: unknown) {
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/invalid-action-code') {
                toastStore.show(t('auth.messages.linkExpired'), 'error');
            } else if (errorCode === 'auth/weak-password') {
                toastStore.show(t('auth.messages.weakPassword'), 'error');
            } else {
                toastStore.show(t('auth.messages.resetError'), 'error');
            }
            return false;
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            const firebaseUser = auth.currentUser;
            if (!firebaseUser?.email) {
                toastStore.show(t('auth.messages.notAuthenticated'), 'error');
                return false;
            }

            await authFns.signInWithEmailAndPassword(auth, firebaseUser.email, currentPassword);
            await authFns.updatePassword(firebaseUser, newPassword);
            toastStore.show(t('auth.messages.passwordUpdated'), 'success');
            return true;
        } catch (error: unknown) {
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/wrong-password') {
                toastStore.show(t('auth.messages.wrongCurrentPassword'), 'error');
            } else if (errorCode === 'auth/weak-password') {
                toastStore.show(t('auth.messages.weakNewPassword'), 'error');
            } else {
                toastStore.show(t('auth.messages.changePasswordError'), 'error');
            }
            return false;
        }
    };

    const sendVerificationEmail = async () => {
        try {
            const { authFns, auth } = await loadFirebaseDeps();
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) {
                toastStore.show(t('auth.messages.notAuthenticated'), 'error');
                return false;
            }

            await authFns.sendEmailVerification(firebaseUser);
            toastStore.show(t('auth.messages.verificationEmailSent'), 'success');
            return true;
        } catch {
            toastStore.show(t('auth.messages.sendEmailError'), 'error');
            return false;
        }
    };

    const checkEmailVerification = async () => {
        try {
            const { auth } = await loadFirebaseDeps();
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) return false;

            await firebaseUser.reload();
            emailVerified.value = firebaseUser.emailVerified;
            return firebaseUser.emailVerified;
        } catch (error: unknown) {
            // MEDIUM-2 (TASK-124 review follow-up): verifyBeforeUpdateEmail
            // revokes refresh tokens once the confirmation link is clicked, so
            // reload() right after an email change is expected to throw one of
            // these codes — surface a message that tells the user to sign in
            // again with their NEW email, not the generic "error verifying".
            const errorCode = getErrorCode(error);
            if (errorCode === 'auth/user-token-expired' || errorCode === 'auth/user-disabled') {
                toastStore.show(t('auth.messages.emailChangedReauth'), 'error');
            } else {
                toastStore.show(t('auth.messages.verifyEmailError'), 'error');
            }
            return false;
        }
    };

    /**
     * Reserve a username atomically via the /usernames index (D-09).
     * The create-only Firestore rule denies a write onto an existing doc, so a
     * permission-denied here means "already taken" → return false. Any other
     * failure is also treated as not-reserved (safe default).
     * @param norm MUST be a normalized username (use normalizeUsername upstream).
     */
    const reserveUsername = async (uid: string, norm: string): Promise<boolean> => {
        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.setDoc(firestoreFns.doc(db, 'usernames', norm), { uid, createdAt: new Date() });
            return true;
        } catch {
            return false;
        }
    };

    /**
     * Release a username reservation (best-effort, D-09). Used by changeUsername
     * to free the previous username. Never throws.
     */
    const releaseUsername = async (norm: string): Promise<void> => {
        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.deleteDoc(firestoreFns.doc(db, 'usernames', norm));
        } catch {
            // best-effort: a dangling reservation is acceptable, swallow.
        }
    };

    /**
     * Check if a username is available
     * Checks both lowercase and original case since existing usernames may vary
     */
    const checkUsernameAvailable = async (username: string): Promise<boolean> => {
        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            const norm = normalizeUsername(username);

            // D-13: index-first. If a reservation exists, it's taken.
            const indexDoc = await firestoreFns.getDoc(firestoreFns.doc(db, 'usernames', norm));
            if (indexDoc.exists()) {
                return false;
            }

            // Legacy fallback for users not yet backfilled into the index.
            const usersRef = firestoreFns.collection(db, 'users');
            const qLegacy = firestoreFns.query(usersRef, firestoreFns.where('username', '==', norm));
            const snapshot = await firestoreFns.getDocs(qLegacy);
            return snapshot.empty;
        } catch (error) {
            logSanitizedError('Error checking username', error);
            return false;
        }
    };

    /**
     * Generate username suggestions based on desired username
     */
    const generateUsernameSuggestions = async (baseUsername: string): Promise<string[]> => {
        const suggestions: string[] = [];
        const suffixes = ['_mtg', '_tcg', '_cards', '01', '02', '99', '_pro', '_trading'];

        for (const suffix of suffixes) {
            const suggestion = `${baseUsername}${suffix}`;
            const isAvailable = await checkUsernameAvailable(suggestion);
            if (isAvailable) {
                suggestions.push(suggestion);
                if (suggestions.length >= 3) break;
            }
        }

        // Add random number suggestions if we don't have enough
        while (suggestions.length < 3) {
            const randomNum = Math.floor(Math.random() * 9000) + 1000;
            const suggestion = `${baseUsername}${randomNum}`;
            const isAvailable = await checkUsernameAvailable(suggestion);
            if (isAvailable && !suggestions.includes(suggestion)) {
                suggestions.push(suggestion);
            }
        }

        return suggestions;
    };

    /**
     * Check if user can change username (1 month cooldown)
     */
    const canChangeUsername = (): { allowed: boolean; nextChangeDate: Date | null } => {
        if (!user.value?.lastUsernameChange) {
            return { allowed: true, nextChangeDate: null };
        }

        const lastChange = new Date(user.value.lastUsernameChange);
        const nextChangeDate = new Date(lastChange);
        nextChangeDate.setMonth(nextChangeDate.getMonth() + 1);

        const now = new Date();
        return {
            allowed: now >= nextChangeDate,
            nextChangeDate: now < nextChangeDate ? nextChangeDate : null
        };
    };

    /**
     * Change username with validation
     */
    const changeUsername = async (newUsername: string): Promise<{ success: boolean; suggestions?: string[] }> => {
        if (!user.value) {
            toastStore.show(t('auth.messages.notAuthenticated'), 'error');
            return { success: false };
        }

        // Validate username format
        const usernameRegex = /^\w{3,20}$/;
        if (!usernameRegex.test(newUsername)) {
            toastStore.show(t('settings.changeUsername.invalidFormat'), 'error');
            return { success: false };
        }

        // Check rate limit
        const { allowed, nextChangeDate } = canChangeUsername();
        if (!allowed && nextChangeDate) {
            const { locale } = useI18n();
            toastStore.show(t('settings.changeUsername.rateLimited', { date: formatDate(nextChangeDate, locale.value) }), 'error');
            return { success: false };
        }

        // D-08: reserve the NEW username first (atomic). Fail-safe: abort before any mutation.
        const newNorm = normalizeUsername(newUsername);
        const oldNorm = normalizeUsername(user.value.username);

        const reserved = await reserveUsername(user.value.id, newNorm);
        if (!reserved) {
            const suggestions = await generateUsernameSuggestions(newNorm);
            toastStore.show(t('settings.changeUsername.taken'), 'error');
            return { success: false, suggestions };
        }

        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', user.value.id), {
                username: newNorm,
                lastUsernameChange: new Date()
            });

            user.value.username = newNorm;
            user.value.lastUsernameChange = new Date();

            // Best-effort release of the previous reservation (D-08 step 4).
            if (oldNorm && oldNorm !== newNorm) {
                await releaseUsername(oldNorm);
            }

            toastStore.show(t('settings.changeUsername.success'), 'success');
            return { success: true };
        } catch (error) {
            logSanitizedError('Error changing username', error);
            // D-08 step 5: roll back the new reservation to avoid a dangling entry.
            await releaseUsername(newNorm);
            toastStore.show(t('settings.changeUsername.error'), 'error');
            return { success: false };
        }
    };

    /**
     * Change user location
     */
    const changeLocation = async (newLocation: string): Promise<boolean> => {
        if (!user.value) {
            toastStore.show(t('auth.messages.notAuthenticated'), 'error');
            return false;
        }

        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', user.value.id), {
                location: newLocation
            });

            user.value.location = newLocation;
            toastStore.show(t('settings.changeLocation.success'), 'success');
            return true;
        } catch (error) {
            logSanitizedError('Error changing location', error);
            toastStore.show(t('settings.changeLocation.error'), 'error');
            return false;
        }
    };

    /**
     * Detect location using IP only (silent, no permission needed)
     * Used for automatic suggestions
     */
    const detectLocationSilent = async (): Promise<string | null> => {
        interface GeoLocationResponse {
            city?: string;
            country?: string;
        }

        const apis = [
            {
                url: 'https://ipwho.is/',
                parse: (data: GeoLocationResponse) => data.city && data.country ? `${data.city}, ${data.country}` : null
            },
            {
                url: 'https://get.geojs.io/v1/ip/geo.json',
                parse: (data: GeoLocationResponse) => data.city && data.country ? `${data.city}, ${data.country}` : null
            }
        ];

        for (const api of apis) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => { controller.abort(); }, 5000);
                const response = await fetch(api.url, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) continue;
                const data = await response.json() as GeoLocationResponse;
                const location = api.parse(data);
                if (location) return location;
            } catch (error) {
                logSanitizedError(`Failed to fetch from ${api.url}`, error, 'warn');
                continue;
            }
        }

        return null;
    };

    /**
     * Detect user location using browser Geolocation API (GPS/WiFi)
     * Asks for permission - use only when user explicitly requests detection
     */
    const detectLocation = async (): Promise<string | null> => {
        // Try browser geolocation (more accurate - uses GPS/WiFi)
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation not supported'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes cache
                });
            });

            // Reverse geocode coordinates to get city/country
            const { latitude, longitude } = position.coords;
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
                { headers: { 'Accept-Language': 'es' } }
            );
            interface NominatimResponse {
                address?: {
                    city?: string;
                    town?: string;
                    village?: string;
                    municipality?: string;
                    country?: string;
                };
            }
            const data = await response.json() as NominatimResponse;

            if (data.address) {
                const city = data.address.city ?? data.address.town ?? data.address.village ?? data.address.municipality ?? '';
                const country = data.address.country ?? '';
                if (city && country) {
                    return `${city}, ${country}`;
                }
            }
        } catch (error) {
            logSanitizedError('Browser geolocation failed, trying IP-based', error, 'warn');
        }

        // Fallback to IP-based detection
        return detectLocationSilent();
    };

    /**
     * Get avatar URL - returns custom URL or generates one from username
     * Uses DiceBear API for generated avatars (free, no storage needed)
     */
    const getAvatarUrl = (size = 40): string => {
        if (user.value?.avatarUrl) {
            return user.value.avatarUrl;
        }
        // Generate avatar using DiceBear (identicon style)
        const username = user.value?.username ?? 'user';
        return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username)}&size=${size}`;
    };

    /**
     * Change user avatar URL
     */
    const changeAvatar = async (avatarUrl: string | null): Promise<boolean> => {
        if (!user.value) {
            toastStore.show(t('auth.messages.notAuthenticated'), 'error');
            return false;
        }

        try {
            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', user.value.id), {
                avatarUrl
            });

            user.value.avatarUrl = avatarUrl;
            toastStore.show(t('settings.changeAvatar.success'), 'success');
            return true;
        } catch (error) {
            logSanitizedError('Error changing avatar', error);
            toastStore.show(t('settings.changeAvatar.error'), 'error');
            return false;
        }
    };

    /**
     * Upload avatar from file (compresses and converts to base64)
     * Max output size: ~100KB base64 string
     */
    const uploadAvatar = async (file: File): Promise<boolean> => {
        if (!user.value) {
            toastStore.show(t('auth.messages.notAuthenticated'), 'error');
            return false;
        }

        try {
            // Compress and resize image
            const base64 = await compressImage(file, 200, 0.8);

            // Check size (Firestore limit is 1MB per doc, keep avatar under 100KB)
            if (base64.length > 150000) {
                toastStore.show(t('settings.changeAvatar.tooLarge'), 'error');
                return false;
            }

            const { firestoreFns, db } = await loadFirebaseDeps();
            await firestoreFns.updateDoc(firestoreFns.doc(db, 'users', user.value.id), {
                avatarUrl: base64
            });

            user.value.avatarUrl = base64;
            toastStore.show(t('settings.changeAvatar.success'), 'success');
            return true;
        } catch (error) {
            logSanitizedError('Error uploading avatar', error);
            toastStore.show(t('settings.changeAvatar.error'), 'error');
            return false;
        }
    };

    /**
     * Compress and resize image to base64
     */
    const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => { resolve(e.target?.result as string); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => { resolve(img); };
            img.onerror = reject;
            img.src = src;
        });
    };

    const compressImage = async (file: File, maxSize: number, quality: number): Promise<string> => {
        const dataUrl = await readFileAsDataURL(file);
        const img = await loadImage(dataUrl);

        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
            if (width > height) {
                height = (height / width) * maxSize;
                width = maxSize;
            } else {
                width = (width / height) * maxSize;
                height = maxSize;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', quality);
    };

    return {
        user,
        loading,
        emailVerified,
        sessionKnown,
        hasSession,
        initAuth,
        firebaseNeededNow,
        register,
        changeRegistrationEmail,
        login,
        loginWithGoogle,
        logout,
        sendResetPasswordEmail,
        resetPassword,
        changePassword,
        sendVerificationEmail,
        checkEmailVerification,
        checkUsernameAvailable,
        reserveUsername,
        releaseUsername,
        reserveUniqueUsername,
        generateUsernameSuggestions,
        canChangeUsername,
        changeUsername,
        changeLocation,
        detectLocation,
        getAvatarUrl,
        changeAvatar,
        uploadAvatar,
        detectLocationSilent,
    };
});