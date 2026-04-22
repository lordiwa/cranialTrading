/**
 * TDD tests for useDiscoveryPanel composable.
 * State machine: idle | version | discovery.
 * Covers debounce, cancellation, paging, localStorage collapsed persistence.
 */
import { nextTick } from 'vue'
import type { ScryfallCard } from '@/services/scryfall'
import { useDiscoveryPanel } from '@/composables/useDiscoveryPanel'

function makePrint(id: string, name: string = 'Lightning Bolt'): ScryfallCard {
  return {
    id,
    name,
    set: 'mh3',
    set_name: 'Modern Horizons 3',
    image_uris: { small: 's.png' },
    prices: { usd: '0.50' },
    cmc: 1,
  } as unknown as ScryfallCard
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    searchCards: vi.fn().mockResolvedValue([makePrint('v1'), makePrint('v2')]),
    searchAdvanced: vi.fn().mockResolvedValue(Array.from({ length: 175 }, (_, i) => makePrint(`d${i}`))),
    debounceMs: 500,
    pageSize: 175,
    maxPages: 3,
    ...overrides,
  }
}

describe('useDiscoveryPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts in discovery mode with no results', () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      expect(panel.mode.value).toBe('discovery')
      expect(panel.results.value).toEqual([])
      expect(panel.loading.value).toBe(false)
      expect(panel.page.value).toBe(1)
      expect(panel.hasMore.value).toBe(false)
      expect(panel.versionCardName.value).toBeNull()
    })

    it('reads initial collapsed from localStorage (discovery mode key)', () => {
      localStorage.setItem('scrum34.discovery.collapsed.discovery', 'true')
      const panel = useDiscoveryPanel('decks', makeDeps())
      // Before any mode is opened, collapsed reads default (false)
      expect(panel.collapsed.value).toBe(false)
    })
  })

  describe('openVersionMode', () => {
    it('loads prints via searchCards with exact-name + no-preview query', async () => {
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openVersionMode('Lightning Bolt')

      expect(deps.searchCards).toHaveBeenCalledWith('!"Lightning Bolt" -is:preview')
      expect(panel.mode.value).toBe('version')
      expect(panel.versionCardName.value).toBe('Lightning Bolt')
      expect(panel.results.value).toHaveLength(2)
      expect(panel.loading.value).toBe(false)
    })

    it('resets hasMore to false in version mode (no paging)', async () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openVersionMode('Lightning Bolt')
      expect(panel.hasMore.value).toBe(false)
    })

    it('sets error message if searchCards throws', async () => {
      const deps = makeDeps({ searchCards: vi.fn().mockRejectedValue(new Error('boom')) })
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openVersionMode('Foo')
      expect(panel.error.value).not.toBeNull()
      expect(panel.loading.value).toBe(false)
    })
  })

  describe('openDiscoveryMode', () => {
    it('loads results via searchAdvanced with built query', async () => {
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openDiscoveryMode({ colors: ['W', 'U'], sets: ['mh3'] })

      expect(deps.searchAdvanced).toHaveBeenCalled()
      const [query] = deps.searchAdvanced.mock.calls[0]
      expect(query).toContain('id<=WU')
      expect(query).toContain('e:mh3')
      expect(panel.mode.value).toBe('discovery')
      expect(panel.results.value).toHaveLength(175)
    })

    it('marks hasMore=true when page size equals 175', async () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openDiscoveryMode({ colors: ['W'] })
      expect(panel.hasMore.value).toBe(true)
    })

    it('marks hasMore=false when results < page size', async () => {
      const deps = makeDeps({
        searchAdvanced: vi.fn().mockResolvedValue([makePrint('a'), makePrint('b')]),
      })
      const panel = useDiscoveryPanel('decks', deps)
      await panel.openDiscoveryMode({ colors: ['W'] })
      expect(panel.hasMore.value).toBe(false)
    })

    it('skips the fetch when filters produce empty query string but keeps discovery mode', async () => {
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openDiscoveryMode({})

      expect(deps.searchAdvanced).not.toHaveBeenCalled()
      expect(panel.mode.value).toBe('discovery')
      expect(panel.results.value).toEqual([])
    })
  })

  describe('loadMore', () => {
    it('increments page and appends results', async () => {
      const deps = makeDeps()
      deps.searchAdvanced = vi.fn()
        .mockResolvedValueOnce(Array.from({ length: 175 }, (_, i) => makePrint(`p1_${i}`)))
        .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => makePrint(`p2_${i}`)))
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openDiscoveryMode({ colors: ['W'] })
      await panel.loadMore()

      expect(panel.page.value).toBe(2)
      expect(panel.results.value).toHaveLength(225)
      expect(panel.hasMore.value).toBe(false) // 50 < 175
    })

    it('stops after maxPages', async () => {
      const deps = makeDeps({ maxPages: 2 })
      deps.searchAdvanced = vi.fn().mockResolvedValue(Array.from({ length: 175 }, (_, i) => makePrint(`p_${i}`)))
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openDiscoveryMode({ colors: ['W'] })
      await panel.loadMore() // page 2
      await panel.loadMore() // should be blocked (maxPages=2)

      expect(panel.page.value).toBe(2)
      expect(deps.searchAdvanced).toHaveBeenCalledTimes(2)
      expect(panel.hasMore.value).toBe(false)
    })

    it('does not call API when not in discovery mode', async () => {
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)
      await panel.loadMore()
      expect(deps.searchAdvanced).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('resets to idle with no results', async () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openVersionMode('Bolt')
      panel.close()
      expect(panel.mode.value).toBe('idle')
      expect(panel.results.value).toEqual([])
      expect(panel.versionCardName.value).toBeNull()
      expect(panel.page.value).toBe(1)
      expect(panel.error.value).toBeNull()
    })
  })

  describe('toggleCollapsed + persistence', () => {
    it('toggles collapsed state', async () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openVersionMode('Bolt')
      expect(panel.collapsed.value).toBe(false)
      panel.toggleCollapsed()
      expect(panel.collapsed.value).toBe(true)
      panel.toggleCollapsed()
      expect(panel.collapsed.value).toBe(false)
    })

    it('persists collapsed to mode-specific key', async () => {
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openVersionMode('Bolt')
      panel.toggleCollapsed()
      expect(localStorage.getItem('scrum34.discovery.collapsed.versions')).toBe('true')

      await panel.openDiscoveryMode({ colors: ['W'] })
      panel.toggleCollapsed()
      expect(localStorage.getItem('scrum34.discovery.collapsed.discovery')).toBe('true')
    })

    it('restores collapsed from localStorage when switching modes', async () => {
      localStorage.setItem('scrum34.discovery.collapsed.versions', 'true')
      const panel = useDiscoveryPanel('decks', makeDeps())
      await panel.openVersionMode('Bolt')
      expect(panel.collapsed.value).toBe(true)
    })
  })

  describe('onFiltersChanged (debounce + threshold)', () => {
    it('does NOT trigger discovery when localMatchCount >= threshold', async () => {
      vi.useFakeTimers()
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      panel.onFiltersChanged({ colors: ['W'] }, 20, 12)
      await vi.runAllTimersAsync()

      expect(deps.searchAdvanced).not.toHaveBeenCalled()
      expect(panel.mode.value).toBe('discovery')
    })

    it('triggers discovery after debounce when localMatchCount < threshold', async () => {
      vi.useFakeTimers()
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      panel.onFiltersChanged({ colors: ['W'] }, 5, 12)

      // Before debounce elapses, no call
      expect(deps.searchAdvanced).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(500)
      await nextTick()

      expect(deps.searchAdvanced).toHaveBeenCalledTimes(1)
    })

    it('cancels prior debounced call when a new one fires', async () => {
      vi.useFakeTimers()
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      panel.onFiltersChanged({ colors: ['W'] }, 5, 12)
      await vi.advanceTimersByTimeAsync(200)
      panel.onFiltersChanged({ colors: ['U'] }, 5, 12)
      await vi.advanceTimersByTimeAsync(500)
      await nextTick()

      expect(deps.searchAdvanced).toHaveBeenCalledTimes(1)
      const [query] = deps.searchAdvanced.mock.calls[0]
      expect(query).toContain('id<=U')
    })

    it('does not re-trigger if panel is in version mode', async () => {
      vi.useFakeTimers()
      const deps = makeDeps()
      const panel = useDiscoveryPanel('decks', deps)

      await panel.openVersionMode('Bolt')
      vi.clearAllMocks()

      panel.onFiltersChanged({ colors: ['W'] }, 5, 12)
      await vi.advanceTimersByTimeAsync(500)
      await nextTick()

      expect(deps.searchAdvanced).not.toHaveBeenCalled()
    })
  })

  describe('independence of instances', () => {
    it('two instances maintain separate state', async () => {
      const depsA = makeDeps()
      const depsB = makeDeps()
      const panelA = useDiscoveryPanel('decks', depsA)
      const panelB = useDiscoveryPanel('binders', depsB)

      await panelA.openVersionMode('Bolt')
      expect(panelA.mode.value).toBe('version')
      expect(panelB.mode.value).toBe('discovery')
    })
  })
})
