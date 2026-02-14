<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { preloadPriceData } from './services/mtgjson';
import { initI18n } from './composables/useI18n';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import AppFooter from './components/layout/AppFooter.vue';

const authStore = useAuthStore();
const route = useRoute();

// Initialize i18n from localStorage
initI18n();

// Pages where footer should NOT appear
const noFooterRoutes = ['login', 'register', 'forgot-password', 'reset-password', 'verify-email'];

const showFooter = computed(() => {
  const routeName = route.name as string;
  return !noFooterRoutes.includes(routeName);
});

onMounted(() => {
  authStore.initAuth();

  // Preload MTGJSON price data in background (Card Kingdom, etc.)
  // This is ~4.6MB compressed, cached for 24 hours
  preloadPriceData();
});
</script>

<template>
  <div v-if="authStore.loading" class="min-h-screen flex items-center justify-center">
    <BaseLoader size="large" />
  </div>

  <div v-else class="min-h-screen flex flex-col">
    <div class="flex-1">
      <RouterView />
    </div>
    <AppFooter v-if="showFooter" />
  </div>

  <BaseToast />
  <ConfirmModal />
</template>