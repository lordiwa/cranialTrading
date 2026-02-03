<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name: string
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small'
})

// Size mappings in pixels
const sizes = {
  tiny: 16,
  small: 20,
  medium: 24,
  large: 32,
  xl: 48
}

const displaySize = computed(() => sizes[props.size])

// Icon href with symbol ID
const iconHref = computed(() => `/icons.svg#icon-${props.name}`)
</script>

<template>
  <svg
    class="svg-icon inline-block"
    :class="`svg-icon-${size}`"
    :width="displaySize"
    :height="displaySize"
    :viewBox="'0 0 100 100'"
    fill="currentColor"
  >
    <use :href="iconHref" />
  </svg>
</template>

<style scoped>
.svg-icon {
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
