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

function isInInputField(target: HTMLElement): boolean {
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

function findMatchingShortcut(event: KeyboardEvent, shortcuts: KeyboardShortcut[]): KeyboardShortcut | null {
  const inInput = isInInputField(event.target as HTMLElement)
  for (const shortcut of shortcuts) {
    const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
    const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey
    const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
    const altMatch = shortcut.alt ? event.altKey : !event.altKey
    if (!keyMatch || !ctrlMatch || !shiftMatch || !altMatch) continue
    if (shortcut.key.toLowerCase() !== 'escape' && inInput) continue
    return shortcut
  }
  return null
}

function handleShortcutEvent(event: KeyboardEvent, shortcuts: KeyboardShortcut[]) {
  if (!isEnabled.value) return
  const matched = findMatchingShortcut(event, shortcuts)
  if (matched) {
    event.preventDefault()
    matched.action()
  }
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = (event: KeyboardEvent) => { handleShortcutEvent(event, shortcuts) }

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

  globalListener = (event: KeyboardEvent) => { handleShortcutEvent(event, globalShortcuts.value) }

  window.addEventListener('keydown', globalListener)
}

export function unregisterGlobalShortcuts() {
  if (globalListener) {
    window.removeEventListener('keydown', globalListener)
    globalListener = null
  }
  globalShortcuts.value = []
}
