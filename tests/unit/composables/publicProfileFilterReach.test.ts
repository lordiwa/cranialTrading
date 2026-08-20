/**
 * TASK-247 tanda 4 — AC7 REGRESSION LOCK.
 *
 * The property: filtering a PUBLIC PROFILE by an attribute must reach the
 * seller's WHOLE public collection, not just the page(s) already scrolled into
 * memory. This is the lock the ticket exists for — the bug lived a month
 * because nothing asserted it.
 *
 * MEASURED RED, 2026-08-19, before any implementation landed. The second
 * describe below is the OLD pipeline (`useCardFilter` over the loaded page,
 * exactly as UserProfileView composed it). With the whole-collection
 * assertion pointed at it, vitest reported:
 *
 *     AssertionError: expected [ …(11) ] to have a length of 40 but got 11
 *     - Expected  40
 *     + Received  11
 *     tests/unit/composables/publicProfileFilterReach.test.ts:64:33
 *
 *     AssertionError: expected [ 'card-000', 'card-001', …(9) ] to include
 *     'card-005'
 *
 * 11 of 40, two ways at once: the filter could only see the 12 black cards on
 * the loaded page (28 more were past it), and of those 12 it dropped the B/G
 * gold card into a 'Multicolor' bucket. Both defects are pinned below as
 * characterization, and the fixed path is locked in the first describe.
 *
 * The fixture is synthetic on purpose. Rafael's real account is alive and
 * growing (measured 2026-08-19: 1,488 black documents including lands), so a
 * test pinned to a production number reddens on its own and teaches the team
 * to ignore it. Here the test owns every number.
 */
import { nextTick, ref } from 'vue'

vi.mock('@/services/publicCards', () => ({
  queryUserPublicCardIndex: vi.fn(),
  getUserPublicCardStatusCounts: vi.fn(),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// eslint-disable-next-line import/first
import { getUserPublicCardStatusCounts, type PublicCardIndexPage, queryUserPublicCardIndex } from '@/services/publicCards'
// eslint-disable-next-line import/first
import { usePublicProfileIndex } from '@/composables/usePublicProfileIndex'
// eslint-disable-next-line import/first
import { useCardFilter } from '@/composables/useCardFilter'
// eslint-disable-next-line import/first
import type { Card } from '@/types/card'

const PAGE_SIZE = 60
const TOTAL_DOCS = 130
/** Indices of the black documents: 12 inside page 1, 28 past it. 40 in total. */
const BLACK_INDICES = [...Array(12).keys(), ...Array.from({ length: 28 }, (_, i) => 60 + i)]
const BLACK_TOTAL = BLACK_INDICES.length
const BLACK_ON_FIRST_PAGE = BLACK_INDICES.filter(i => i < PAGE_SIZE).length

function makeCard(i: number): Card {
  const black = BLACK_INDICES.includes(i)
  const id = String(i).padStart(3, '0')
  const base = {
    id: `card-${id}`,
    scryfallId: `scry-${id}`,
    name: `Card ${id}`,
    edition: 'Test Set',
    setCode: 'tst',
    quantity: 1,
    condition: 'NM' as const,
    foil: false,
    price: 1,
    image: `/img/thumb/front/scry-${id}.webp`,
    status: 'sale' as const,
    rarity: 'common',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }
  // i=5 is a B/G gold card: OR-inclusive it IS black; useCardFilter buckets it
  // as 'Multicolor' and drops it from the Black chip.
  if (i === 5) return { ...base, colors: ['B', 'G'], type_line: 'Creature — Elf Shaman' } as Card
  // i=7 is a Swamp: lands print no colors, they count by produced_mana.
  if (i === 7) return { ...base, colors: [], produced_mana: ['B'], type_line: 'Basic Land — Swamp' } as Card
  return { ...base, colors: black ? ['B'] : ['W'], type_line: 'Creature — Human' } as Card
}

const ALL_CARDS = Array.from({ length: TOTAL_DOCS }, (_, i) => makeCard(i))
const FIRST_PAGE = ALL_CARDS.slice(0, PAGE_SIZE)

/**
 * A fake index server. It holds the WHOLE synthetic collection and answers
 * exactly as the real Cloud Function does: filter over everything, count over
 * everything, deliver one page. If the composable ever filters client-side
 * again, `total` stops matching and this file reddens.
 */
function fakeIndex(page: { filters?: { color?: string[] }; page?: number; pageSize?: number } = {}): PublicCardIndexPage {
  const letters = new Set(page.filters?.color ?? [])
  const matching = letters.size === 0
    ? ALL_CARDS
    : ALL_CARDS.filter(card => {
      const produced = card.produced_mana ?? []
      const source = produced.length > 0 ? produced : (card.colors ?? [])
      if (source.length === 0) return letters.has('C')
      return source.some(c => letters.has(c))
    })
  const size = page.pageSize ?? PAGE_SIZE
  const start = (page.page ?? 0) * size
  return {
    cards: matching.slice(start, start + size),
    total: matching.length,
    page: page.page ?? 0,
    pageSize: size,
    hasMore: start + size < matching.length,
    facets: { color: {}, status: {}, rarity: {}, type: {} },
    indexState: { schemaVersion: 1, totalChunks: 1, count: TOTAL_DOCS, reconciling: false, partial: false, missing: 0 },
  }
}

async function flush(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.mocked(getUserPublicCardStatusCounts).mockResolvedValue({ sale: 0, trade: 0 })
  vi.mocked(queryUserPublicCardIndex).mockImplementation((_uid, opts) => Promise.resolve(fakeIndex(opts)))
})

describe('AC7 — a colour filter on a public profile reaches the whole collection', () => {
  it('reports every black document in the collection, not only the loaded page', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()
    expect(profile.cards.value).toHaveLength(PAGE_SIZE)

    profile.selectedColors.value = new Set(['B'])
    await flush()

    expect(profile.total.value).toBe(BLACK_TOTAL)
    expect(profile.total.value).toBeGreaterThan(BLACK_ON_FIRST_PAGE)
  })

  it('counts a B/G gold card under Black (OR-inclusive, Rafael 2026-08-19)', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    profile.selectedColors.value = new Set(['B'])
    await flush()

    expect(profile.cards.value.map(c => c.id)).toContain('card-005')
  })

  it('counts a Swamp under Black — a land is the colour it PRODUCES', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'))
    await profile.loadFirstPage()

    profile.selectedColors.value = new Set(['B'])
    await flush()

    expect(profile.cards.value.map(c => c.id)).toContain('card-007')
  })

  it('pages through the filtered result without ever narrowing the total', async () => {
    const profile = usePublicProfileIndex(ref<string | null>('seller-1'), { pageSize: 25 })
    await profile.loadFirstPage()
    profile.selectedColors.value = new Set(['B'])
    await flush()

    expect(profile.cards.value).toHaveLength(25)
    await profile.loadMore()

    // 40 black documents at 25 per page: page 2 delivers the remaining 15.
    expect(profile.cards.value).toHaveLength(BLACK_TOTAL)
    expect(profile.total.value).toBe(BLACK_TOTAL)
  })
})

describe('the defect this replaced: filtering the loaded page reaches only the page', () => {
  // Characterization, kept so the number in the header above stays checkable.
  // This is `useCardFilter` doing exactly what it is supposed to do for the
  // OWNER's own collection (where every card is loaded) — the bug was using it
  // on a server-paginated profile, not the composable itself.
  it('sees 11 of 40 black documents when handed one page', () => {
    const cards = ref<Card[]>(FIRST_PAGE)
    const { selectedColors, filteredCards } = useCardFilter(cards)

    selectedColors.value = new Set(['Black'])

    expect(filteredCards.value).toHaveLength(11)
    expect(filteredCards.value.map(c => c.id)).not.toContain('card-005')
  })

  it('sanity: the fixture really does hide most black cards past page 1', () => {
    expect(BLACK_ON_FIRST_PAGE).toBe(12)
    expect(BLACK_TOTAL).toBe(40)
  })
})
