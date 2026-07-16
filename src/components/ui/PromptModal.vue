<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { usePromptStore } from '../../stores/prompt'
import IconV2 from './IconV2.vue'

const promptStore = usePromptStore()
const inputRef = ref<HTMLInputElement | null>(null)

const dialogTitleId = `prompt-modal-${Math.random().toString(36).slice(2, 9)}`

// Auto-focus input when modal opens
watch(() => promptStore.isOpen, (open) => {
  if (open) {
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    promptStore.confirm()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade" @after-leave="promptStore.onAfterLeave">
      <div
          v-show="promptStore.isOpen"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          class="relative bg-[#0d0d0f] border border-line-strong shadow-strong max-w-[400px] w-full p-6 rounded-xl"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div class="w-[52px] h-[52px] rounded-full flex items-center justify-center flex-shrink-0 bg-neon-10 text-neon shadow-[0_0_0_1px_rgba(90,193,104,.4)]">
              <IconV2 name="check" :size="24" />
            </div>
          </div>

          <!-- Title -->
          <h2
              v-if="promptStore.options.title"
              :id="dialogTitleId"
              class="font-display text-h3 font-bold text-silver text-center mb-2.5"
          >
            {{ promptStore.options.title }}
          </h2>

          <!-- Message -->
          <p class="text-small text-silver-70 text-center mb-4 whitespace-pre-line">
            {{ promptStore.options.message }}
          </p>

          <!-- Input -->
          <div class="mb-6">
            <label
                v-if="promptStore.options.inputLabel"
                class="block text-small text-silver-70 mb-1.5"
            >
              {{ promptStore.options.inputLabel }}
            </label>
            <input
                ref="inputRef"
                type="number"
                v-model.number="promptStore.inputValue"
                :min="promptStore.options.min"
                :max="promptStore.options.max"
                class="w-full min-h-11 bg-surface-2 border border-line text-silver px-3 py-2 rounded-md text-center font-display font-tnum text-h3 font-bold transition-colors duration-200 ease-v2 focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus:outline-none focus:border-neon focus:shadow-glow-neon"
                @keydown="handleKeydown"
            />
          </div>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
                @click="promptStore.cancel"
                class="flex-1 min-h-11 px-5 rounded-md text-tiny font-bold uppercase tracking-[.1em] border border-line-strong text-silver-70 transition-all duration-200 ease-v2 hover:border-silver-30 hover:text-silver hover:bg-surface-1"
            >
              {{ promptStore.options.cancelText }}
            </button>
            <button
                @click="promptStore.confirm"
                class="flex-1 min-h-11 px-5 rounded-md text-tiny font-bold uppercase tracking-[.1em] border border-neon text-[#5AC168] transition-all duration-200 ease-v2 hover:bg-neon-10 hover:shadow-glow-neon hover:-translate-y-px"
            >
              {{ promptStore.options.confirmText }}
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

/* Hide number input spinners */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
</style>
