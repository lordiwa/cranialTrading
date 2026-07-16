<script setup lang="ts">
import { computed } from 'vue'

// v2 redesign — stroke-icon renderer for the app shell (design→app v2 F1).
// Pairs with the shared sprite in IconSpriteV2.vue (mounted once in App.vue).
// viewBox 24, stroke-width 1.7, round caps/joins — see DESIGN-DIRECTION.md §4.
interface Props {
  name: string
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 20,
})

const iconHref = computed(() => `#i-${props.name}`)
</script>

<template>
  <svg
      class="stroke-current fill-none flex-shrink-0 [stroke-width:1.7] [stroke-linecap:round] [stroke-linejoin:round]"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
  >
    <use :href="iconHref" />
  </svg>
</template>
