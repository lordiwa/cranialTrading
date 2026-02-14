<script setup lang="ts">
import SvgIcon from './SvgIcon.vue'

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
      data-tour="fab-add-card"
      @click="emit('click')"
      class="fixed bottom-14 right-4 z-50 w-12 h-12 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all md:hidden"
      :title="label"
  >
    <SvgIcon :name="icon || 'plus'" size="medium" />
  </button>
</template>
