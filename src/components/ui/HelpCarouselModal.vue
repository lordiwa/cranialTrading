<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useHelpStore } from '../../stores/help'
import IconV2 from './IconV2.vue'

const helpStore = useHelpStore()

const dialogTitleId = `help-modal-${Math.random().toString(36).slice(2, 9)}`

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
        <div
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
          class="relative bg-primary border border-line-strong rounded-xl w-full max-w-md md:max-w-lg lg:max-w-xl shadow-strong"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b border-line">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-neon-15 border border-neon-40 text-neon flex items-center justify-center text-small font-bold">
                ?
              </span>
              <h3 :id="dialogTitleId" class="font-display text-small font-bold tracking-wide uppercase text-silver">Ayuda</h3>
            </div>
            <button
                @click="helpStore.close()"
                class="text-silver-50 hover:text-silver hover:bg-surface-2 rounded-md transition-colors p-1.5"
                :aria-label="'Close modal'"
            >
              <IconV2 name="x" :size="18" />
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
                <h4 class="font-display text-small font-bold text-neon mb-3 uppercase tracking-wide">
                  {{ helpStore.currentItem.value.title }}
                </h4>
                <p class="text-small text-silver-70 leading-relaxed">
                  {{ helpStore.currentItem.value.text }}
                </p>
              </div>
            </Transition>
          </div>

          <!-- Navigation -->
          <div class="flex items-center justify-between p-4 border-t border-line">
            <!-- Previous Button -->
            <button
                @click="helpStore.prev()"
                class="flex items-center gap-1 text-tiny font-semibold text-silver-50 hover:text-silver transition-all duration-200 ease-v2 px-3 py-2 rounded-md hover:bg-surface-2"
                :class="{ 'opacity-50': helpStore.totalItems.value <= 1 }"
                :disabled="helpStore.totalItems.value <= 1"
            >
              <IconV2 name="chev-l" :size="15" />
              <span>Anterior</span>
            </button>

            <!-- Dots -->
            <div class="flex items-center gap-2">
              <button
                  v-for="(item, index) in helpStore.items.value"
                  :key="item.id"
                  @click="helpStore.goTo(index)"
                  :class="[
                    'h-1.5 rounded-full transition-all duration-200 ease-v2',
                    index === helpStore.currentIndex.value
                      ? 'bg-neon w-5 shadow-glow-neon'
                      : 'bg-silver-20 w-1.5 hover:bg-silver-30'
                  ]"
                  :title="item.title"
              />
            </div>

            <!-- Next Button -->
            <button
                @click="helpStore.next()"
                class="flex items-center gap-1 text-tiny font-semibold text-silver-50 hover:text-silver transition-all duration-200 ease-v2 px-3 py-2 rounded-md hover:bg-surface-2"
                :class="{ 'opacity-50': helpStore.totalItems.value <= 1 }"
                :disabled="helpStore.totalItems.value <= 1"
            >
              <span>Siguiente</span>
              <IconV2 name="chev-r" :size="15" />
            </button>
          </div>

          <!-- Counter -->
          <div class="text-center pb-4">
            <span class="font-display font-tnum text-tiny text-silver-50">
              {{ helpStore.currentIndex.value + 1 }} / {{ helpStore.totalItems.value }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
