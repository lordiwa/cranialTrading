import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface SwipeOptions {
  threshold?: number // minimum distance to trigger swipe (default: 50px)
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function useSwipe(elementRef: Ref<HTMLElement | null>, options: SwipeOptions = {}) {
  const { threshold = 50, onSwipeLeft, onSwipeRight } = options

  const startX = ref(0)
  const currentX = ref(0)
  const isSwiping = ref(false)
  const swipeOffset = ref(0)

  const handleTouchStart = (e: TouchEvent) => {
    startX.value = e.touches[0].clientX
    currentX.value = e.touches[0].clientX
    isSwiping.value = true
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwiping.value) return
    currentX.value = e.touches[0].clientX
    swipeOffset.value = currentX.value - startX.value

    // Prevent page scroll when swiping horizontally
    if (Math.abs(swipeOffset.value) > 10) {
      e.preventDefault()
    }
  }

  const handleTouchEnd = () => {
    if (!isSwiping.value) return

    const distance = currentX.value - startX.value

    if (distance < -threshold && onSwipeLeft) {
      onSwipeLeft()
    } else if (distance > threshold && onSwipeRight) {
      onSwipeRight()
    }

    // Reset
    isSwiping.value = false
    swipeOffset.value = 0
    startX.value = 0
    currentX.value = 0
  }

  onMounted(() => {
    const el = elementRef.value
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
  })

  onUnmounted(() => {
    const el = elementRef.value
    if (!el) return

    el.removeEventListener('touchstart', handleTouchStart)
    el.removeEventListener('touchmove', handleTouchMove)
    el.removeEventListener('touchend', handleTouchEnd)
  })

  return {
    isSwiping,
    swipeOffset,
  }
}
