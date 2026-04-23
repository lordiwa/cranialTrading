<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useFocusTrap } from '../../composables/useFocusTrap';

interface Props {
  show: boolean;
  title?: string;
  ariaLabel?: string;
  closeOnClickOutside?: boolean;
  heightClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  ariaLabel: '',
  closeOnClickOutside: true,
  heightClass: 'h-[85vh]',
});

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const sheetRef = ref<HTMLElement | null>(null);
const showRef = ref(props.show);

watch(() => props.show, (val) => { showRef.value = val; });

useFocusTrap(sheetRef, showRef);

const titleId = `bottom-sheet-title-${Math.random().toString(36).slice(2, 9)}`;

const SWIPE_CLOSE_THRESHOLD_PX = 80;
const touchStartY = ref<number | null>(null);
const touchCurrentY = ref<number | null>(null);

const closeSheet = () => {
  emit('close');
};

const handleOverlayClick = () => {
  if (props.closeOnClickOutside) {
    closeSheet();
  }
};

const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeSheet();
  }
};

const onHandleTouchStart = (e: TouchEvent) => {
  const t0 = e.touches[0];
  touchStartY.value = t0 ? t0.clientY : null;
  touchCurrentY.value = touchStartY.value;
};

const onHandleTouchMove = (e: TouchEvent) => {
  const t0 = e.touches[0];
  if (t0) touchCurrentY.value = t0.clientY;
};

const onHandleTouchEnd = (e: TouchEvent) => {
  const start = touchStartY.value;
  const end = e.changedTouches[0]?.clientY ?? touchCurrentY.value;
  touchStartY.value = null;
  touchCurrentY.value = null;
  if (start === null || end === null || end === undefined) return;
  if (end - start >= SWIPE_CLOSE_THRESHOLD_PX) {
    closeSheet();
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="bottom-sheet">
      <div
          v-if="show"
          data-testid="bottom-sheet-overlay"
          class="fixed inset-0 z-50 bg-black bg-opacity-80"
          @click.self="handleOverlayClick"
      >
        <div
            ref="sheetRef"
            data-testid="bottom-sheet"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="title ? titleId : undefined"
            :aria-label="!title && ariaLabel ? ariaLabel : undefined"
            :class="[
              'absolute inset-x-0 bottom-0 bg-primary border-t-2 border-neon/40 rounded-t-lg shadow-strong flex flex-col',
              heightClass,
            ]"
            style="padding-bottom: env(safe-area-inset-bottom);"
            @keydown="handleEscape"
        >
          <!-- Drag handle (swipe-down area) -->
          <div
              data-testid="bottom-sheet-handle"
              class="flex flex-col items-center pt-2 pb-1 cursor-grab touch-none select-none"
              @touchstart.passive="onHandleTouchStart"
              @touchmove.passive="onHandleTouchMove"
              @touchend.passive="onHandleTouchEnd"
          >
            <span class="block w-10 h-1 rounded bg-silver/30" aria-hidden="true"></span>
          </div>

          <!-- Header -->
          <div
              data-testid="bottom-sheet-header"
              class="flex items-center justify-between gap-2 px-4 pb-2 border-b border-silver-10"
          >
            <h2
                v-if="title"
                :id="titleId"
                class="text-h3 font-bold text-silver truncate"
            >{{ title }}</h2>
            <span v-else class="sr-only">{{ ariaLabel || t('common.actions.close') }}</span>
            <button
                type="button"
                data-testid="bottom-sheet-close"
                @click="closeSheet"
                :aria-label="t('common.actions.close')"
                class="bg-neon text-primary hover:brightness-110 transition-fast p-2 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-3 py-3">
            <slot />
          </div>

          <!-- Optional sticky footer -->
          <div
              v-if="$slots.footer"
              class="border-t border-silver-10 px-3 py-2 bg-primary"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bottom-sheet-enter-active,
.bottom-sheet-leave-active {
  transition: opacity 200ms ease-out;
}
.bottom-sheet-enter-active > div,
.bottom-sheet-leave-active > div {
  transition: transform 250ms ease-out;
}
.bottom-sheet-enter-from,
.bottom-sheet-leave-to {
  opacity: 0;
}
.bottom-sheet-enter-from > div,
.bottom-sheet-leave-to > div {
  transform: translateY(100%);
}
</style>
