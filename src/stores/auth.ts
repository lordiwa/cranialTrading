import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    confirmPasswordReset,
    createUserWithEmailAndPassword,
    type User as FirebaseUser,
    GoogleAuthProvider,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updatePassword
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { type User } from '../types/user';
import { useToastStore } from './toast';
import { t } from '../composables/useI18n';

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
                const data = userDoc.data();
                user.value = {
                    id: userId,
                    email: data.email,
                    username: data.username,
                    location: data.location,
                    createdAt: data.createdAt.toDate(),
                    lastUsernameChange: data.lastUsernameChange?.toDate() || null,
                    avatarUrl: data.avatarUrl || null,
                };
            } else {
                const firebaseUser = auth.currentUser;
                if (firebaseUser) {
                    user.value = {
                        id: userId,
                        email: firebaseUser.email || '',
                        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
                        location: '',
                        createdAt: new Date(),
                    };

                    try {
                        await setDoc(doc(db, 'users', userId), {
                            email: user.value.email,
                            username: user.value.username,
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
                    email: firebaseUser.email || '',
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
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;

            await setDoc(doc(db, 'users', userId), {
                email,
                username,
                location,
                createdAt: new Date(),
            });

            await sendEmailVerification(userCredential.user);
            await loadUserData(userId);
            toastStore.show(t('auth.messages.accountCreated'), 'success');
            return true;
        } catch (error: any) {
            toastStore.show(error.message || t('auth.messages.registerError'), 'error');
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

    const loginWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            const userCredential = await signInWithPopup(auth, provider);
            const firebaseUser = userCredential.user;

            // Check if user document exists
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

            if (!userDoc.exists()) {
                // Create new user document for Google user
                const username = firebaseUser.displayName?.toLowerCase().replaceAll(/\s+/g, '_').replaceAll(/[^a-z0-9_]/g, '')
                    || firebaseUser.email?.split('@')[0]
                    || 'user';

                await setDoc(doc(db, 'users', firebaseUser.uid), {
                    email: firebaseUser.email,
                    username,
                    location: '',
                    createdAt: new Date(),
                    avatarUrl: firebaseUser.photoURL || null,
                });
            }

            await loadUserData(firebaseUser.uid);
            emailVerified.value = true; // Google accounts are always verified
            toastStore.show(t('auth.messages.loginSuccess'), 'success');
            return true;
        } catch (error: any) {
            console.error('Google login error:', error);
            if (error.code === 'auth/popup-closed-by-user') {
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
        } catch (error: any) {
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
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
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
        } catch (error: any) {
            if (error.code === 'auth/invalid-action-code') {
                toastStore.show(t('auth.messages.linkExpired'), 'error');
            } else if (error.code === 'auth/weak-password') {
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
        } catch (error: any) {
            if (error.code === 'auth/wrong-password') {
                toastStore.show(t('auth.messages.wrongCurrentPassword'), 'error');
            } else if (error.code === 'auth/weak-password') {
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
        } catch {
            toastStore.show(t('auth.messages.verifyEmailError'), 'error');
            return false;
        }
    };

    /**
     * Check if a username is available
     * Checks both lowercase and original case since existing usernames may vary
     */
    const checkUsernameAvailable = async (username: string): Promise<boolean> => {
        try {
            const usersRef = collection(db, 'users');
            const normalizedUsername = username.toLowerCase();

            // Check lowercase version
            const qLower = query(usersRef, where('username', '==', normalizedUsername));
            const snapshotLower = await getDocs(qLower);

            if (!snapshotLower.empty) {
                return false; // Username taken
            }

            // Also check original case in case usernames were stored with mixed case
            if (username !== normalizedUsername) {
                const qOriginal = query(usersRef, where('username', '==', username));
                const snapshotOriginal = await getDocs(qOriginal);

                if (!snapshotOriginal.empty) {
                    return false; // Username taken
                }
            }

            return true; // Username available
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
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(newUsername)) {
            toastStore.show(t('settings.changeUsername.invalidFormat'), 'error');
            return { success: false };
        }

        // Check rate limit
        const { allowed, nextChangeDate } = canChangeUsername();
        if (!allowed && nextChangeDate) {
            toastStore.show(t('settings.changeUsername.rateLimited', { date: nextChangeDate.toLocaleDateString() }), 'error');
            return { success: false };
        }

        // Check availability
        const normalizedUsername = newUsername.toLowerCase();
        const isAvailable = await checkUsernameAvailable(normalizedUsername);

        if (!isAvailable) {
            const suggestions = await generateUsernameSuggestions(normalizedUsername);
            toastStore.show(t('settings.changeUsername.taken'), 'error');
            return { success: false, suggestions };
        }

        try {
            // Update in Firestore
            await updateDoc(doc(db, 'users', user.value.id), {
                username: normalizedUsername,
                lastUsernameChange: new Date()
            });

            // Update local state
            user.value.username = normalizedUsername;
            user.value.lastUsernameChange = new Date();

            toastStore.show(t('settings.changeUsername.success'), 'success');
            return { success: true };
        } catch (error) {
            console.error('Error changing username:', error);
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
        const apis = [
            {
                url: 'https://ipwho.is/',
                parse: (data: any) => data.city && data.country ? `${data.city}, ${data.country}` : null
            },
            {
                url: 'https://get.geojs.io/v1/ip/geo.json',
                parse: (data: any) => data.city && data.country ? `${data.city}, ${data.country}` : null
            }
        ];

        for (const api of apis) {
            try {
                const response = await fetch(api.url);
                if (!response.ok) continue;
                const data = await response.json();
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
            const data = await response.json();

            if (data.address) {
                const city = data.address.city || data.address.town || data.address.village || data.address.municipality || '';
                const country = data.address.country || '';
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
        const username = user.value?.username || 'user';
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
    const compressImage = (file: File, maxSize: number, quality: number): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Scale down if larger than maxSize
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height / width) * maxSize;
                            width = maxSize;
                        } else {
                            width = (width / height) * maxSize;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Could not get canvas context'));
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(base64);
                };
                img.onerror = reject;
                img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    return {
        user,
        loading,
        emailVerified,
        initAuth,
        register,
        login,
        loginWithGoogle,
        logout,
        sendResetPasswordEmail,
        resetPassword,
        changePassword,
        sendVerificationEmail,
        checkEmailVerification,
        checkUsernameAvailable,
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