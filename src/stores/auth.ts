import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    confirmPasswordReset,
    createUserWithEmailAndPassword,
    deleteUser,
    type User as FirebaseUser,
    GoogleAuthProvider,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updatePassword,
    verifyBeforeUpdateEmail
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { type User } from '../types/user';
import { useToastStore } from './toast';
import { t, useI18n } from '../composables/useI18n';
import { formatDate } from '../utils/formatDate';
import { isValidUsername, normalizeUsername } from '../utils/username';

let authUnsubscribe: (() => void) | null = null;

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const loading = ref(true);
    const emailVerified = ref(false);
    const isLoggingOut = ref(false);
    const toastStore = useToastStore();

    const initAuth = () => {
        if (authUnsubscribe) return; // Already initialized
        authUnsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
            if (isLoggingOut.value) return;

            if (firebaseUser) {
                emailVerified.value = firebaseUser.emailVerified;
                void loadUserData(firebaseUser.uid);
            } else {
                user.value = null;
                emailVerified.value = false;
                loading.value = false;
            }
        });
    };

    const loadUserData = async (userId: string) => {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const data = userDoc.data() as {
                    email: string;
                    username: string;
                    location: string;
                    createdAt: { toDate: () => Date };
                    lastUsernameChange?: { toDate: () => Date } | null;
                    avatarUrl?: string | null;
                    tourCompleted?: boolean;
                };
                user.value = {
                    id: userId,
                    email: data.email,
                    username: data.username,
                    location: data.location,
                    createdAt: data.createdAt.toDate(),
                    lastUsernameChange: data.lastUsernameChange?.toDate() ?? null,
                    avatarUrl: data.avatarUrl ?? null,
                    tourCompleted: data.tourCompleted ?? false,
                };

                // TASK-124 review follow-up (HIGH-1): Firebase Auth is the source of
                // truth for email. changeRegistrationEmail's verifyBeforeUpdateEmail
                // changes it out-of-band (only takes effect once the user clicks the
                // confirmation link), so the /users doc would go stale forever
                // otherwise — every auth-state load passes through here, so sync it
                // here rather than at the call site.
                const currentAuthEmail = auth.currentUser?.email;
                if (currentAuthEmail && currentAuthEmail !== data.email) {
                    user.value.email = currentAuthEmail;
                    try {
                        await updateDoc(doc(db, 'users', userId), { email: currentAuthEmail });
                    } catch {
                        // best-effort: doc stays stale until the next successful sync, non-fatal
                    }
                }
            } else {
                const firebaseUser = auth.currentUser;
                if (firebaseUser) {
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
                        await setDoc(doc(db, 'users', userId), {
                            email: user.value.email,
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
            // D-06 step 2: create the auth user.
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;
            const norm = normalizeUsername(username);

            // D-06 step 3: atomically reserve the username.
            const reserved = await reserveUsername(userId, norm);
            if (!reserved) {
                // D-06 step 4: rollback — delete the just-created auth user
                // (allowed: it is the freshly-authenticated current user).
                await deleteUser(userCredential.user);
                toastStore.show(t('auth.messages.usernameTaken'), 'error');
                return false;
            }

            // D-06 step 5: persist the user doc with the NORMALIZED username (D-05).
            await setDoc(doc(db, 'users', userId), {
                email,
                username: norm,
                location,
                createdAt: new Date(),
            });

            await sendEmailVerification(userCredential.user);
            await loadUserData(userId);
            toastStore.show(t('auth.messages.accountCreated'), 'success');
            return true;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : t('auth.messages.registerError');
            toastStore.show(errMsg, 'error');
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

            await verifyBeforeUpdateEmail(firebaseUser, newEmail);
            toastStore.show(t('auth.messages.changeEmailSent'), 'success');
            return true;
        } catch (error: unknown) {
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/requires-recent-login') {
                toastStore.show(t('auth.messages.changeEmailRequiresRecentLogin'), 'error');
            } else if (firebaseError.code === 'auth/invalid-email') {
                toastStore.show(t('auth.messages.changeEmailInvalid'), 'error');
            } else if (firebaseError.code === 'auth/email-already-in-use') {
                toastStore.show(t('auth.messages.changeEmailInUse'), 'error');
            } else {
                toastStore.show(t('auth.messages.changeEmailError'), 'error');
            }
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await loadUserData(userCredential.user.uid);
            emailVerified.value = userCredential.user.emailVerified;

            if (userCredential.user.emailVerified) {
                toastStore.show(t('auth.messages.loginSuccess'), 'success');
            } else {
                toastStore.show(t('auth.messages.verifyEmail'), 'info');
            }
            return true;
        } catch {
            toastStore.show(t('auth.messages.invalidCredentials'), 'error');
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
            const provider = new GoogleAuthProvider();
            const userCredential = await signInWithPopup(auth, provider);
            const firebaseUser = userCredential.user;

            // Check if user document exists
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

            if (!userDoc.exists()) {
                // D-07: derive a base, then reserve a unique username (shared helper).
                /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback */
                const rawBase = firebaseUser.displayName?.toLowerCase().replaceAll(/\s+/g, '_').replaceAll(/[^a-z0-9_]/g, '')
                    || firebaseUser.email?.split('@')[0]
                    || 'user';
                /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
                const finalUsername = await reserveUniqueUsername(firebaseUser.uid, rawBase);

                await setDoc(doc(db, 'users', firebaseUser.uid), {
                    email: firebaseUser.email,
                    username: finalUsername,
                    location: '',
                    createdAt: new Date(),
                    avatarUrl: firebaseUser.photoURL ?? null,
                });
            }

            await loadUserData(firebaseUser.uid);
            emailVerified.value = true; // Google accounts are always verified
            toastStore.show(t('auth.messages.loginSuccess'), 'success');
            return true;
        } catch (error: unknown) {
            console.error('Google login error:', error);
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/popup-closed-by-user') {
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
            await signOut(auth);
            user.value = null;
            emailVerified.value = false;
            toastStore.show(t('auth.messages.logoutSuccess'), 'success');
            globalThis.location.reload();
            return true;
        } catch (error: unknown) {
            console.error('Logout error:', error);
            toastStore.show(t('auth.messages.logoutError'), 'error');
            isLoggingOut.value = false;
            return false;
        }
    };

    const sendResetPasswordEmail = async (email: string) => {
        try {
            await sendPasswordResetEmail(auth, email);
            toastStore.show(t('auth.messages.recoveryEmailSent'), 'success');
            return true;
        } catch (error: unknown) {
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/user-not-found') {
                toastStore.show(t('auth.messages.emailNotRegistered'), 'error');
            } else {
                toastStore.show(t('auth.messages.sendEmailError'), 'error');
            }
            return false;
        }
    };

    const resetPassword = async (code: string, newPassword: string) => {
        try {
            await confirmPasswordReset(auth, code, newPassword);
            toastStore.show(t('auth.messages.passwordReset'), 'success');
            return true;
        } catch (error: unknown) {
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/invalid-action-code') {
                toastStore.show(t('auth.messages.linkExpired'), 'error');
            } else if (firebaseError.code === 'auth/weak-password') {
                toastStore.show(t('auth.messages.weakPassword'), 'error');
            } else {
                toastStore.show(t('auth.messages.resetError'), 'error');
            }
            return false;
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        try {
            const firebaseUser = auth.currentUser;
            if (!firebaseUser?.email) {
                toastStore.show(t('auth.messages.notAuthenticated'), 'error');
                return false;
            }

            const { signInWithEmailAndPassword } = await import('firebase/auth');
            await signInWithEmailAndPassword(auth, firebaseUser.email, currentPassword);
            await updatePassword(firebaseUser, newPassword);
            toastStore.show(t('auth.messages.passwordUpdated'), 'success');
            return true;
        } catch (error: unknown) {
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/wrong-password') {
                toastStore.show(t('auth.messages.wrongCurrentPassword'), 'error');
            } else if (firebaseError.code === 'auth/weak-password') {
                toastStore.show(t('auth.messages.weakNewPassword'), 'error');
            } else {
                toastStore.show(t('auth.messages.changePasswordError'), 'error');
            }
            return false;
        }
    };

    const sendVerificationEmail = async () => {
        try {
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) {
                toastStore.show(t('auth.messages.notAuthenticated'), 'error');
                return false;
            }

            await sendEmailVerification(firebaseUser);
            toastStore.show(t('auth.messages.verificationEmailSent'), 'success');
            return true;
        } catch {
            toastStore.show(t('auth.messages.sendEmailError'), 'error');
            return false;
        }
    };

    const checkEmailVerification = async () => {
        try {
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
            const firebaseError = error as { code?: string };
            if (firebaseError.code === 'auth/user-token-expired' || firebaseError.code === 'auth/user-disabled') {
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
            await setDoc(doc(db, 'usernames', norm), { uid, createdAt: new Date() });
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
            await deleteDoc(doc(db, 'usernames', norm));
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
            const norm = normalizeUsername(username);

            // D-13: index-first. If a reservation exists, it's taken.
            const indexDoc = await getDoc(doc(db, 'usernames', norm));
            if (indexDoc.exists()) {
                return false;
            }

            // Legacy fallback for users not yet backfilled into the index.
            const usersRef = collection(db, 'users');
            const qLegacy = query(usersRef, where('username', '==', norm));
            const snapshot = await getDocs(qLegacy);
            return snapshot.empty;
        } catch (error) {
            console.error('Error checking username:', error);
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
            await updateDoc(doc(db, 'users', user.value.id), {
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
            console.error('Error changing username:', error);
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
            await updateDoc(doc(db, 'users', user.value.id), {
                location: newLocation
            });

            user.value.location = newLocation;
            toastStore.show(t('settings.changeLocation.success'), 'success');
            return true;
        } catch (error) {
            console.error('Error changing location:', error);
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
                console.warn(`Failed to fetch from ${api.url}:`, error);
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
            console.warn('Browser geolocation failed, trying IP-based:', error);
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
            await updateDoc(doc(db, 'users', user.value.id), {
                avatarUrl
            });

            user.value.avatarUrl = avatarUrl;
            toastStore.show(t('settings.changeAvatar.success'), 'success');
            return true;
        } catch (error) {
            console.error('Error changing avatar:', error);
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

            await updateDoc(doc(db, 'users', user.value.id), {
                avatarUrl: base64
            });

            user.value.avatarUrl = base64;
            toastStore.show(t('settings.changeAvatar.success'), 'success');
            return true;
        } catch (error) {
            console.error('Error uploading avatar:', error);
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
        initAuth,
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