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

router.beforeEach((to, from, next) => {
    const authStore = useAuthStore();

    if (to.meta.requiresAuth && !authStore.user) {
        next('/login');
    } else if (to.meta.requiresGuest && authStore.user) {
        next('/dashboard');
    } else {
        next();
    }
});

export default router;