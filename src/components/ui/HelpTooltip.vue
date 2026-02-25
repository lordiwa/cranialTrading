<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useHelpStore } from '../../stores/help'

interface Props {
  text: string
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'small' | 'medium'
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Ayuda',
  position: 'top',
  size: 'small'
})

const helpStore = useHelpStore()

// Generate unique ID for this tooltip
const id = computed(() => `help-${props.title}-${props.text.slice(0, 20)}`.replace(/\s+/g, '-'))

// Register on mount
onMounted(() => {
  helpStore.registerItem({
    id: id.value,
    title: props.title,
    text: props.text
  })
})

// Unregister on unmount
onUnmounted(() => {
  helpStore.unregisterItem(id.value)
})

// Handle click to open carousel
const handleClick = () => {
  helpStore.openAt(id.value)
}
</script>

<template>
  <button
      type="button"
      class="inline-flex items-center justify-center"
      @click.stop="handleClick"
      :title="title"
  >
    <!-- Question mark icon -->
    <span
        :class="[
          'inline-flex items-center justify-center rounded-full border cursor-pointer transition-colors',
          size === 'small' ? 'w-4 h-4 text-[14px]' : 'w-5 h-5 text-tiny',
          'border-silver-50 text-silver-50 hover:border-neon hover:text-neon hover:bg-neon/10'
        ]"
    >
      ?
    </span>
  </button>
</template>
