import { clampPage, paginateResults, resultsRange, totalLoadedPages } from '@/utils/searchPagination'

describe('paginateResults', () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1) // [1..60]

  it('returns the first slice for page 1', () => {
    expect(paginateResults(items, 1, 25)).toEqual(items.slice(0, 25))
  })

  it('returns the second slice for page 2', () => {
    expect(paginateResults(items, 2, 25)).toEqual(items.slice(25, 50))
  })

  it('returns a partial final slice', () => {
    expect(paginateResults(items, 3, 25)).toEqual(items.slice(50, 60))
  })

  it('returns an empty array past the last page', () => {
    expect(paginateResults(items, 4, 25)).toEqual([])
  })

  it('clamps a page below 1 to page 1', () => {
    expect(paginateResults(items, 0, 25)).toEqual(items.slice(0, 25))
    expect(paginateResults(items, -3, 25)).toEqual(items.slice(0, 25))
  })

  it('returns all items unsliced when perPage is 0 or negative', () => {
    expect(paginateResults(items, 1, 0)).toEqual(items)
    expect(paginateResults(items, 1, -10)).toEqual(items)
  })
})

describe('totalLoadedPages', () => {
  it('computes the number of pages needed for the loaded count', () => {
    expect(totalLoadedPages(60, 25)).toBe(3)
    expect(totalLoadedPages(50, 25)).toBe(2)
    expect(totalLoadedPages(1, 25)).toBe(1)
  })

  it('returns 1 when loadedCount is 0 (nothing to paginate, but still 1 page)', () => {
    expect(totalLoadedPages(0, 25)).toBe(1)
  })

  it('returns 1 when perPage is 0 or negative', () => {
    expect(totalLoadedPages(60, 0)).toBe(1)
    expect(totalLoadedPages(60, -5)).toBe(1)
  })
})

describe('clampPage', () => {
  it('clamps to 1 when page is below 1', () => {
    expect(clampPage(0, 60, 25)).toBe(1)
    expect(clampPage(-2, 60, 25)).toBe(1)
  })

  it('clamps to the max loaded page when page exceeds it', () => {
    expect(clampPage(99, 60, 25)).toBe(3)
  })

  it('passes through a valid page unchanged', () => {
    expect(clampPage(2, 60, 25)).toBe(2)
  })
})

describe('resultsRange', () => {
  it('returns 0/0/total when nothing is loaded', () => {
    expect(resultsRange(1, 25, 0, 0)).toEqual({ from: 0, to: 0, total: 0 })
  })

  it('computes "1-25 of N" for the first page', () => {
    expect(resultsRange(1, 25, 60, 340)).toEqual({ from: 1, to: 25, total: 340 })
  })

  it('computes the range for a middle page', () => {
    expect(resultsRange(2, 25, 60, 340)).toEqual({ from: 26, to: 50, total: 340 })
  })

  it('caps "to" at loadedCount on a partial final page', () => {
    expect(resultsRange(3, 25, 60, 340)).toEqual({ from: 51, to: 60, total: 340 })
  })

  it('clamps an out-of-range page into the valid window', () => {
    expect(resultsRange(99, 25, 60, 340)).toEqual({ from: 51, to: 60, total: 340 })
  })
})
