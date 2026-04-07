import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { clearChunkReloadFlag, handleChunkLoadError } from '../utils/chunkReload';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/saved-matches',
        },
        {
            path: '/contacts',
            name: 'contacts',
            component: () => import('../views/SavedContactsView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.contacts.title', description: 'seo.pages.contacts.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/LoginView.vue'),
            meta: { requiresGuest: true, title: 'seo.pages.login.title', description: 'seo.pages.login.description' },
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('../views/RegisterView.vue'),
            meta: { requiresGuest: true, title: 'seo.pages.register.title', description: 'seo.pages.register.description' },
        },
        {
            path: '/forgot-password',
            name: 'forgotPassword',
            component: () => import('../views/ForgotPasswordView.vue'),
            meta: { requiresGuest: true, title: 'seo.pages.forgotPassword.title', description: 'seo.pages.forgotPassword.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/reset-password',
            name: 'resetPassword',
            component: () => import('../views/ResetPasswordView.vue'),
            meta: { requiresGuest: true, title: 'seo.pages.resetPassword.title', description: 'seo.pages.resetPassword.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/dashboard',
            redirect: '/saved-matches',
        },
        {
            path: '/collection',
            name: 'collection',
            component: () => import('../views/CollectionView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.collection.title', description: 'seo.pages.collection.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/search',
            name: 'search',
            component: () => import('../views/SearchView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.search.title', description: 'seo.pages.search.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/market',
            name: 'market',
            component: () => import('../views/MarketView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.market.title', description: 'seo.pages.market.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/saved-matches',
            name: 'savedMatches',
            component: () => import('../views/SavedMatchesView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.savedMatches.title', description: 'seo.pages.savedMatches.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/messages',
            name: 'messages',
            component: () => import('../views/MessagesView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.messages.title', description: 'seo.pages.messages.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.settings.title', description: 'seo.pages.settings.description', robots: 'noindex, nofollow' },
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
            meta: { title: 'seo.pages.userProfile.title', description: 'seo.pages.userProfile.description' },
        },
        // Help & Legal pages (public)
        {
            path: '/guide/card-conditions',
            name: 'cardConditionGuide',
            component: () => import('../views/CardConditionGuideView.vue'),
            meta: { title: 'seo.pages.cardConditionGuide.title', description: 'seo.pages.cardConditionGuide.description' },
        },
        {
            path: '/guide/how-to-trade',
            name: 'howToTrade',
            component: () => import('../views/HowToTradeGuideView.vue'),
            meta: { title: 'seo.pages.howToTrade.title', description: 'seo.pages.howToTrade.description' },
        },
        {
            path: '/about',
            name: 'about',
            component: () => import('../views/AboutView.vue'),
            meta: { title: 'seo.pages.about.title', description: 'seo.pages.about.description' },
        },
        {
            path: '/contact',
            name: 'contact',
            component: () => import('../views/ContactView.vue'),
            meta: { title: 'seo.pages.contact.title', description: 'seo.pages.contact.description' },
        },
        {
            path: '/faq',
            name: 'faq',
            component: () => import('../views/FaqView.vue'),
            meta: { title: 'seo.pages.faq.title', description: 'seo.pages.faq.description' },
        },
        {
            path: '/terms',
            name: 'terms',
            component: () => import('../views/TermsView.vue'),
            meta: { title: 'seo.pages.terms.title', description: 'seo.pages.terms.description' },
        },
        {
            path: '/privacy',
            name: 'privacy',
            component: () => import('../views/PrivacyView.vue'),
            meta: { title: 'seo.pages.privacy.title', description: 'seo.pages.privacy.description' },
        },
        {
            path: '/cookies',
            name: 'cookies',
            component: () => import('../views/CookiesView.vue'),
            meta: { title: 'seo.pages.cookies.title', description: 'seo.pages.cookies.description' },
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'notFound',
            component: () => import('../views/NotFoundView.vue'),
            meta: { title: 'seo.pages.notFound.title', description: 'seo.pages.notFound.description', robots: 'noindex, nofollow' },
        },
    ],
});

router.beforeEach(async (to, _from, next) => {
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
        next({ path: '/login', query: { returnUrl: to.fullPath } }); return;
    }

    if (requiresGuest && isAuthenticated) {
        next('/saved-matches'); return;
    }

    next();
});

// Clear chunk-reload flag after successful navigation
router.afterEach((to) => {
    clearChunkReloadFlag(to.fullPath);
});

// Handle chunk loading failures with single-retry protection
router.onError((error: unknown, to) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Importing a module script failed')
    ) {
        handleChunkLoadError(to.fullPath);
    }
});

export default router;