<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import IconV2 from '../ui/IconV2.vue'

defineProps<{
  itemCount: number
}>()

const emit = defineEmits<{
  toggle: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    v-if="itemCount > 0"
    @click="emit('toggle')"
    :aria-label="t('cart.title')"
    class="fixed bottom-6 right-6 z-50 w-14 h-14 bg-neon text-black rounded-full shadow-strong flex items-center justify-center transition-all ease-v2 hover:bg-[#6FD07C] hover:shadow-glow-neon hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-glow-neon"
  >
    <IconV2 name="cart" :size="24" />
    <!-- Badge -->
    <span class="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 bg-rust text-silver text-[11px] font-display font-tnum font-bold rounded-full flex items-center justify-center">
      {{ itemCount > 99 ? '99+' : itemCount }}
    </span>
  </button>
</template>
