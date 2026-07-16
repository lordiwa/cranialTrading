<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';
import BaseModal from '../ui/BaseModal.vue';
import IconV2 from '../ui/IconV2.vue';

// Registration gate (TASK-086): replaces the old toast+redirect for
// "Quiero esta" on the anonymous catalog search results. Closes on
// backdrop click — this is a soft gate, not a data-editing modal, so it
// doesn't follow the closeOnClickOutside=false rule reserved for
// Add/Edit/StatusModal.
//
// TASK-102 (F7a): visual-only v2 restyle of the modal CONTENT (icon-ring,
// typography, button treatment per cranial-design/prototype/83-register-
// prompt-*.html) — BaseModal's own chrome (backdrop, close button, focus
// trap) is shared app-wide and stays untouched (see HeaderLoginDropdown
// for the same scoping decision).

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
        <div class="w-[60px] h-[60px] rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon shadow-glow-neon">
          <IconV2 name="heart" :size="26" />
        </div>
      </div>

      <h2 class="font-display text-[22px] font-bold text-silver">{{ t('landing.marketplace.modal.title') }}</h2>

      <p class="text-small text-silver-50 leading-relaxed">
        {{ t('landing.marketplace.modal.body', { card: props.cardName }) }}
      </p>

      <div class="space-y-2.5 pt-2">
        <RouterLink
            to="/register"
            class="flex items-center justify-center min-h-[48px] w-full bg-neon text-primary font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:bg-[#6FD07C] hover:shadow-glow-neon transition-all duration-200 ease-v2"
            @click="emit('close')"
        >
          {{ t('landing.marketplace.header.createAccount') }}
        </RouterLink>

        <button
            type="button"
            class="flex items-center justify-center min-h-[48px] w-full border border-line-strong text-silver-70 font-bold text-[12px] uppercase tracking-[.1em] rounded-md hover:border-silver-30 hover:text-silver hover:bg-surface-1 transition-all duration-200 ease-v2"
            @click="emit('login')"
        >
          {{ t('landing.marketplace.modal.haveAccount') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
