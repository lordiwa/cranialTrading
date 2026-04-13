<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { usePromptStore } from '../../stores/prompt'
import SvgIcon from './SvgIcon.vue'

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
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80 px-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          class="relative bg-primary border border-silver-50 shadow-strong max-w-md w-full p-6 transition-normal rounded-lg"
        >
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div class="p-3 border rounded border-neon bg-neon/10">
              <SvgIcon name="check" size="large" class="text-neon" />
            </div>
          </div>

          <!-- Title -->
          <h2
              v-if="promptStore.options.title"
              :id="dialogTitleId"
              class="text-h3 font-bold text-silver text-center mb-3"
          >
            {{ promptStore.options.title }}
          </h2>

          <!-- Message -->
          <p class="text-body text-silver-70 text-center mb-4 whitespace-pre-line">
            {{ promptStore.options.message }}
          </p>

          <!-- Input -->
          <div class="mb-6">
            <label
                v-if="promptStore.options.inputLabel"
                class="block text-small text-silver-70 mb-1"
            >
              {{ promptStore.options.inputLabel }}
            </label>
            <input
                ref="inputRef"
                type="number"
                v-model.number="promptStore.inputValue"
                :min="promptStore.options.min"
                :max="promptStore.options.max"
                class="w-full bg-primary border border-silver-50 text-silver px-3 py-2 rounded text-center text-h3 font-bold focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus:outline-none focus:border-neon"
                @keydown="handleKeydown"
            />
          </div>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
                @click="promptStore.cancel"
                class="btn-secondary flex-1 px-4 py-3 text-small font-bold"
            >
              {{ promptStore.options.cancelText }}
            </button>
            <button
                @click="promptStore.confirm"
                class="btn-primary flex-1 px-4 py-3 text-small font-bold"
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
