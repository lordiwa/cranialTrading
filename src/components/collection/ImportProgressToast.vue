<script setup lang="ts">
import { computed } from 'vue';
import IconV2 from '../ui/IconV2.vue';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  current: number;
  total: number;
  processing: boolean;
}>();

const { t } = useI18n();

const percentage = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.current / props.total) * 100);
});
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] bg-[#0d0d0f] border border-line-strong rounded-xl shadow-strong px-md py-md min-w-[320px]">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-5 h-5 border-2 border-neon-40 border-t-neon rounded-full animate-spin flex-shrink-0" aria-hidden="true"></div>
      <h2 class="font-display text-small font-bold uppercase tracking-wide text-silver">{{ t('common.import.processing') }}</h2>
    </div>

    <div class="flex items-end justify-between gap-3 mb-2.5">
      <span class="font-display font-tnum text-small text-silver-50">{{ current }} / {{ total }} {{ t('decks.importModal.preview.cardsLabel').toLowerCase() }}</span>
      <span class="font-display font-tnum text-neon text-[28px] font-bold leading-none">{{ percentage }}%</span>
    </div>
    <div class="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
      <div
          class="h-full rounded-full bg-gradient-to-r from-neon to-[#6FD07C] shadow-[0_0_12px_rgba(90,193,104,.4)] transition-all duration-300 ease-v2"
          :style="{ width: `${percentage}%` }"
      ></div>
    </div>

    <p class="flex items-center gap-2 text-tiny text-silver-50 mt-3.5">
      <IconV2 name="help" :size="15" class="text-silver-30 flex-shrink-0" />
      {{ t('common.import.doNotClose') }}
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
</style>