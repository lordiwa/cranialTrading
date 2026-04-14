<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useHead } from '@unhead/vue';
import { useAuthStore } from './stores/auth';
import { useI18n } from './composables/useI18n';
import { preloadPriceData } from './services/mtgjson';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import PromptModal from './components/ui/PromptModal.vue';
import AppFooter from './components/layout/AppFooter.vue';

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

onMounted(() => {
  authStore.initAuth();
  void preloadPriceData(); // fire-and-forget: download AllPricesToday.json.gz in background
});
</script>

<template>
  <a
    href="#main-content"
    class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[9999] focus-visible:px-4 focus-visible:py-2 focus-visible:bg-neon focus-visible:text-primary focus-visible:font-bold focus-visible:rounded focus-visible:outline-none"
  >
    {{ t('common.actions.skipToContent') }}
  </a>

  <div v-if="authStore.loading" class="min-h-screen flex items-center justify-center">
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