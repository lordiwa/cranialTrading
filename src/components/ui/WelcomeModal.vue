<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useTour } from '../../composables/useTour'
import { useAuthStore } from '../../stores/auth'
import BaseButton from './BaseButton.vue'

const router = useRouter()
const { t } = useI18n()
const { isTourCompleted, startTour, skipTour } = useTour()
const authStore = useAuthStore()

const show = ref(false)

onMounted(() => {
  if (authStore.user && !isTourCompleted()) {
    show.value = true
  }
})

const handleStartTour = async () => {
  show.value = false
  // Navigate to collection page first since tour elements are there
  if (router.currentRoute.value.path !== '/collection') {
    await router.push('/collection')
  }
  setTimeout(() => {
    startTour()
  }, 500)
}

const handleSkip = async () => {
  skipTour()
  show.value = false
  // Navigate to collection page so the user has a clear starting point
  if (router.currentRoute.value.path !== '/collection') {
    await router.push('/collection')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
        v-if="show"
        class="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/80" @click.stop></div>

      <!-- Modal -->
      <div class="relative bg-primary border border-neon rounded px-8 py-10 max-w-md w-full mx-4 text-center">
        <!-- Logo -->
        <svg class="w-16 h-16 text-neon mx-auto mb-6" viewBox="0 0 100 100" fill="currentColor">
          <use href="/icons.svg#cranial-logo" />
        </svg>

        <h2 class="text-h2 font-bold text-neon mb-3">
          {{ t('tour.welcome.title') }}
        </h2>

        <p class="text-body text-silver-70 mb-8">
          {{ t('tour.welcome.subtitle') }}
        </p>

        <div class="flex flex-col gap-3">
          <BaseButton @click="handleStartTour">
            {{ t('tour.welcome.startButton') }}
          </BaseButton>

          <button
              @click="handleSkip"
              class="text-small text-silver-50 hover:text-silver transition-fast"
          >
            {{ t('tour.welcome.skipButton') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
