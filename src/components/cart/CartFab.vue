<script setup lang="ts">
defineProps<{
  itemCount: number
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    v-if="itemCount > 0"
    @click="emit('toggle')"
    class="fixed bottom-6 right-6 z-50 w-14 h-14 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 transition-all"
  >
    <!-- Cart icon -->
    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
    <!-- Badge -->
    <span class="absolute -top-1 -right-1 w-6 h-6 bg-rust text-silver text-tiny font-bold rounded-full flex items-center justify-center">
      {{ itemCount > 99 ? '99+' : itemCount }}
    </span>
  </button>
</template>
