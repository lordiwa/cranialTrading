import { createRouter, createWebHistory } from 'vue-router';
import { createAuthGuard } from './authGuard';
import { useAuthStore } from '../stores/auth';
import { clearChunkReloadFlag, handleChunkLoadError } from '../utils/chunkReload';
// TASK-130 (perf F3): LoginView is the guest landing page — lazy-loading it
// only buys a sequential round-trip (router resolves, THEN the chunk starts
// downloading) inside the APPRENDER window. Static import rides the entry
// chunk instead. Safe because LoginView's whole import graph (stores/auth,
// services/publicCardSearch) keeps Firebase out of the static graph already
// (type-only imports / dynamic import('firebase/...') respectively — see
// TASK-132) so this does NOT re-eager Firebase into the entry bundle.
import LoginView from '../views/LoginView.vue';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/saved-matches',
        },
        {
            // RED hub merge: Contactos is now a tab inside /saved-matches, not a standalone page.
            path: '/contacts',
            redirect: { path: '/saved-matches', query: { tab: 'contacts' } },
        },
        {
            path: '/login',
            name: 'login',
            component: LoginView,
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
        // Legacy deck redirects (must come before /decks/:id? to take priority)
        {
            path: '/decks/new',
            redirect: '/decks',
        },
        {
            path: '/decks/:deckId/edit',
            redirect: to => ({ path: `/decks/${String(to.params.deckId)}` }),
        },
        {
            path: '/decks/:id?',
            name: 'decks',
            component: () => import('../views/DeckView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.decks.title', description: 'seo.pages.decks.description', robots: 'noindex, nofollow' },
        },
        {
            path: '/binders/:id?',
            name: 'binders',
            component: () => import('../views/BinderView.vue'),
            meta: { requiresAuth: true, title: 'seo.pages.binders.title', description: 'seo.pages.binders.description', robots: 'noindex, nofollow' },
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

// TASK-129 (perf F2): guard logic lives in ./authGuard so it can be unit
// tested with a fake auth store — no waiting on the Firebase Auth round-trip
// for routes that don't need it (see authGuard.ts for the (a)/(b)/(c) rules).
router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore();
    // Review fix batch MEDIUM-1: guards the deferred /login → /saved-matches
    // redirect against firing after the app has already navigated elsewhere
    // while auth was still resolving in the background.
    const isStillCurrent = () => router.currentRoute.value.fullPath === to.fullPath;
    const guard = createAuthGuard(authStore, (path) => { void router.push(path); }, isStillCurrent);
    await guard(to, _from, next);
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