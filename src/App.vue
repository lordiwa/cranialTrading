<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import BaseToast from './components/ui/BaseToast.vue';
import BaseLoader from './components/ui/BaseLoader.vue';

const authStore = useAuthStore();

onMounted(() => {
  authStore.initAuth();
});
</script>

<template>
  <div v-if="authStore.loading" class="min-h-screen flex items-center justify-center">
    <BaseLoader size="large" />
  </div>

  <RouterView v-else />

  <BaseToast />
</template>