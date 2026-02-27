<script setup lang="ts">
import { computed } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
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
  <BaseModal :show="show" :title="t('decks.importResult.title')" @close="emit('cancel')">
    <div class="space-y-md">
      <!-- Resumen -->
      <div class="border border-silver-30 p-md">
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-tiny text-silver-70">{{ t('decks.importResult.total') }}</p>
            <p class="text-h2 font-bold text-silver mt-1">{{ total }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70">{{ t('decks.importResult.success') }}</p>
            <p class="text-h2 font-bold text-neon mt-1">{{ success }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70">{{ t('decks.importResult.failed') }}</p>
            <p class="text-h2 font-bold text-rust mt-1">{{ failed }}</p>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-silver-20">
          <p class="text-small text-silver-70 text-center">
            {{ t('decks.importResult.successRate') }} <span :class="successRate >= 85 ? 'text-neon' : 'text-rust'">{{ successRate }}%</span>
          </p>
        </div>
      </div>

      <!-- Cartas no encontradas -->
      <div v-if="errors.length > 0">
        <p class="text-small font-bold text-silver-70 mb-2">{{ t('decks.importResult.notFound') }}</p>
        <div class="border border-rust p-md max-h-48 overflow-y-auto bg-primary-dark">
          <ul class="space-y-1">
            <li v-for="(error, index) in errors" :key="index" class="text-tiny text-rust">
              • {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Mensaje -->
      <div class="border border-silver-30 p-md bg-primary-dark">
        <p class="text-small text-silver">
          {{ t('decks.importResult.confirmMessage') }} <span class="text-neon font-bold">{{ t('decks.importResult.correctCards', { count: success }) }}</span> {{ t('decks.importResult.toCollection') }}
        </p>
        <p class="text-tiny text-silver-50 mt-2">
          {{ t('decks.importResult.notAddedNote') }}
        </p>
      </div>

      <!-- Botones -->
      <div class="flex gap-3">
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('cancel')"
        >
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton
            class="flex-1"
            @click="emit('confirm')"
        >
          {{ t('decks.importResult.addCards', { count: success }) }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(139, 46, 31, 0.5);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 46, 31, 0.7);
}
</style>
