/**
 * Unit tests for useGlobalSearch composable — TASK-076 (lightweight header search).
 *
 * The header search is now a name-only autocomplete over Scryfall's
 * /cards/autocomplete endpoint (getCardSuggestions). No Firestore, no card
 * images, no tabs. Selecting a suggestion (or pressing Enter) navigates to
 * the /search results page.
 *
 * Tests cover:
 * - handleInput debounce → single getCardSuggestions call
 * - <2 chars short-circuits and clears suggestions
 * - suggestions capped at 8
 * - stale-response guard (out-of-order responses never overwrite newer ones)
 * - moveHighlight (arrow/home/end navigation, wrap, activeDescendantId)
 * - selectHighlighted (highlight → /search?q=<suggestion>; none → /search?q=<typed>)
 * - resolveSuggestionRoute for RouterLink :to= bindings
 * - isExpanded computed
 * - live region announcements (searching immediate, count debounced)
 */

import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

const getCardSuggestionsMock = vi.fn()
vi.mock('@/services/scryfall', () => ({
  getCardSuggestions: (...args: unknown[]) => getCardSuggestionsMock(...args),
}))

// eslint-disable-next-line import/first
import { useGlobalSearch } from '@/composables/useGlobalSearch'

beforeEach(() => {
  pushMock.mockClear()
  getCardSuggestionsMock.mockReset()
  getCardSuggestionsMock.mockResolvedValue([])
})

// ─── describe: handleInput debounce ──────────────────────────────────────────

describe('handleInput debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces: no fetch before 300ms, one fetch after', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'
    gs.handleInput()

    vi.advanceTimersByTime(299)
    expect(getCardSuggestionsMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await vi.runAllTimersAsync()
    expect(getCardSuggestionsMock).toHaveBeenCalledTimes(1)
    expect(getCardSuggestionsMock).toHaveBeenCalledWith('bolt')
  })

  it('coalesces rapid keystrokes into a single fetch with the last query', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bo'
    gs.handleInput()
    vi.advanceTimersByTime(100)
    gs.searchQuery.value = 'bolt'
    gs.handleInput()
    await vi.runAllTimersAsync()

    expect(getCardSuggestionsMock).toHaveBeenCalledTimes(1)
    expect(getCardSuggestionsMock).toHaveBeenCalledWith('bolt')
  })

  it('clears suggestions without fetching when query drops below 2 chars', async () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['Lightning Bolt']
    gs.searchQuery.value = 'b'
    gs.handleInput()
    await vi.runAllTimersAsync()

    expect(getCardSuggestionsMock).not.toHaveBeenCalled()
    expect(gs.suggestions.value).toEqual([])
  })
})

// ─── describe: performSearch ─────────────────────────────────────────────────

describe('performSearch', () => {
  it('fills suggestions capped at 8 entries', async () => {
    const names = Array.from({ length: 20 }, (_, i) => `Card ${i}`)
    getCardSuggestionsMock.mockResolvedValueOnce(names)
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'card'

    await gs.performSearch()

    expect(gs.suggestions.value).toHaveLength(8)
    expect(gs.suggestions.value[0]).toBe('Card 0')
    expect(gs.loading.value).toBe(false)
    expect(gs.isOpen.value).toBe(true)
  })

  it('does nothing for queries shorter than 2 chars', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'x'
    await gs.performSearch()
    expect(getCardSuggestionsMock).not.toHaveBeenCalled()
  })

  it('stale guard: an older response never overwrites a newer one', async () => {
    let resolveFirst: (v: string[]) => void = () => {}
    const firstPromise = new Promise<string[]>(resolve => { resolveFirst = resolve })
    getCardSuggestionsMock
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(['Newer Result'])

    const gs = useGlobalSearch()
    gs.searchQuery.value = 'first'
    const first = gs.performSearch()

    gs.searchQuery.value = 'second'
    await gs.performSearch()
    expect(gs.suggestions.value).toEqual(['Newer Result'])

    // Old response arrives late — must be discarded
    resolveFirst(['Stale Result'])
    await first
    expect(gs.suggestions.value).toEqual(['Newer Result'])
    expect(gs.loading.value).toBe(false)
  })

  it('resets highlight when new suggestions arrive', async () => {
    getCardSuggestionsMock.mockResolvedValueOnce(['A', 'B'])
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'ab'
    gs.highlightedIndex.value = 1
    await gs.performSearch()

    expect(gs.highlightedIndex.value).toBe(-1)
    expect(gs.activeDescendantId.value).toBeNull()
  })
})

// ─── describe: moveHighlight ──────────────────────────────────────────────────

describe('moveHighlight', () => {
  it('moves down from -1 to 0 when suggestions exist', () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['Lightning Bolt']
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('wraps from last index to 0 on down', () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['A', 'B', 'C']
    gs.highlightedIndex.value = 2
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('wraps from 0 to last index on up', () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['A', 'B', 'C']
    gs.highlightedIndex.value = 0
    gs.moveHighlight('up')
    expect(gs.highlightedIndex.value).toBe(2)
  })

  it('home/end jump to first/last', () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['A', 'B', 'C', 'D']
    gs.highlightedIndex.value = 2
    gs.moveHighlight('home')
    expect(gs.highlightedIndex.value).toBe(0)
    gs.moveHighlight('end')
    expect(gs.highlightedIndex.value).toBe(3)
  })

  it('is a no-op when suggestions are empty', () => {
    const gs = useGlobalSearch()
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(-1)
    expect(gs.activeDescendantId.value).toBeNull()
  })

  it('updates activeDescendantId to option-suggestion-{index}', () => {
    const gs = useGlobalSearch()
    gs.suggestions.value = ['A', 'B']
    gs.moveHighlight('down')
    expect(gs.activeDescendantId.value).toBe('option-suggestion-0')
    gs.moveHighlight('down')
    expect(gs.activeDescendantId.value).toBe('option-suggestion-1')
  })
})

// ─── describe: selectHighlighted / goToResults ────────────────────────────────

describe('selectHighlighted', () => {
  it('navigates to /search with the highlighted suggestion', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'light'
    gs.suggestions.value = ['Lightning Bolt', 'Lightning Helix']
    gs.highlightedIndex.value = 1
    gs.isOpen.value = true

    gs.selectHighlighted()

    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: 'Lightning Helix' } })
    expect(gs.isOpen.value).toBe(false)
    expect(gs.searchQuery.value).toBe('')
    expect(gs.suggestions.value).toEqual([])
  })

  it('navigates to /search with the typed text when nothing is highlighted', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'
    gs.isOpen.value = true

    gs.selectHighlighted()

    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: 'bolt' } })
    expect(gs.isOpen.value).toBe(false)
  })

  it('does not navigate when the query is empty and nothing is highlighted', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = '   '
    gs.selectHighlighted()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('out-of-bounds highlight falls back to typed text (boundary safety)', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.suggestions.value = ['Sol Ring']
    gs.highlightedIndex.value = 5
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: 'sol' } })
  })
})

// ─── describe: resolveSuggestionRoute ─────────────────────────────────────────

describe('resolveSuggestionRoute', () => {
  it('returns { path: "/search", query: { q: name } }', () => {
    const gs = useGlobalSearch()
    expect(gs.resolveSuggestionRoute('Black Lotus')).toEqual({
      path: '/search',
      query: { q: 'Black Lotus' },
    })
  })
})

// ─── describe: isExpanded ─────────────────────────────────────────────────────

describe('isExpanded', () => {
  it('is false when isOpen is false regardless of loading/suggestions', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = false
    gs.loading.value = true
    gs.suggestions.value = ['A']
    expect(gs.isExpanded.value).toBe(false)
  })

  it('is true when open and loading', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    gs.loading.value = true
    expect(gs.isExpanded.value).toBe(true)
  })

  it('is true when open with suggestions', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    gs.suggestions.value = ['A']
    expect(gs.isExpanded.value).toBe(true)
  })

  it('is false when open, not loading, no suggestions', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    expect(gs.isExpanded.value).toBe(false)
  })
})

// ─── describe: clearSearch ────────────────────────────────────────────────────

describe('clearSearch', () => {
  it('resets query, suggestions, highlight and closes the popup', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'
    gs.suggestions.value = ['Lightning Bolt']
    gs.highlightedIndex.value = 0
    gs.isOpen.value = true

    gs.clearSearch()

    expect(gs.searchQuery.value).toBe('')
    expect(gs.suggestions.value).toEqual([])
    expect(gs.highlightedIndex.value).toBe(-1)
    expect(gs.isOpen.value).toBe(false)
  })
})

// ─── describe: live region announcements ──────────────────────────────────────

describe('live region announcements', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces searching synchronously when performSearch starts', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'

    const searchPromise = gs.performSearch()
    expect(gs.ariaLiveMessage.value).toBe('header.search.searching')

    await vi.runAllTimersAsync()
    await searchPromise
  })

  it('schedules a suggestionsCount announcement after the search completes', async () => {
    getCardSuggestionsMock.mockResolvedValueOnce(['A', 'B'])
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'

    const searchPromise = gs.performSearch()
    await vi.runAllTimersAsync()
    await searchPromise

    expect(gs.ariaLiveMessage.value).toContain('header.search.suggestionsCount')
  })

  it('uses the singular key when exactly one suggestion is returned', async () => {
    getCardSuggestionsMock.mockResolvedValueOnce(['A'])
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'

    const searchPromise = gs.performSearch()
    await vi.runAllTimersAsync()
    await searchPromise

    expect(gs.ariaLiveMessage.value).toContain('header.search.suggestionsCountSingular')
  })
})

// ─── describe: erase-then-retype race (bug report 2026-08-07) ────────────────
//
// QA repro: type a card name, erase it fast, then type again — the dropdown ends
// up showing suggestions for the erased text. Cause: clearing cancelled the
// pending debounce but never invalidated the request already in flight, so its
// response still passed the `seq !== searchSeq` guard and repopulated state.

describe('erasing invalidates the in-flight request', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('a response in flight when the query is erased never repopulates suggestions', async () => {
    let resolveFirst!: (names: string[]) => void
    getCardSuggestionsMock.mockImplementationOnce(
      () => new Promise<string[]>((res) => { resolveFirst = res }),
    )

    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.handleInput()
    await vi.advanceTimersByTimeAsync(300) // request for "sol" is now in flight

    // Erase fast — below the 2-char threshold.
    gs.searchQuery.value = ''
    gs.handleInput()

    // "sol" finally answers.
    resolveFirst(['Sol Ring', 'Solemn Simulacrum'])
    await vi.runAllTimersAsync()

    expect(gs.suggestions.value).toEqual([])
  })

  it('the erased query cannot overwrite the results of what was typed next', async () => {
    let resolveFirst!: (names: string[]) => void
    getCardSuggestionsMock
      .mockImplementationOnce(() => new Promise<string[]>((res) => { resolveFirst = res }))
      .mockResolvedValueOnce(['Bolt of Keranos'])

    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.handleInput()
    await vi.advanceTimersByTimeAsync(300)

    gs.searchQuery.value = ''
    gs.handleInput()

    gs.searchQuery.value = 'bolt'
    gs.handleInput()
    await vi.advanceTimersByTimeAsync(300)
    expect(gs.suggestions.value).toEqual(['Bolt of Keranos'])

    // The stale "sol" response lands last — it must lose.
    resolveFirst(['Sol Ring'])
    await vi.runAllTimersAsync()

    expect(gs.suggestions.value).toEqual(['Bolt of Keranos'])
  })

  it('does not leave a "loading" dropdown hanging over an emptied input', async () => {
    getCardSuggestionsMock.mockImplementationOnce(() => new Promise<string[]>(() => { /* never resolves */ }))

    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.handleInput()
    await vi.advanceTimersByTimeAsync(300)
    expect(gs.loading.value).toBe(true)

    gs.searchQuery.value = ''
    gs.handleInput()

    expect(gs.loading.value).toBe(false)
    expect(gs.isExpanded.value).toBe(false)
  })

  it('clearSearch invalidates an in-flight request too', async () => {
    let resolveFirst!: (names: string[]) => void
    getCardSuggestionsMock.mockImplementationOnce(
      () => new Promise<string[]>((res) => { resolveFirst = res }),
    )

    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.handleInput()
    await vi.advanceTimersByTimeAsync(300)

    gs.clearSearch()
    resolveFirst(['Sol Ring'])
    await vi.runAllTimersAsync()

    expect(gs.suggestions.value).toEqual([])
    expect(gs.loading.value).toBe(false)
  })

  it('clearing cancels a debounce that has not fired yet', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.handleInput()

    gs.clearSearch()
    await vi.runAllTimersAsync()

    expect(getCardSuggestionsMock).not.toHaveBeenCalled()
  })
})
