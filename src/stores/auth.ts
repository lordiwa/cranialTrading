import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    confirmPasswordReset,
    updatePassword,
    sendEmailVerification,
    User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types/user';
import { useToastStore } from './toast';
import { t } from '../composables/useI18n';

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const loading = ref(true);
    const emailVerified = ref(false);
    const isLoggingOut = ref(false);
    const toastStore = useToastStore();

    const initAuth = () => {
        onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (isLoggingOut.value) return;

            if (firebaseUser) {
                emailVerified.value = firebaseUser.emailVerified;
                await loadUserData(firebaseUser.uid);
            } else {
                user.value = null;
                emailVerified.value = false;
            }
            loading.value = false;
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
                    } catch (saveError) {
                        toastStore.show(t('auth.messages.saveUserError'), 'error');
                    }
                }
            }
        } catch (error) {
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
        } catch (error: any) {
            toastStore.show(t('auth.messages.invalidCredentials'), 'error');
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
            setTimeout(() => {
                isLoggingOut.value = false;
            }, 500);
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
        } catch (error: any) {
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
        } catch (error) {
            toastStore.show(t('auth.messages.verifyEmailError'), 'error');
            return false;
        }
    };

    return {
        user,
        loading,
        emailVerified,
        isLoggingOut,
        initAuth,
        register,
        login,
        logout,
        sendResetPasswordEmail,
        resetPassword,
        changePassword,
        sendVerificationEmail,
        checkEmailVerification,
    };
});