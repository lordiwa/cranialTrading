<script setup lang="ts">
import { computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import IconV2 from '../ui/IconV2.vue';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  show: boolean;
  success: number;
  failed: number;
  total: number;
  errors: string[];
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { t } = useI18n();

const successRate = computed(() => props.total > 0 ? Math.round((props.success / props.total) * 100) : 0);
</script>

<template>
  <BaseModal :show="show" :aria-label="t('decks.importResult.title')" @close="emit('cancel')">
    <div class="space-y-md">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-[.18em] text-neon mb-1">{{ t('decks.importResult.kicker') }}</p>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('decks.importResult.title') }}</h2>
      </div>

      <!-- Resumen -->
      <div class="grid grid-cols-3 gap-3">
        <div class="flex flex-col gap-1 p-4 bg-surface-1 border border-line rounded-lg">
          <span class="font-display font-tnum text-neon text-[26px] font-bold leading-none">{{ success }}</span>
          <span class="text-[11px] uppercase tracking-[.08em] text-silver-30 font-semibold">{{ t('decks.importResult.success') }}</span>
        </div>
        <div class="flex flex-col gap-1 p-4 bg-surface-1 border border-line rounded-lg">
          <span class="font-display font-tnum text-silver text-[26px] font-bold leading-none">{{ total }}</span>
          <span class="text-[11px] uppercase tracking-[.08em] text-silver-30 font-semibold">{{ t('decks.importResult.total') }}</span>
        </div>
        <div class="flex flex-col gap-1 p-4 bg-rust-10 border border-rust/40 rounded-lg">
          <span class="font-display font-tnum text-[#C4553F] text-[26px] font-bold leading-none">{{ failed }}</span>
          <span class="text-[11px] uppercase tracking-[.08em] text-silver-30 font-semibold">{{ t('decks.importResult.failed') }}</span>
        </div>
      </div>

      <div class="flex items-center justify-center gap-2 p-2.5 bg-surface-1 border border-line rounded-md text-small text-silver-70 text-center">
        {{ t('decks.importResult.rateLine', { total }) }}
        <span class="font-display font-tnum font-bold" :class="successRate >= 85 ? 'text-neon' : 'text-[#C4553F]'">{{ successRate }}%</span>
      </div>

      <!-- Cartas no encontradas -->
      <details v-if="errors.length > 0" class="acc bg-surface-1 border border-line rounded-lg overflow-hidden" open>
        <summary class="flex items-center gap-2.5 px-4 py-3.5 text-tiny font-bold uppercase tracking-wide text-[#C4553F] cursor-pointer">
          <IconV2 name="alert" :size="18" />
          {{ t('decks.importResult.notFound') }} ({{ errors.length }})
          <IconV2 name="chev-d" :size="18" class="chev ml-auto text-silver-30 transition-transform duration-200 ease-v2" />
        </summary>
        <ul class="err-list px-4 pb-3 max-h-56 overflow-y-auto">
          <li v-for="(error, index) in errors" :key="index" class="flex items-center gap-2 py-1.5 text-tiny text-silver-70 border-t border-line">
            <IconV2 name="x" :size="14" class="text-[#C4553F] flex-shrink-0" />
            {{ error }}
          </li>
        </ul>
      </details>

      <!-- Mensaje -->
      <div class="p-4 bg-neon-10 border border-neon-40 rounded-lg">
        <p class="text-small text-silver">
          {{ t('decks.importResult.confirmMessage') }} <span class="text-neon font-bold">{{ t('decks.importResult.correctCards', { count: success }) }}</span> {{ t('decks.importResult.toCollection') }}
        </p>
        <p class="text-tiny text-silver-50 mt-1.5">
          {{ t('decks.importResult.notAddedNote') }}
        </p>
      </div>

      <!-- Botones -->
      <div class="flex gap-2 justify-end pt-2 border-t border-line">
        <BaseButton
            variant="secondary"
            class="uppercase tracking-[.1em] !text-[12px]"
            @click="emit('cancel')"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton
            variant="filled"
            class="flex-1 uppercase tracking-[.1em] !text-[12px] gap-2"
            @click="emit('confirm')"
        >
          <IconV2 name="check" :size="16" />
          {{ t('decks.importResult.addCards', { count: success }) }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
/* Scoped to the errors list itself — the old unscoped ::-webkit-scrollbar rules
   targeted a bordered-rust box that no longer exists after the v2 reskin. */
.err-list::-webkit-scrollbar {
  width: 6px;
}

.err-list::-webkit-scrollbar-track {
  background: transparent;
}

.err-list::-webkit-scrollbar-thumb {
  background: rgba(139, 46, 31, 0.5);
  border-radius: 3px;
}

.err-list::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 46, 31, 0.7);
}

.acc > summary {
  list-style: none;
}

.acc > summary::-webkit-details-marker {
  display: none;
}

.acc[open] > summary .chev {
  transform: rotate(180deg);
}
</style>
