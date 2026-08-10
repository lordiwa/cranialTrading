import { chunkIntoRows, documentOffsetTop, shouldLoadMore, shouldRemeasureOnFirstLoad, shouldResetScroll } from '@/composables/useVirtualGrid'
import { makeCard } from '../helpers/fixtures'

describe('shouldResetScroll', () => {
  // Regression: the scroll-reset watcher used to fire on ANY items.length change,
  // including infinite-scroll appends, which yanked the window to the top of the
  // document mid-scroll in both /collection and the public profile grid.
  it('does NOT reset when the list grew (infinite-scroll page append)', () => {
    expect(shouldResetScroll(100, 50)).toBe(false)
  })

  it('does NOT reset when a second page lands on an already-long list', () => {
    expect(shouldResetScroll(600, 550)).toBe(false)
  })

  it('resets when the list shrank (filter narrowed the results)', () => {
    expect(shouldResetScroll(12, 500)).toBe(true)
  })

  it('resets when the list was emptied', () => {
    expect(shouldResetScroll(0, 500)).toBe(true)
  })

  it('does not reset when the length is unchanged', () => {
    expect(shouldResetScroll(50, 50)).toBe(false)
  })

  it('does not reset on the very first observation (prev undefined)', () => {
    // Vue fires the watcher with prev === undefined only if it runs immediately;
    // treating that as a reset would fight a restored scroll position.
    expect(shouldResetScroll(50, undefined)).toBe(false)
  })

  it('resets when growing from an empty list is actually a replacement', () => {
    // 0 -> N is a genuine new result set, not an append: there is no prefix to keep.
    expect(shouldResetScroll(50, 0)).toBe(true)
  })
})

describe('shouldRemeasureOnFirstLoad', () => {
  // TASK-175: the 0 -> N transition (loading skeleton -> real grid) is when
  // content above the grid reflows the most, staling the cached scrollMargin
  // and pushing row 0 up into the section title. This locks exactly when the
  // forced re-measure fires.
  it('fires on the very first observation (prev undefined) if items already exist', () => {
    expect(shouldRemeasureOnFirstLoad(50, undefined)).toBe(true)
  })

  it('fires when growing from an empty list (skeleton -> real grid)', () => {
    expect(shouldRemeasureOnFirstLoad(50, 0)).toBe(true)
  })

  it('does not fire on the very first observation with no items yet', () => {
    expect(shouldRemeasureOnFirstLoad(0, undefined)).toBe(false)
  })

  it('does not fire on an infinite-scroll page append (already had items)', () => {
    expect(shouldRemeasureOnFirstLoad(100, 50)).toBe(false)
  })

  it('does not fire when the list shrank (filter narrowed results)', () => {
    expect(shouldRemeasureOnFirstLoad(12, 500)).toBe(false)
  })

  it('does not fire when the list was emptied', () => {
    expect(shouldRemeasureOnFirstLoad(0, 500)).toBe(false)
  })

  it('does not fire when the length is unchanged', () => {
    expect(shouldRemeasureOnFirstLoad(50, 50)).toBe(false)
  })
})

describe('documentOffsetTop', () => {
  // Regression: scrollMargin used offsetTop, which is relative to the nearest
  // positioned ancestor (CollectionView wraps the grid in a `relative` div), not
  // the document. The window virtualizer compares against window.scrollY, so the
  // whole hero+filters height was missing from every row offset.
  it('adds the current scroll offset to the viewport-relative top', () => {
    expect(documentOffsetTop({ top: 120 } as DOMRect, 800)).toBe(920)
  })

  it('returns the raw rect top when the page is not scrolled', () => {
    expect(documentOffsetTop({ top: 640 } as DOMRect, 0)).toBe(640)
  })

  it('never returns a negative margin when the grid is scrolled past', () => {
    expect(documentOffsetTop({ top: -500 } as DOMRect, 200)).toBe(0)
  })
})

describe('shouldLoadMore', () => {
  const THRESHOLD = 1000

  it('returns false when scroll is far from bottom', () => {
    // scrollOffset=0, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (0 + 800) = 4200, which is > 1000
    expect(shouldLoadMore(0, 5000, 800, THRESHOLD)).toBe(false)
  })

  it('returns true when scroll position is within threshold of bottom', () => {
    // scrollOffset=3500, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (3500 + 800) = 700, which is <= 1000
    expect(shouldLoadMore(3500, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns true when exactly at the threshold boundary', () => {
    // scrollOffset=3200, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (3200 + 800) = 1000, which is <= 1000
    expect(shouldLoadMore(3200, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns true when scrolled past the bottom', () => {
    // scrollOffset=5000, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (5000 + 800) = -800, which is <= 1000
    expect(shouldLoadMore(5000, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns false when totalSize is 0 (no content)', () => {
    expect(shouldLoadMore(0, 0, 800, THRESHOLD)).toBe(false)
  })

  it('returns false when scrollOffset is null', () => {
    expect(shouldLoadMore(null, 5000, 800, THRESHOLD)).toBe(false)
  })

  it('returns false when viewportHeight is 0', () => {
    expect(shouldLoadMore(0, 5000, 0, THRESHOLD)).toBe(false)
  })

  it('returns true when content is shorter than viewport + threshold', () => {
    // totalSize=500, viewportHeight=800 — content fits in viewport
    // remaining = 500 - (0 + 800) = -300, which is <= 1000
    // But totalSize > 0 and viewportHeight > 0
    expect(shouldLoadMore(0, 500, 800, THRESHOLD)).toBe(true)
  })
})

describe('chunkIntoRows', () => {
  it('returns empty array for empty cards', () => {
    expect(chunkIntoRows([], 3)).toEqual([])
  })

  it('chunks cards into rows of given column count', () => {
    const cards = [
      makeCard({ id: 'a' }),
      makeCard({ id: 'b' }),
      makeCard({ id: 'c' }),
      makeCard({ id: 'd' }),
      makeCard({ id: 'e' }),
    ]
    const rows = chunkIntoRows(cards, 2)
    expect(rows).toHaveLength(3)
    expect(rows[0].map(c => c.id)).toEqual(['a', 'b'])
    expect(rows[1].map(c => c.id)).toEqual(['c', 'd'])
    expect(rows[2].map(c => c.id)).toEqual(['e'])
  })

  it('handles exact multiple of column count', () => {
    const cards = Array.from({ length: 6 }, (_, i) => makeCard({ id: `card-${i}` }))
    const rows = chunkIntoRows(cards, 3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(3)
    expect(rows[1]).toHaveLength(3)
  })

  it('handles single card', () => {
    const cards = [makeCard({ id: 'solo' })]
    const rows = chunkIntoRows(cards, 5)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(1)
  })

  it('handles column count of 1', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })]
    const rows = chunkIntoRows(cards, 1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(1)
    expect(rows[1]).toHaveLength(1)
  })
})
