import { type Ref, watch } from 'vue'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef: Ref<HTMLElement | null>, active: Ref<boolean>) {
  let previouslyFocused: HTMLElement | null = null

  function getFocusableElements(): HTMLElement[] {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !active.value) return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  watch(active, (isActive) => {
    if (isActive) {
      previouslyFocused = document.activeElement as HTMLElement | null
      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0]!.focus()
      }
      containerRef.value?.addEventListener('keydown', handleKeydown)
    } else {
      containerRef.value?.removeEventListener('keydown', handleKeydown)
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  }, { flush: 'post', immediate: true })
}
