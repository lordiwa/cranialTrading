<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  current: number;
  total: number;
  processing: boolean;
}>();

const percentage = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.current / props.total) * 100);
});
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] bg-primary border-2 border-neon px-5 py-4 shadow-glow-strong min-w-[320px]">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-4 h-4 border-2 border-neon border-t-transparent rounded-full animate-spin"></div>
      <span class="text-small text-neon font-bold">IMPORTANDO MAZO</span>
    </div>

    <div class="mb-2">
      <div class="flex justify-between text-tiny text-silver-70 mb-1">
        <span>{{ current }} / {{ total }} cartas</span>
        <span>{{ percentage }}%</span>
      </div>
      <div class="w-full h-1 bg-silver-20">
        <div
            class="h-full bg-neon transition-all duration-300"
            :style="{ width: `${percentage}%` }"
        ></div>
      </div>
    </div>

    <p class="text-tiny text-silver-50">
      Procesando... No cierres esta ventana
    </p>
  </div>
</template>

<style scoped>
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.shadow-glow-strong {
  box-shadow: 0 0 12px rgba(57, 255, 20, 0.15);
}
</style>