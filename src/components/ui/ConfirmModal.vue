<script setup lang="ts">
import { useConfirmStore } from '../../stores/confirm'
import SvgIcon from './SvgIcon.vue'

const confirmStore = useConfirmStore()

const getConfirmButtonClass = () => {
  switch (confirmStore.options.confirmVariant) {
    case 'danger':
      return 'btn-danger'
    case 'secondary':
      return 'btn-secondary'
    default:
      return 'btn-primary'
  }
}

const getIconName = () => {
  if (confirmStore.options.confirmVariant === 'danger') return 'warning'
  return 'check'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
          v-if="confirmStore.isOpen"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-80 px-4"
          @click.self="confirmStore.cancel"
      >
        <div class="relative bg-primary border border-silver-50 shadow-strong max-w-md w-full p-6 transition-normal rounded-lg">
          <!-- Icon -->
          <div class="flex justify-center mb-4">
            <div
                class="p-3 border rounded"
                :class="confirmStore.options.confirmVariant === 'danger' ? 'border-rust bg-rust/10' : 'border-neon bg-neon/10'"
            >
              <SvgIcon
                  :name="getIconName()"
                  size="large"
                  :class="confirmStore.options.confirmVariant === 'danger' ? 'text-rust' : 'text-neon'"
              />
            </div>
          </div>

          <!-- Title -->
          <h2
              v-if="confirmStore.options.title"
              class="text-h3 font-bold text-silver text-center mb-3"
          >
            {{ confirmStore.options.title }}
          </h2>

          <!-- Message -->
          <p class="text-body text-silver-70 text-center mb-6 whitespace-pre-line">
            {{ confirmStore.options.message }}
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
                v-if="confirmStore.options.showCancel"
                @click="confirmStore.cancel"
                class="btn-secondary flex-1 px-4 py-3 text-small font-bold"
            >
              {{ confirmStore.options.cancelText }}
            </button>
            <button
                @click="confirmStore.confirm"
                :class="[getConfirmButtonClass(), 'flex-1 px-4 py-3 text-small font-bold']"
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
