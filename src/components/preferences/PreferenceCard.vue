<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';
import { Preference } from '../../types/preferences';
import BaseBadge from '../ui/BaseBadge.vue';
import BaseButton from '../ui/BaseButton.vue';

const { t } = useI18n();

const props = defineProps<{
  preference: Preference;
}>();

const emit = defineEmits<{
  edit: [preference: Preference];
  delete: [prefId: string];
}>();

const getVariant = (type: string): 'busco' | 'cambio' | 'vendo' => {
  if (type === 'BUSCO') return 'busco';
  if (type === 'VENDO') return 'vendo';
  return 'cambio';
};

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return t('common.time.today');
  if (days === 1) return t('common.time.yesterday');
  return t('common.time.daysAgo', { days });
};
</script>

<template>
  <div class="bg-primary border border-silver-30 p-md md:p-5">
    <div class="flex items-start justify-between mb-3">
      <BaseBadge :variant="getVariant(preference.type)">
        {{ preference.type }}
      </BaseBadge>
    </div>

    <p class="text-small md:text-body font-bold text-silver">{{ preference.name }}</p>
    <p class="text-tiny text-silver-70 mt-1">{{ preference.edition }}</p>

    <div class="mt-2 text-tiny md:text-small text-silver-70">
      <span>{{ preference.quantity }}x</span>
      <span class="mx-2">|</span>
      <span>{{ preference.condition }} {{ t('preferences.card.orBetter') }}</span>
    </div>

    <p class="text-tiny text-silver-50 mt-3">
      {{ t('preferences.card.added') }}: {{ formatDate(preference.createdAt) }}
    </p>

    <p class="text-tiny md:text-small text-silver-50 mt-2">
      {{ t('preferences.card.matches') }}: <span class="text-neon">0</span>
    </p>

    <div class="flex flex-col md:flex-row gap-2 mt-4">
      <BaseButton
          variant="secondary"
          size="small"
          @click="emit('edit', preference)"
          class="flex-1 w-full"
      >
        {{ t('common.actions.edit') }}
      </BaseButton>
      <BaseButton
          variant="danger"
          size="small"
          @click="emit('delete', preference.id)"
          class="flex-1 w-full"
      >
        {{ t('common.actions.delete') }}
      </BaseButton>
    </div>
  </div>
</template>