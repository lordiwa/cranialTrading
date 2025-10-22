import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types/user';
import { useToastStore } from './toast';

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const loading = ref(true);
    const toastStore = useToastStore();

    const initAuth = () => {
        onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                await loadUserData(firebaseUser.uid);
            } else {
                user.value = null;
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
            }
        } catch (error) {
            console.error('Error loading user data:', error);
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

            await loadUserData(userId);
            toastStore.show('Cuenta creada exitosamente', 'success');
            return true;
        } catch (error: any) {
            toastStore.show(error.message || 'Error al registrar', 'error');
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            toastStore.show('Sesión iniciada', 'success');
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
            toastStore.show('Sesión cerrada', 'success');
        } catch (error: any) {
            toastStore.show('Error al cerrar sesión', 'error');
        }
    };

    return {
        user,
        loading,
        initAuth,
        register,
        login,
        logout,
    };
});