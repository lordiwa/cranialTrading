import { ref, nextTick } from 'vue'
import { useFocusTrap } from '../../../src/composables/useFocusTrap'

function createContainer(...elements: string[]): HTMLElement {
  const container = document.createElement('div')
  for (const tag of elements) {
    const el = document.createElement(tag)
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true })
  document.activeElement?.dispatchEvent(event)
  return event
}

describe('useFocusTrap', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the first focusable element when activated', async () => {
    const container = createContainer('button', 'input', 'button')
    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(false)

    useFocusTrap(containerRef, active)

    active.value = true
    await nextTick()

    expect(document.activeElement).toBe(container.querySelector('button'))
  })

  it('traps Tab from last element to first', async () => {
    const container = createContainer('button', 'input', 'button')
    const buttons = container.querySelectorAll('button')
    const lastButton = buttons[1]!
    const firstButton = buttons[0]!
    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(true)

    useFocusTrap(containerRef, active)
    await nextTick()

    // Focus last element
    lastButton.focus()
    expect(document.activeElement).toBe(lastButton)

    // Press Tab — should wrap to first
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true, cancelable: true })
    lastButton.dispatchEvent(event)

    expect(document.activeElement).toBe(firstButton)
    expect(event.defaultPrevented).toBe(true)
  })

  it('traps Shift+Tab from first element to last', async () => {
    const container = createContainer('button', 'input', 'button')
    const buttons = container.querySelectorAll('button')
    const firstButton = buttons[0]!
    const lastButton = buttons[1]!
    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(true)

    useFocusTrap(containerRef, active)
    await nextTick()

    // Focus first element
    firstButton.focus()
    expect(document.activeElement).toBe(firstButton)

    // Press Shift+Tab — should wrap to last focusable (second button)
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    firstButton.dispatchEvent(event)

    expect(document.activeElement).toBe(lastButton)
    expect(event.defaultPrevented).toBe(true)
  })

  it('restores focus to previously focused element on deactivation', async () => {
    const outsideButton = document.createElement('button')
    outsideButton.textContent = 'outside'
    document.body.appendChild(outsideButton)
    outsideButton.focus()
    expect(document.activeElement).toBe(outsideButton)

    const container = createContainer('button', 'input')
    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(false)

    useFocusTrap(containerRef, active)

    // Activate — should save current focus and move into container
    active.value = true
    await nextTick()
    expect(document.activeElement).toBe(container.querySelector('button'))

    // Deactivate — should restore focus to outsideButton
    active.value = false
    await nextTick()
    expect(document.activeElement).toBe(outsideButton)
  })

  it('does not trap Tab when inactive', async () => {
    const container = createContainer('button', 'input')
    const containerRef = ref<HTMLElement | null>(container)
    const active = ref(false)

    useFocusTrap(containerRef, active)
    await nextTick()

    const btn = container.querySelector('button')!
    btn.focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true, cancelable: true })
    btn.dispatchEvent(event)

    // Should NOT prevent default when inactive
    expect(event.defaultPrevented).toBe(false)
  })
})
