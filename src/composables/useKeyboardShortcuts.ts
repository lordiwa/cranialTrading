import { onMounted, onUnmounted, ref } from 'vue'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description?: string
}

const isEnabled = ref(true)

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isEnabled.value) return

    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement
    const isInputField = target.tagName === 'INPUT' ||
                         target.tagName === 'TEXTAREA' ||
                         target.isContentEditable

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
      const altMatch = shortcut.alt ? event.altKey : !event.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        // For Escape, always trigger (useful for closing modals)
        // For other shortcuts, skip if in input field
        if (shortcut.key.toLowerCase() !== 'escape' && isInputField) {
          continue
        }

        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return {
    isEnabled,
    enable: () => { isEnabled.value = true },
    disable: () => { isEnabled.value = false }
  }
}

// Global shortcuts manager for app-wide shortcuts
const globalShortcuts = ref<KeyboardShortcut[]>([])
let globalListener: ((event: KeyboardEvent) => void) | null = null

export function registerGlobalShortcuts(shortcuts: KeyboardShortcut[]) {
  globalShortcuts.value = shortcuts

  if (globalListener) {
    window.removeEventListener('keydown', globalListener)
  }

  globalListener = (event: KeyboardEvent) => {
    if (!isEnabled.value) return

    const target = event.target as HTMLElement
    const isInputField = target.tagName === 'INPUT' ||
                         target.tagName === 'TEXTAREA' ||
                         target.isContentEditable

    for (const shortcut of globalShortcuts.value) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
      const altMatch = shortcut.alt ? event.altKey : !event.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        if (shortcut.key.toLowerCase() !== 'escape' && isInputField) {
          continue
        }

        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }

  window.addEventListener('keydown', globalListener)
}

export function unregisterGlobalShortcuts() {
  if (globalListener) {
    window.removeEventListener('keydown', globalListener)
    globalListener = null
  }
  globalShortcuts.value = []
}
