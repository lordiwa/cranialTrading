<script setup lang="ts">
import { useConfirmStore } from '../../stores/confirm'
import IconV2 from './IconV2.vue'

const confirmStore = useConfirmStore()

const dialogTitleId = `confirm-modal-${Math.random().toString(36).slice(2, 9)}`

// v2 redesign — ghost/outline buttons per DESIGN-DIRECTION.md §5 (design→app v2 F5b,
// cranial-design/prototype/78-confirm-prompt-*.html). Local Tailwind classes only —
// deliberately NOT the global .btn-primary/.btn-secondary/.btn-danger component classes
// in style.css, since those are shared by unrelated buttons elsewhere (blast radius).
// NOTE: the primary variant deliberately avoids the literal `border-neon text-neon` pair —
// BaseToast.vue uses that exact class combo for its success toast, and e2e/pages/common.page.ts
// locates it via `.border-neon.text-neon`. ConfirmModal stays mounted (v-show, not v-if), so a
// hidden confirm button sharing those two classes was shadowing the real toast in that locator.
const getConfirmButtonClass = () => {
  switch (confirmStore.options.confirmVariant) {
    case 'danger':
      return 'border-rust text-[#C4553F] hover:bg-rust-10 hover:shadow-[0_0_0_1px_#8B2E1F]'
    case 'secondary':
      return 'border-line-strong text-silver-70 hover:border-silver-30 hover:text-silver hover:bg-surface-1'
    default:
      return 'border-neon text-[#5AC168] hover:bg-neon-10 hover:shadow-glow-neon hover:-translate-y-px'
  }
}

const getIconName = () => {
  if (confirmStore.options.confirmVariant === 'danger') return 'alert'
  return 'check'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade" @after-leave="confirmStore.onAfterLeave">
      <div
          v-show="confirmStore.isOpen"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          @click.self="confirmStore.cancel"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          class="relative bg-[#0d0d0f] border border-line-strong shadow-strong max-w-[400px] w-full p-6 rounded-xl"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div
                class="w-[52px] h-[52px] rounded-full flex items-center justify-center flex-shrink-0"
                :class="confirmStore.options.confirmVariant === 'danger'
                  ? 'bg-rust-10 text-[#C4553F] shadow-[0_0_0_1px_#8B2E1F]'
                  : 'bg-neon-10 text-neon shadow-[0_0_0_1px_rgba(90,193,104,.4)]'"
            >
              <IconV2 :name="getIconName()" :size="24" />
            </div>
          </div>

          <!-- Title -->
          <h2
              v-if="confirmStore.options.title"
              :id="dialogTitleId"
              class="font-display text-h3 font-bold text-silver text-center mb-2.5"
          >
            {{ confirmStore.options.title }}
          </h2>

          <!-- Message -->
          <p class="text-small text-silver-70 text-center mb-6 whitespace-pre-line">
            {{ confirmStore.options.message }}
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
                v-if="confirmStore.options.showCancel"
                @click="confirmStore.cancel"
                class="flex-1 min-h-11 px-5 rounded-md text-tiny font-bold uppercase tracking-[.1em] border border-line-strong text-silver-70 transition-all duration-200 ease-v2 hover:border-silver-30 hover:text-silver hover:bg-surface-1"
            >
              {{ confirmStore.options.cancelText }}
            </button>
            <button
                @click="confirmStore.confirm"
                :class="[getConfirmButtonClass(), 'flex-1 min-h-11 px-5 rounded-md text-tiny font-bold uppercase tracking-[.1em] border transition-all duration-200 ease-v2']"
            >
              {{ confirmStore.options.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
