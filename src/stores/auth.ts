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
        console.log('[AUTH] initAuth called');
        onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            console.log('[AUTH] onAuthStateChanged fired:', firebaseUser?.email);
            if (firebaseUser) {
                await loadUserData(firebaseUser.uid);
            } else {
                user.value = null;
            }
            loading.value = false;
            console.log('[AUTH] loading set to false, user:', user.value?.email);
        });
    };

    const loadUserData = async (userId: string) => {
        try {
            console.log('[AUTH] loadUserData called for userId:', userId);
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
                console.log('[AUTH] User data loaded:', user.value.email);
            } else {
                console.log('[AUTH] User document does not exist, getting from auth');
                // Si el documento no existe, crear uno con datos del auth
                const firebaseUser = auth.currentUser;
                if (firebaseUser) {
                    user.value = {
                        id: userId,
                        email: firebaseUser.email || '',
                        username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
                        location: '',
                        createdAt: new Date(),
                    };

                    // Guardar el documento en Firestore para futuras referencias
                    try {
                        await setDoc(doc(db, 'users', userId), {
                            email: user.value.email,
                            username: user.value.username,
                            location: user.value.location,
                            createdAt: new Date(),
                        });
                        console.log('[AUTH] User document created in Firestore');
                    } catch (saveError) {
                        console.error('[AUTH] Error saving user document:', saveError);
                    }
                }
            }
        } catch (error) {
            console.error('[AUTH] Error loading user data:', error);
            // Incluso si hay error, permitir que el usuario continúe
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
            console.log('[AUTH] login called for:', email);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('[AUTH] signInWithEmailAndPassword success:', userCredential.user.email);

            // Esperar a que se cargue el usuario completo
            await loadUserData(userCredential.user.uid);
            console.log('[AUTH] loadUserData completed, user.value:', user.value?.email);

            toastStore.show('Sesión iniciada', 'success');
            return true;
        } catch (error: any) {
            console.error('[AUTH] login error:', error);
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