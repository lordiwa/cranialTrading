/**
 * useDelayedFlag — anti-flicker delayed boolean composable (TASK-117).
 * Verifies the 200ms delay-before-show and the immediate hide-on-settle.
 */

import { ref } from 'vue'
import { useDelayedFlag } from '@/composables/useDelayedFlag'

describe('useDelayedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts false when source starts false', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value)
    expect(delayed.value).toBe(false)
  })

  it('does not flip true before the delay elapses (anti-flicker)', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value, 200)

    source.value = true
    expect(delayed.value).toBe(false)

    vi.advanceTimersByTime(199)
    expect(delayed.value).toBe(false)
  })

  it('flips true once the delay elapses while source stays true', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value, 200)

    source.value = true
    vi.advanceTimersByTime(200)
    expect(delayed.value).toBe(true)
  })

  it('never flips true if source settles back to false before the delay (fast response)', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value, 200)

    source.value = true
    vi.advanceTimersByTime(100)
    source.value = false

    vi.advanceTimersByTime(200)
    expect(delayed.value).toBe(false)
  })

  it('hides immediately when source turns false after having shown', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value, 200)

    source.value = true
    vi.advanceTimersByTime(200)
    expect(delayed.value).toBe(true)

    source.value = false
    expect(delayed.value).toBe(false)
  })

  it('uses a default delay of 200ms when none is provided', () => {
    const source = ref(false)
    const delayed = useDelayedFlag(() => source.value)

    source.value = true
    vi.advanceTimersByTime(199)
    expect(delayed.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(delayed.value).toBe(true)
  })
})
