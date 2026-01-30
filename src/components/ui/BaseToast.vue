<script setup lang="ts">
import { useToastStore, isProgressToast, type Toast } from '../../stores/toast';

const toastStore = useToastStore();

const getToastClasses = (toast: Toast) => {
  if (isProgressToast(toast)) {
    if (toast.status === 'complete') return 'border-neon text-neon';
    if (toast.status === 'error') return 'border-rust text-rust';
    return 'border-silver-50 text-silver';
  }
  if (toast.type === 'error') return 'border-rust text-rust';
  if (toast.type === 'success') return 'border-neon text-neon';
  return 'border-silver-50 text-silver';
};

const getProgressBarClass = (toast: Toast) => {
  if (!isProgressToast(toast)) return 'bg-neon';
  if (toast.status === 'complete') return 'bg-neon';
  if (toast.status === 'error') return 'bg-rust';
  return 'bg-neon';
};
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 md:px-0">
      <TransitionGroup name="toast">
        <div
            v-for="toast in toastStore.toasts"
            :key="toast.id"
            :class="[
              'bg-primary border-2 shadow-strong',
              getToastClasses(toast),
              isProgressToast(toast) ? 'min-w-[280px]' : ''
            ]"
        >
          <!-- Regular toast content -->
          <div class="px-md py-md flex items-center gap-2">
            <!-- Progress spinner -->
            <svg
                v-if="isProgressToast(toast) && toast.status === 'active'"
                class="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <!-- Success icon -->
            <svg v-else-if="toast.type === 'success' || (isProgressToast(toast) && toast.status === 'complete')" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <!-- Error icon -->
            <svg v-else-if="toast.type === 'error' || (isProgressToast(toast) && toast.status === 'error')" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <!-- Info icon -->
            <svg v-else-if="toast.type === 'info'" class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>

            <div class="flex-1 min-w-0">
              <span class="text-small block truncate">{{ toast.message }}</span>
              <!-- Progress percentage for progress toasts -->
              <span
                  v-if="isProgressToast(toast) && toast.status === 'active'"
                  class="text-tiny text-silver-50"
              >
                {{ Math.round(toast.progress) }}%
              </span>
            </div>
          </div>

          <!-- Progress bar -->
          <div
              v-if="isProgressToast(toast)"
              class="h-1 bg-silver-10 overflow-hidden"
          >
            <div
                :class="['h-full transition-all duration-300 ease-out', getProgressBarClass(toast)]"
                :style="{ width: `${toast.progress}%` }"
            />
          </div>
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
