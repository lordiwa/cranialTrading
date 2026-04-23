import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BottomSheet from '../../../src/components/ui/BottomSheet.vue'

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const SLOT_BUTTON = '<button data-testid="slot-btn">action</button>'

describe('BottomSheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not render content when show=false', () => {
    const wrapper = mount(BottomSheet, {
      props: { show: false, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })

    expect(document.querySelector('[data-testid="bottom-sheet"]')).toBeNull()
    wrapper.unmount()
  })

  it('renders sheet with role=dialog, aria-modal and aria-label when show=true', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'discover-sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const sheet = document.querySelector<HTMLElement>('[data-testid="bottom-sheet"]')
    expect(sheet).not.toBeNull()
    expect(sheet?.getAttribute('role')).toBe('dialog')
    expect(sheet?.getAttribute('aria-modal')).toBe('true')
    expect(sheet?.getAttribute('aria-label')).toBe('discover-sheet')
    wrapper.unmount()
  })

  it('emits close when overlay is clicked and closeOnClickOutside is true (default)', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const overlay = document.querySelector<HTMLElement>('[data-testid="bottom-sheet-overlay"]')
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')!.length).toBe(1)
    wrapper.unmount()
  })

  it('does not emit close on overlay click when closeOnClickOutside=false', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet', closeOnClickOutside: false },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const overlay = document.querySelector<HTMLElement>('[data-testid="bottom-sheet-overlay"]')
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('emits close on Escape key', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const sheet = document.querySelector<HTMLElement>('[data-testid="bottom-sheet"]')
    sheet?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close when explicit close button is clicked', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const closeBtn = document.querySelector<HTMLElement>('[data-testid="bottom-sheet-close"]')
    closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close after a swipe-down gesture above the threshold', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const handle = document.querySelector<HTMLElement>('[data-testid="bottom-sheet-handle"]')
    expect(handle).not.toBeNull()

    handle?.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      touches: [{ clientY: 100 } as Touch],
    }))
    handle?.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true,
      touches: [{ clientY: 200 } as Touch],
    }))
    handle?.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      changedTouches: [{ clientY: 200 } as Touch],
    }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('does NOT emit close for swipe-down below the threshold', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const handle = document.querySelector<HTMLElement>('[data-testid="bottom-sheet-handle"]')

    handle?.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      touches: [{ clientY: 100 } as Touch],
    }))
    handle?.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true,
      touches: [{ clientY: 130 } as Touch],
    }))
    handle?.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      changedTouches: [{ clientY: 130 } as Touch],
    }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('renders the title in the header when provided', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, title: 'Discover cards' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    const header = document.querySelector('[data-testid="bottom-sheet-header"]')
    expect(header?.textContent).toContain('Discover cards')
    wrapper.unmount()
  })

  it('renders default slot content', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: { default: SLOT_BUTTON },
      attachTo: document.body,
    })
    await nextTick()

    expect(document.querySelector('[data-testid="slot-btn"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('renders the optional footer slot', async () => {
    const wrapper = mount(BottomSheet, {
      props: { show: true, ariaLabel: 'sheet' },
      slots: {
        default: SLOT_BUTTON,
        footer: '<div data-testid="footer-slot">footer</div>',
      },
      attachTo: document.body,
    })
    await nextTick()

    expect(document.querySelector('[data-testid="footer-slot"]')).not.toBeNull()
    wrapper.unmount()
  })
})
