<script setup lang="ts">
import SpriteIcon from './SpriteIcon.vue'

defineProps<{
  icon?: string
  label?: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
      @click="emit('click')"
      class="fixed bottom-6 right-6 z-40 w-14 h-14 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all md:hidden"
      :title="label"
  >
    <SpriteIcon :name="icon || 'plus'" size="medium" />
  </button>
</template>
