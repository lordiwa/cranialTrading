<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';
import AppFooter from './components/layout/AppFooter.vue';

const authStore = useAuthStore();
const route = useRoute();

// Pages where footer should NOT appear
const noFooterRoutes = new Set(['login', 'register', 'forgot-password', 'reset-password', 'verify-email']);

const showFooter = computed(() => {
  const routeName = route.name as string;
  return !noFooterRoutes.has(routeName);
});

onMounted(() => {
  authStore.initAuth();

});
</script>

<template>
  <div v-if="authStore.loading" class="min-h-screen flex items-center justify-center">
    <BaseLoader size="large" />
  </div>

  <div v-else class="min-h-screen flex flex-col">
    <div :class="['flex-1', authStore.user ? 'pb-14 md:pb-0' : '']">
      <RouterView />
    </div>
    <AppFooter v-if="showFooter" />
  </div>

  <BaseToast />
  <ConfirmModal />
</template>