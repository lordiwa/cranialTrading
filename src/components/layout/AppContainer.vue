<script setup lang="ts">
import AppHeader from './AppHeader.vue';
</script>

<template>
  <div class="min-h-screen bg-primary">
    <AppHeader />
    <main class="container mx-auto px-6 py-8 max-w-7xl">
      <slot />
    </main>
  </div>
</template>