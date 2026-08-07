/**
 * Regression tests for useSearchSuggestions — bug report 2026-08-07.
 *
 * QA repro: in the collection filter bar, erase the typed card name fast and type
 * again; the suggestion dropdown ends up showing results for the erased text.
 *
 * Cause: the composable debounced the Scryfall call but had no generation token.
 * Cancelling the timer only helps while the request has not been SENT yet — once
 * it is in flight, erasing (or typing a new term) left it current, so whichever
 * response happened to land last won, regardless of which query it belonged to.
 * Mirrors the token pattern already used in stores/search.ts (TASK-108) and
 * stores/collection.ts's queryPage (_queryGeneration, TASK-113/116).
 */

import { vi } from 'vitest'

const getCardSuggestionsMock = vi.fn()
vi.mock('@/services/scryfall', () => ({
  getCardSuggestions: (...args: unknown[]) => getCardSuggestionsMock(...args),
}))

const cardsRef: { cards: unknown[] } = { cards: [] }
vi.mock('@/stores/collection', () => ({
  useCollectionStore: () => cardsRef,
}))

// eslint-disable-next-line import/first
import { nextTick, ref } from 'vue'
// eslint-disable-next-line import/first
import { useSearchSuggestions } from '@/composables/useSearchSuggestions'

/** A promise plus its externally-callable resolver, for controlling resolution order. */
function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

beforeEach(() => {
  cardsRef.cards = []
  getCardSuggestionsMock.mockReset()
  getCardSuggestionsMock.mockResolvedValue([])
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearchSuggestions: stale-response guard', () => {
  it('discards a response for a query that was erased while it was in flight', async () => {
    const first = deferred<string[]>()
    getCardSuggestionsMock.mockImplementationOnce(() => first.promise)

    const query = ref('')
    const { scryfallSuggestions } = useSearchSuggestions(query)

    query.value = 'sol'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300) // request for "sol" is now in flight

    // Erase — below the 2-char threshold, so no new request is made.
    query.value = ''
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    first.resolve(['Sol Ring', 'Solemn Simulacrum'])
    await vi.runAllTimersAsync()

    expect(scryfallSuggestions.value).toEqual([])
  })

  it('an older response cannot overwrite the suggestions of a newer query', async () => {
    const first = deferred<string[]>()
    getCardSuggestionsMock
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(['Bolt of Keranos'])

    const query = ref('')
    const { scryfallSuggestions } = useSearchSuggestions(query)

    query.value = 'sol'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    query.value = 'bolt'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)
    expect(scryfallSuggestions.value).toEqual(['Bolt of Keranos'])

    // "sol" answers last — it must lose.
    first.resolve(['Sol Ring'])
    await vi.runAllTimersAsync()

    expect(scryfallSuggestions.value).toEqual(['Bolt of Keranos'])
  })

  it('does not leave isLoading stuck true after a superseded request resolves', async () => {
    const first = deferred<string[]>()
    getCardSuggestionsMock
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(['Bolt'])

    const query = ref('')
    const { isLoading } = useSearchSuggestions(query)

    query.value = 'sol'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    query.value = 'bolt'
    await nextTick()
    // The stale "sol" response lands while "bolt" is still debouncing.
    first.resolve(['Sol Ring'])
    await Promise.resolve()

    // "bolt" is still pending — the stale response must not clear the flag.
    expect(isLoading.value).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    expect(isLoading.value).toBe(false)
  })

  it('clearSuggestions invalidates an in-flight request', async () => {
    const first = deferred<string[]>()
    getCardSuggestionsMock.mockImplementationOnce(() => first.promise)

    const query = ref('')
    const { scryfallSuggestions, clearSuggestions } = useSearchSuggestions(query)

    query.value = 'sol'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    clearSuggestions()
    first.resolve(['Sol Ring'])
    await vi.runAllTimersAsync()

    expect(scryfallSuggestions.value).toEqual([])
  })

  it('clearSuggestions cancels a debounce that has not fired yet', async () => {
    const query = ref('')
    const { clearSuggestions } = useSearchSuggestions(query)

    query.value = 'sol'
    await nextTick()

    clearSuggestions()
    await vi.runAllTimersAsync()

    expect(getCardSuggestionsMock).not.toHaveBeenCalled()
  })
})
