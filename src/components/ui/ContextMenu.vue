<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { calculateMenuPosition } from '../../composables/useContextMenu'
import type { ContextMenuItem } from '../../types/contextMenu'
import SvgIcon from './SvgIcon.vue'

const props = defineProps<{
  show: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  select: [itemId: string]
  close: []
}>()

// Estimated menu dimensions for instant clamping (avoids two-phase render)
const EST_WIDTH = 200
const EST_HEIGHT = 320

const menuRef = ref<HTMLElement | null>(null)
const adjustedX = ref(0)
const adjustedY = ref(0)
const ready = ref(false)

watch(() => props.show, (visible) => {
  if (visible) {
    // Clamp position immediately using estimated size — no nextTick needed
    const pos = calculateMenuPosition(
      props.x, props.y,
      EST_WIDTH, EST_HEIGHT,
      window.innerWidth, window.innerHeight
    )
    adjustedX.value = pos.x
    adjustedY.value = pos.y
    ready.value = true
    document.addEventListener('mousedown', onClickOutside, true)
    document.addEventListener('keydown', onKeyDown)
  } else {
    ready.value = false
    document.removeEventListener('mousedown', onClickOutside, true)
    document.removeEventListener('keydown', onKeyDown)
  }
})

function onClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function handleSelect(item: ContextMenuItem) {
  if (item.disabled) return
  emit('select', item.id)
  emit('close')
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside, true)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show && ready"
      ref="menuRef"
      class="ctx-menu fixed z-[70] min-w-[180px] max-w-[240px] bg-primary border border-silver-30 rounded shadow-lg shadow-black/50 py-1"
      :style="{ left: `${adjustedX}px`, top: `${adjustedY}px` }"
    >
      <template v-for="item in items" :key="item.id">
        <button
          class="ctx-item w-full px-3 py-1.5 text-left text-small flex items-center gap-2"
          :class="[
            item.disabled
              ? 'text-silver-30 cursor-not-allowed'
              : item.danger
                ? 'text-rust hover:bg-rust/10'
                : item.active
                  ? 'text-neon hover:bg-neon/10'
                  : 'text-silver hover:bg-neon/10 hover:text-neon',
          ]"
          :disabled="item.disabled"
          @click="handleSelect(item)"
        >
          <SvgIcon v-if="item.icon" :name="item.icon" size="tiny" class="flex-shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </button>
        <div v-if="item.dividerAfter" class="border-b border-silver-20 my-1" />
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  animation: ctx-in 80ms ease-out;
}
@keyframes ctx-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
.ctx-item {
  transition: background-color 50ms, color 50ms;
}
</style>
