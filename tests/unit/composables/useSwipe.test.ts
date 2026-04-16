import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useSwipe } from '../../../src/composables/useSwipe'

function createTouchEvent(type: string, clientX: number): TouchEvent {
  const touch = {
    clientX,
    clientY: 0,
    identifier: 0,
    target: document.body,
    pageX: clientX,
    pageY: 0,
    screenX: clientX,
    screenY: 0,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  } as Touch

  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
    cancelable: true,
  })
}

/**
 * Mounts a wrapper component that calls useSwipe internally.
 * Returns { wrapper, isSwiping, swipeOffset, el } for assertions.
 */
function mountUseSwipe(options: {
  threshold?: number
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
} = {}) {
  // Captured refs
  let isSwipingRef!: ReturnType<typeof ref<boolean>>
  let swipeOffsetRef!: ReturnType<typeof ref<number>>
  let elRef!: ReturnType<typeof ref<HTMLElement | null>>

  const TestComponent = defineComponent({
    setup() {
      elRef = ref<HTMLElement | null>(null)
      const result = useSwipe(elRef, options)
      isSwipingRef = result.isSwiping
      swipeOffsetRef = result.swipeOffset
      return { elRef }
    },
    template: '<div ref="elRef" data-testid="swipe-target"></div>',
  })

  const wrapper = mount(TestComponent, { attachTo: document.body })
  const el = wrapper.find('[data-testid="swipe-target"]').element as HTMLElement

  return { wrapper, isSwiping: isSwipingRef, swipeOffset: swipeOffsetRef, el }
}

describe('useSwipe', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns isSwiping (initially false) and swipeOffset (initially 0)', () => {
    const { isSwiping, swipeOffset } = mountUseSwipe()
    expect(isSwiping.value).toBe(false)
    expect(swipeOffset.value).toBe(0)
  })

  it('sets isSwiping to true after touchstart', async () => {
    const { isSwiping, el } = mountUseSwipe()

    el.dispatchEvent(createTouchEvent('touchstart', 100))
    await nextTick()

    expect(isSwiping.value).toBe(true)
  })

  it('sets swipeOffset positive after touchstart + touchmove right', async () => {
    const { swipeOffset, el } = mountUseSwipe()

    el.dispatchEvent(createTouchEvent('touchstart', 100))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 160))
    await nextTick()

    expect(swipeOffset.value).toBe(60)
  })

  it('sets swipeOffset negative after touchstart + touchmove left', async () => {
    const { swipeOffset, el } = mountUseSwipe()

    el.dispatchEvent(createTouchEvent('touchstart', 200))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 130))
    await nextTick()

    expect(swipeOffset.value).toBe(-70)
  })

  it('calls onSwipeRight when touchend offset > threshold', async () => {
    const onSwipeRight = vi.fn()
    const { el } = mountUseSwipe({ threshold: 80, onSwipeRight })

    el.dispatchEvent(createTouchEvent('touchstart', 100))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 200))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchend', 200))
    await nextTick()

    expect(onSwipeRight).toHaveBeenCalledTimes(1)
  })

  it('calls onSwipeLeft when touchend offset < -threshold', async () => {
    const onSwipeLeft = vi.fn()
    const { el } = mountUseSwipe({ threshold: 80, onSwipeLeft })

    el.dispatchEvent(createTouchEvent('touchstart', 200))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 100))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchend', 100))
    await nextTick()

    expect(onSwipeLeft).toHaveBeenCalledTimes(1)
  })

  it('does not call either callback when offset is within threshold', async () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { el } = mountUseSwipe({ threshold: 80, onSwipeLeft, onSwipeRight })

    el.dispatchEvent(createTouchEvent('touchstart', 100))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 140))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchend', 140))
    await nextTick()

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('resets isSwiping to false and swipeOffset to 0 after touchend', async () => {
    const { isSwiping, swipeOffset, el } = mountUseSwipe({ threshold: 80 })

    el.dispatchEvent(createTouchEvent('touchstart', 100))
    await nextTick()

    el.dispatchEvent(createTouchEvent('touchmove', 200))
    await nextTick()

    expect(isSwiping.value).toBe(true)
    expect(swipeOffset.value).toBeGreaterThan(0)

    el.dispatchEvent(createTouchEvent('touchend', 200))
    await nextTick()

    expect(isSwiping.value).toBe(false)
    expect(swipeOffset.value).toBe(0)
  })
})
