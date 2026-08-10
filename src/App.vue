<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useHead } from '@unhead/vue';
import { useAuthStore } from './stores/auth';
import { useI18n } from './composables/useI18n';
import { shouldBlockOnAuthLoading } from './router/authGuard';
import { getLastKnownAuthState } from './utils/authLastKnown';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import PromptModal from './components/ui/PromptModal.vue';
import AppFooter from './components/layout/AppFooter.vue';
import IconSpriteV2 from './components/layout/IconSpriteV2.vue';

const authStore = useAuthStore();
const route = useRoute();
const { t, locale } = useI18n();

// SEO: Reactive head management based on route meta
const pageTitle = computed(() => {
  return route.meta.title ? t(route.meta.title) : 'Cranial Trading';
});

const pageDescription = computed(() => {
  return route.meta.description ? t(route.meta.description) : t('seo.defaultDescription');
});

const pageRobots = computed(() => {
  return route.meta.robots ?? 'index, follow';
});

// TASK-129 (perf F2): the full-screen auth loader must not cover a route the
// router guard already decided not to block on (see router/authGuard.ts).
// Review fix batch HIGH-1: route.matched.length === 0 while the initial
// navigation is still pending (Vue Router's START_LOCATION has empty meta),
// so that window must block optimistically rather than read as "route needs
// no guard" and fall through to a blank RouterView + footer shell.
const shouldShowAuthLoader = computed(() => {
  return shouldBlockOnAuthLoading(route.meta, authStore.loading, getLastKnownAuthState(), route.matched.length > 0);
});

const canonicalUrl = computed(() => {
  return `https://cranial-trading.web.app${route.path}`;
});

useHead({
  title: pageTitle,
  titleTemplate: (title) => title === 'Cranial Trading' ? title : `${title} | Cranial Trading`,
  htmlAttrs: {
    lang: locale,
  },
  meta: [
    { name: 'description', content: pageDescription },
    { name: 'robots', content: pageRobots },
  ],
  link: [
    { rel: 'canonical', href: canonicalUrl },
  ],
});

// Pages where footer should NOT appear
const noFooterRoutes = new Set(['login', 'register', 'forgot-password', 'reset-password', 'verify-email']);

const showFooter = computed(() => {
  const routeName = route.name as string;
  return !noFooterRoutes.has(routeName);
});

// TASK-171: preloadPriceData() used to fire here unconditionally on every
// route (including /inicio and /login, neither of which shows a single
// price) — 5.48MB compressed of AllPricesToday.json.gz on every cold boot,
// regardless of whether the visitor ever opens a price-showing view. It is
// the exact same memoized fetchPriceData() that getCardPrices() already
// calls lazily (services/mtgjson.ts) — every real price consumer
// (CollectionTotalsPanel's already-3s-deferred fetchAllPrices, and the
// per-card useCardPrices() in grid cards / modals / search results / match
// cards) triggers it on its own, exactly when and where it's needed. No
// replacement call was added elsewhere: it would just reintroduce the same
// blanket download this ticket removes, for zero benefit.
onMounted(() => {
  void authStore.initAuth(); // TASK-132: initAuth() is now async internally (see stores/auth.ts)
});
</script>

<template>
  <IconSpriteV2 />

  <a
    href="#main-content"
    class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[9999] focus-visible:px-4 focus-visible:py-2 focus-visible:bg-neon focus-visible:text-primary focus-visible:font-bold focus-visible:rounded focus-visible:outline-none"
  >
    {{ t('common.actions.skipToContent') }}
  </a>

  <div v-if="shouldShowAuthLoader" class="min-h-screen flex items-center justify-center">
    <BaseLoader size="large" />
  </div>

  <div v-else class="min-h-screen flex flex-col">
    <div :class="['flex-1', authStore.user ? 'pb-12 md:pb-0' : '']">
      <RouterView />
    </div>
    <AppFooter v-if="showFooter" />
  </div>

  <BaseToast />
  <ConfirmModal />
  <PromptModal />
</template>