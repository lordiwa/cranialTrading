<script setup lang="ts">
import { useToastStore, type ToastType } from '../../stores/toast';

const toastStore = useToastStore();

const getIcon = (type: ToastType) => {
  switch (type) {
    case 'success':
      return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 13l4 4L19 7" />
      </svg>`;
    case 'error':
      return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
      </svg>`;
    default:
      return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>`;
  }
};

const getColor = (type: ToastType) => {
  return type === 'error' ? 'border-rust text-rust' : 'border-neon text-neon';
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      <TransitionGroup name="toast">
        <div
            v-for="toast in toastStore.toasts"
            :key="toast.id"
            :class="[
            'bg-primary border-2 px-md py-md shadow-glow-strong flex items-center gap-2',
            getColor(toast.type),
          ]"
        >
          <span v-html="getIcon(toast.type)"></span>
          <span class="text-small">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  animation: slideUp 300ms ease-out;
}

.toast-leave-active {
  animation: fadeOut 300ms ease-in;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>