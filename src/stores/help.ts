import { ref, computed } from 'vue'

export interface HelpItem {
  id: string
  title: string
  text: string
  category?: string
}

// Global state
const items = ref<HelpItem[]>([])
const isOpen = ref(false)
const currentIndex = ref(0)

export function useHelpStore() {
  // Register a help item (called by HelpTooltip components)
  const registerItem = (item: HelpItem) => {
    // Avoid duplicates
    const exists = items.value.find(i => i.id === item.id)
    if (!exists) {
      items.value.push(item)
    }
  }

  // Unregister a help item (called on component unmount)
  const unregisterItem = (id: string) => {
    const index = items.value.findIndex(i => i.id === id)
    if (index !== -1) {
      items.value.splice(index, 1)
    }
  }

  // Open modal at specific item
  const openAt = (id: string) => {
    const index = items.value.findIndex(i => i.id === id)
    if (index !== -1) {
      currentIndex.value = index
      isOpen.value = true
    }
  }

  // Close modal
  const close = () => {
    isOpen.value = false
  }

  // Navigate
  const next = () => {
    if (currentIndex.value < items.value.length - 1) {
      currentIndex.value++
    } else {
      currentIndex.value = 0 // Loop to start
    }
  }

  const prev = () => {
    if (currentIndex.value > 0) {
      currentIndex.value--
    } else {
      currentIndex.value = items.value.length - 1 // Loop to end
    }
  }

  const goTo = (index: number) => {
    if (index >= 0 && index < items.value.length) {
      currentIndex.value = index
    }
  }

  // Current item
  const currentItem = computed(() => items.value[currentIndex.value] || null)
  const totalItems = computed(() => items.value.length)

  return {
    items,
    isOpen,
    currentIndex,
    currentItem,
    totalItems,
    registerItem,
    unregisterItem,
    openAt,
    close,
    next,
    prev,
    goTo
  }
}
