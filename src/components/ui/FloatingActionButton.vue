<script setup lang="ts">
import SvgIcon from './SvgIcon.vue'

const props = withDefaults(defineProps<{
  icon?: string
  label?: string
  // v2 redesign — 'large' (56px, opt-in) matches DESIGN-DIRECTION.md §5/§8.7 mobile FAB.
  // Default stays the original 48px so existing Deck/Binder callers are unaffected.
  size?: 'default' | 'large'
}>(), {
  size: 'default',
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
      data-tour="fab-add-card"
      @click="emit('click')"
      :class="[
        'fixed bottom-16 right-4 z-50 rounded-full flex items-center justify-center active:scale-95 transition-all',
        props.size === 'large'
          ? 'w-14 h-14 bg-neon text-primary shadow-[0_8px_24px_rgba(0,0,0,.4),0_0_0_1px_rgba(90,193,104,.35),0_0_18px_rgba(90,193,104,.18)] hover:bg-[#6FD07C]'
          : 'w-12 h-12 bg-neon text-primary shadow-lg hover:bg-neon/90'
      ]"
      :title="label"
      :aria-label="label"
  >
    <SvgIcon :name="icon || 'plus'" :size="props.size === 'large' ? 'large' : 'medium'" />
  </button>
</template>
