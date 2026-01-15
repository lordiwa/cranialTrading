<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import { preloadPriceData } from './services/mtgjson';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';

const authStore = useAuthStore();

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

  <RouterView v-else />

  <BaseToast />
</template>