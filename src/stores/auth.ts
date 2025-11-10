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

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const loading = ref(true);
    const emailVerified = ref(false);
    const toastStore = useToastStore();

    const initAuth = () => {
        onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
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
                        toastStore.show('Error al guardar datos de usuario', 'error');
                    }
                }
            }
        } catch (error) {
            toastStore.show('Error al cargar datos de usuario', 'error');
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
            toastStore.show('Cuenta creada. Verifica tu email', 'success');
            return true;
        } catch (error: any) {
            toastStore.show(error.message || 'Error al registrar', 'error');
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await loadUserData(userCredential.user.uid);
            emailVerified.value = userCredential.user.emailVerified;

            if (!userCredential.user.emailVerified) {
                toastStore.show('Por favor verifica tu email', 'info');
            } else {
                toastStore.show('Sesión iniciada', 'success');
            }
            return true;
        } catch (error: any) {
            toastStore.show('Email o contraseña incorrectos', 'error');
            return false;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            user.value = null;
            emailVerified.value = false;
            toastStore.show('Sesión cerrada', 'success');
        } catch (error: any) {
            toastStore.show('Error al cerrar sesión', 'error');
        }
    };

    const sendResetPasswordEmail = async (email: string) => {
        try {
            await sendPasswordResetEmail(auth, email);
            toastStore.show('Email de recuperación enviado', 'success');
            return true;
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                toastStore.show('Email no registrado', 'error');
            } else {
                toastStore.show('Error al enviar email', 'error');
            }
            return false;
        }
    };

    const resetPassword = async (code: string, newPassword: string) => {
        try {
            await confirmPasswordReset(auth, code, newPassword);
            toastStore.show('Contraseña restablecida', 'success');
            return true;
        } catch (error: any) {
            if (error.code === 'auth/invalid-action-code') {
                toastStore.show('Enlace expirado o inválido', 'error');
            } else if (error.code === 'auth/weak-password') {
                toastStore.show('Contraseña débil', 'error');
            } else {
                toastStore.show('Error al restablecer', 'error');
            }
            return false;
        }
    };

    const changePassword = async (currentPassword: string, newPassword: string) => {
        try {
            const firebaseUser = auth.currentUser;
            if (!firebaseUser || !firebaseUser.email) {
                toastStore.show('Usuario no autenticado', 'error');
                return false;
            }

            const { signInWithEmailAndPassword } = await import('firebase/auth');
            await signInWithEmailAndPassword(auth, firebaseUser.email, currentPassword);
            await updatePassword(firebaseUser, newPassword);
            toastStore.show('Contraseña actualizada', 'success');
            return true;
        } catch (error: any) {
            if (error.code === 'auth/wrong-password') {
                toastStore.show('Contraseña actual incorrecta', 'error');
            } else if (error.code === 'auth/weak-password') {
                toastStore.show('Contraseña nueva débil', 'error');
            } else {
                toastStore.show('Error al cambiar contraseña', 'error');
            }
            return false;
        }
    };

    const sendVerificationEmail = async () => {
        try {
            const firebaseUser = auth.currentUser;
            if (!firebaseUser) {
                toastStore.show('Usuario no autenticado', 'error');
                return false;
            }

            await sendEmailVerification(firebaseUser);
            toastStore.show('Email de verificación enviado', 'success');
            return true;
        } catch (error: any) {
            toastStore.show('Error al enviar email', 'error');
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
            toastStore.show('Error al verificar email', 'error');
            return false;
        }
    };

    return {
        user,
        loading,
        emailVerified,
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