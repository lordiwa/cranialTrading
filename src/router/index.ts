import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/dashboard',
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/LoginView.vue'),
            meta: { requiresGuest: true },
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('../views/RegisterView.vue'),
            meta: { requiresGuest: true },
        },
        {
            path: '/dashboard',
            name: 'dashboard',
            component: () => import('../views/DashboardView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/collection',
            name: 'collection',
            component: () => import('../views/CollectionView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/preferences',
            name: 'preferences',
            component: () => import('../views/PreferencesView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/saved-matches',
            name: 'savedMatches',
            component: () => import('../views/SavedMatchesView.vue'),
            meta: { requiresAuth: true },
        },
    ],
});

router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore();

    // Wait for initial auth check to complete
    while (authStore.loading) {
        await new Promise<void>((resolve) => {
            const unwatch = authStore.$subscribe(() => {
                if (!authStore.loading) {
                    unwatch();
                    resolve();
                }
            });
            // Timeout para evitar que se quede esperando
            setTimeout(() => {
                try { unwatch(); } catch {}
                resolve();
            }, 2000);
        });
        if (!authStore.loading) break;
    }

    // Check auth status and route accordingly
    const isAuthenticated = !!authStore.user;
    const requiresAuth = to.meta.requiresAuth;
    const requiresGuest = to.meta.requiresGuest;

    if (requiresAuth && !isAuthenticated) {
        return next('/login');
    }

    if (requiresGuest && isAuthenticated) {
        return next('/dashboard');
    }

    next();
});

export default router;