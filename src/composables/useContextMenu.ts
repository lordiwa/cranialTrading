import { ref, type Ref } from 'vue'

/**
 * Calculate menu position clamped within viewport bounds.
 * Pure function — unit-testable.
 */
export function calculateMenuPosition(
  clickX: number,
  clickY: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const x = Math.max(0, Math.min(clickX, viewportWidth - menuWidth))
  const y = Math.max(0, Math.min(clickY, viewportHeight - menuHeight))
  return { x, y }
}

/**
 * Composable for managing context menu state.
 */
export function useContextMenu<T = unknown>() {
  const isVisible = ref(false)
  const position = ref({ x: 0, y: 0 })
  const targetData: Ref<T | null> = ref(null)

  function open(event: MouseEvent, data: T) {
    event.preventDefault()
    position.value = { x: event.clientX, y: event.clientY }
    targetData.value = data
    isVisible.value = true
  }

  function close() {
    isVisible.value = false
    targetData.value = null
  }

  return {
    isVisible,
    position,
    targetData,
    open,
    close,
  }
}
