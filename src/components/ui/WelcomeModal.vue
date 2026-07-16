<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../../composables/useI18n'
import { useTour } from '../../composables/useTour'
import { useAuthStore } from '../../stores/auth'
import BaseButton from './BaseButton.vue'
import IconV2 from './IconV2.vue'

const router = useRouter()
const { t } = useI18n()
const { isTourCompleted, startTour, skipTour } = useTour()
const authStore = useAuthStore()

const dialogTitleId = `welcome-modal-${Math.random().toString(36).slice(2, 9)}`

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
    void startTour()
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
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/80" @click="handleSkip"></div>

      <!-- Modal -->
      <div
        role="dialog"
        aria-modal="true"
        :aria-labelledby="dialogTitleId"
        class="relative bg-primary border border-line-strong rounded-xl shadow-strong px-8 py-10 md:px-9 max-w-lg w-full mx-4 text-center"
      >
        <!-- Logo -->
        <svg class="w-14 h-14 mx-auto mb-4" viewBox="0 0 100 100" fill="currentColor">
          <use href="/icons.svg#cranial-logo" />
        </svg>

        <p class="text-[11px] font-bold tracking-[.18em] uppercase text-neon mb-2">
          {{ t('tour.welcome.kicker') }}
        </p>

        <h2 :id="dialogTitleId" class="font-display text-h2 font-bold text-silver mb-2">
          {{ t('tour.welcome.title') }}
        </h2>

        <p class="text-small text-silver-50 max-w-sm mx-auto mb-6">
          {{ t('tour.welcome.subtitle') }}
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div class="bg-surface-2 border border-line rounded-lg px-3.5 py-5 text-center">
            <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon">
              <IconV2 name="cards" :size="22" />
            </div>
            <h3 class="font-display text-small font-semibold text-silver mb-1">{{ t('tour.welcome.steps.collect.title') }}</h3>
            <p class="text-tiny text-silver-50 leading-tight">{{ t('tour.welcome.steps.collect.description') }}</p>
          </div>
          <div class="bg-surface-2 border border-line rounded-lg px-3.5 py-5 text-center">
            <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon">
              <IconV2 name="swap" :size="22" />
            </div>
            <h3 class="font-display text-small font-semibold text-silver mb-1">{{ t('tour.welcome.steps.match.title') }}</h3>
            <p class="text-tiny text-silver-50 leading-tight">{{ t('tour.welcome.steps.match.description') }}</p>
          </div>
          <div class="bg-surface-2 border border-line rounded-lg px-3.5 py-5 text-center">
            <div class="w-11 h-11 mx-auto mb-3 rounded-full bg-neon-10 border border-neon-40 flex items-center justify-center text-neon">
              <IconV2 name="chat" :size="22" />
            </div>
            <h3 class="font-display text-small font-semibold text-silver mb-1">{{ t('tour.welcome.steps.trade.title') }}</h3>
            <p class="text-tiny text-silver-50 leading-tight">{{ t('tour.welcome.steps.trade.description') }}</p>
          </div>
        </div>

        <div class="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
          <span class="w-5 h-1.5 rounded-full bg-neon shadow-glow-neon"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-silver-20"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-silver-20"></span>
        </div>

        <div class="flex flex-col gap-2 max-w-xs mx-auto">
          <BaseButton variant="filled" @click="handleStartTour">
            {{ t('tour.welcome.startButton') }}
          </BaseButton>

          <button
              @click="handleSkip"
              class="text-small text-silver-50 hover:text-silver hover:bg-surface-2 rounded-md py-2 transition-fast"
          >
            {{ t('tour.welcome.skipButton') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
