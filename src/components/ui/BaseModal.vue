<script setup lang="ts">
interface Props {
  show: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
});

const emit = defineEmits<{
  close: [];
}>();

const closeModal = () => {
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
          v-if="show"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80"
          @click.self="closeModal"
      >
        <div class="relative bg-primary border border-silver-50 shadow-strong max-w-md w-full mx-4 p-8 transition-normal">
          <button
              @click="closeModal"
              class="absolute top-4 right-4 text-silver hover:text-neon transition-fast p-2"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 v-if="title" class="text-h3 font-bold text-silver mb-4">{{ title }}</h2>
          <div class="border-t border-silver-20 my-4" v-if="title"></div>

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