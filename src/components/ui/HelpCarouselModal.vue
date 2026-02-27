<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useHelpStore } from '../../stores/help'
import SvgIcon from './SvgIcon.vue'

const helpStore = useHelpStore()

// Close on escape key
const handleKeydown = (e: KeyboardEvent) => {
  if (!helpStore.isOpen.value) return

  if (e.key === 'Escape') {
    helpStore.close()
  } else if (e.key === 'ArrowRight') {
    helpStore.next()
  } else if (e.key === 'ArrowLeft') {
    helpStore.prev()
  }
}

onMounted(() => {
  globalThis.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleKeydown)
})

// Prevent body scroll when modal is open
watch(() => helpStore.isOpen.value, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
    >
      <div
          v-if="helpStore.isOpen.value"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4"
          @click.self="helpStore.close()"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/80" />

        <!-- Modal Content -->
        <div class="relative bg-primary border border-silver-30 rounded-md w-full max-w-md md:max-w-lg lg:max-w-xl shadow-strong">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b border-silver-20">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-neon text-primary flex items-center justify-center text-small font-bold">
                ?
              </span>
              <h3 class="text-body font-bold text-silver">Ayuda</h3>
            </div>
            <button
                @click="helpStore.close()"
                class="text-silver-50 hover:text-silver transition-colors p-1"
            >
              <SvgIcon name="x-mark" size="small" />
            </button>
          </div>

          <!-- Content Area -->
          <div class="p-6 min-h-[150px]">
            <Transition
                enter-active-class="transition-all duration-200"
                leave-active-class="transition-all duration-200"
                enter-from-class="opacity-0 translate-x-4"
                leave-to-class="opacity-0 -translate-x-4"
                mode="out-in"
            >
              <div v-if="helpStore.currentItem.value" :key="helpStore.currentIndex.value">
                <h4 class="text-small font-bold text-neon mb-3 uppercase">
                  {{ helpStore.currentItem.value.title }}
                </h4>
                <p class="text-small text-silver-70 leading-relaxed">
                  {{ helpStore.currentItem.value.text }}
                </p>
              </div>
            </Transition>
          </div>

          <!-- Navigation -->
          <div class="flex items-center justify-between p-4 border-t border-silver-20">
            <!-- Previous Button -->
            <button
                @click="helpStore.prev()"
                class="flex items-center gap-1 text-tiny text-silver-50 hover:text-neon transition-colors px-3 py-2 rounded hover:bg-silver-5"
                :class="{ 'opacity-50': helpStore.totalItems.value <= 1 }"
                :disabled="helpStore.totalItems.value <= 1"
            >
              <SvgIcon name="chevron-left" size="tiny" />
              <span>Anterior</span>
            </button>

            <!-- Dots -->
            <div class="flex items-center gap-2">
              <button
                  v-for="(item, index) in helpStore.items.value"
                  :key="item.id"
                  @click="helpStore.goTo(index)"
                  :class="[
                    'w-2 h-2 rounded-full transition-all duration-200',
                    index === helpStore.currentIndex.value
                      ? 'bg-neon w-4'
                      : 'bg-silver-30 hover:bg-silver-50'
                  ]"
                  :title="item.title"
              />
            </div>

            <!-- Next Button -->
            <button
                @click="helpStore.next()"
                class="flex items-center gap-1 text-tiny text-silver-50 hover:text-neon transition-colors px-3 py-2 rounded hover:bg-silver-5"
                :class="{ 'opacity-50': helpStore.totalItems.value <= 1 }"
                :disabled="helpStore.totalItems.value <= 1"
            >
              <span>Siguiente</span>
              <SvgIcon name="chevron-right" size="tiny" />
            </button>
          </div>

          <!-- Counter -->
          <div class="text-center pb-4">
            <span class="text-tiny text-silver-50">
              {{ helpStore.currentIndex.value + 1 }} / {{ helpStore.totalItems.value }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
