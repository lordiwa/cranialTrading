<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';

// Registration gate (TASK-086): replaces the old toast+redirect for
// "Quiero esta" on the anonymous catalog search results. Closes on
// backdrop click — this is a soft gate, not a data-editing modal, so it
// doesn't follow the closeOnClickOutside=false rule reserved for
// Add/Edit/StatusModal.

const props = defineProps<{
  show: boolean;
  cardName: string;
}>();

const emit = defineEmits<{
  close: [];
  login: [];
}>();

const { t } = useI18n();
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="true" max-width="max-w-md" @close="emit('close')">
    <div class="text-center space-y-4">
      <div class="flex justify-center">
        <svg class="w-12 h-12 text-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.35-9.33-8.06C1.07 10.4 1.6 7.27 4.1 5.6 6.2 4.2 8.94 4.7 10.5 6.6L12 8.4l1.5-1.8c1.56-1.9 4.3-2.4 6.4-1 2.5 1.67 3.03 4.8 1.43 7.34C19 16.65 12 21 12 21z" />
        </svg>
      </div>

      <h2 class="text-h3 font-bold text-silver">{{ t('landing.marketplace.modal.title') }}</h2>

      <p class="text-small text-silver-70">
        {{ t('landing.marketplace.modal.body', { card: props.cardName }) }}
      </p>

      <div class="space-y-3 pt-2">
        <RouterLink to="/register" class="block" @click="emit('close')">
          <BaseButton variant="filled" class="w-full">{{ t('landing.marketplace.header.createAccount') }}</BaseButton>
        </RouterLink>

        <button
            type="button"
            class="text-small text-silver-70 hover:text-neon transition-fast"
            @click="emit('login')"
        >
          {{ t('landing.marketplace.modal.haveAccount') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
