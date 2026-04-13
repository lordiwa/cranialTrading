<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'

interface Props {
  size?: 'small' | 'medium' | 'large';
}

withDefaults(defineProps<Props>(), {
  size: 'medium',
});

const { t } = useI18n()

const sizeClasses = {
  small: 'w-6 h-6',
  medium: 'w-10 h-10',
  large: 'w-16 h-16',
};
</script>

<template>
  <div aria-live="polite" class="flex items-center justify-center">
    <div
        role="status"
        :aria-label="t('common.aria.loading')"
        :class="[
        'animate-spin rounded-full border-2 border-silver-20 border-t-neon',
        sizeClasses[size],
      ]"
    ></div>
  </div>
</template>