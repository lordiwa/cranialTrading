<script setup lang="ts">
import AppHeader from './AppHeader.vue';
import HelpCarouselModal from '../ui/HelpCarouselModal.vue';
import WelcomeModal from '../ui/WelcomeModal.vue';
</script>

<template>
  <div class="min-h-screen">
    <AppHeader />
    <main class="container mx-auto px-4 md:px-lg py-6 md:py-8 pb-24 md:pb-8 max-w-7xl overflow-x-hidden">
      <slot />
    </main>

    <!-- Global Help Carousel Modal -->
    <HelpCarouselModal />

    <!-- Onboarding Tour Welcome -->
    <WelcomeModal />
  </div>
</template>