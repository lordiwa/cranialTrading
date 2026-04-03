<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useFocusTrap } from '../../composables/useFocusTrap';

interface Props {
  show: boolean;
  title?: string;
  ariaLabel?: string;
  closeOnClickOutside?: boolean;
  maxWidth?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  ariaLabel: '',
  closeOnClickOutside: false,
  maxWidth: 'max-w-2xl',
});

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const modalContentRef = ref<HTMLElement | null>(null);
const showRef = ref(props.show);

watch(() => props.show, (val) => { showRef.value = val; });

useFocusTrap(modalContentRef, showRef);

const titleId = `base-modal-title-${Math.random().toString(36).slice(2, 9)}`;

const closeModal = () => {
  emit('close');
};

const handleOverlayClick = () => {
  if (props.closeOnClickOutside) {
    closeModal();
  }
};

const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeModal();
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
          v-if="show"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 px-4"
          @click.self="handleOverlayClick"
          @keydown="handleEscape"
      >
        <div
            ref="modalContentRef"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="title ? titleId : undefined"
            :aria-label="!title && ariaLabel ? ariaLabel : undefined"
            :class="['relative bg-primary border border-silver-50 shadow-strong w-full p-lg transition-normal max-h-[90vh] overflow-y-auto rounded-lg', maxWidth]"
        >
          <button
              @click="closeModal"
              :aria-label="t('common.actions.close')"
              class="absolute top-3 right-3 md:top-4 md:right-4 bg-neon text-primary hover:brightness-110 transition-fast p-1.5 rounded"
          >
            <svg class="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 v-if="title" :id="titleId" class="text-h3 md:text-h2 font-bold text-silver mb-3 md:mb-4 pr-8">{{ title }}</h2>
          <div class="border-t border-silver-20 my-3 md:my-4" v-if="title"></div>

          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
