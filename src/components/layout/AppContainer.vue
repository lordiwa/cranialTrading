<script setup lang="ts">
import AppHeader from './AppHeader.vue';
</script>

<template>
  <div class="min-h-screen">
    <AppHeader />
    <main class="container mx-auto px-4 md:px-lg py-6 md:py-8 max-w-7xl">
      <slot />
    </main>
  </div>
</template>