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
            path: '/contacts',
            name: 'contacts',
            component: () => import('../views/SavedContactsView.vue'),
            meta: { requiresAuth: true },
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
            path: '/forgot-password',
            name: 'forgotPassword',
            component: () => import('../views/ForgotPasswordView.vue'),
            meta: { requiresGuest: true },
        },
        {
            path: '/reset-password',
            name: 'resetPassword',
            component: () => import('../views/ResetPasswordView.vue'),
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
            path: '/saved-matches',
            name: 'savedMatches',
            component: () => import('../views/SavedMatchesView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/messages',
            name: 'messages',
            component: () => import('../views/MessagesView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { requiresAuth: true },
        },
        // Deck routes - redirect to collection (decks are now managed via collection tabs)
        {
            path: '/decks',
            redirect: '/collection',
        },
        {
            path: '/decks/new',
            redirect: '/collection',
        },
        {
            path: '/decks/:deckId',
            redirect: to => ({ path: '/collection', query: { deck: to.params.deckId } }),
        },
        {
            path: '/decks/:deckId/edit',
            redirect: to => ({ path: '/collection', query: { deck: to.params.deckId } }),
        },
        {
            path: '/@:username',
            name: 'userProfile',
            component: () => import('../views/UserProfileView.vue'),
        },
        // Legal pages (public)
        {
            path: '/terms',
            name: 'terms',
            component: () => import('../views/TermsView.vue'),
        },
        {
            path: '/privacy',
            name: 'privacy',
            component: () => import('../views/PrivacyView.vue'),
        },
        {
            path: '/cookies',
            name: 'cookies',
            component: () => import('../views/CookiesView.vue'),
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'notFound',
            component: () => import('../views/NotFoundView.vue'),
        },
    ],
});

router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore();

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