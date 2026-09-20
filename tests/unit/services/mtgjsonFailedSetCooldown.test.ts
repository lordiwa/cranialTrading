/**
 * TASK-304 — regression lock for the actual root cause measured in
 * artifacts/TASK-304-AC1-evidencia.md: a set-mapping fetch that failed ONCE
 * used to be blocked from ever being retried for the rest of the session
 * (the old single `failedSets` Set had no expiry). That is what made the
 * SAME card show different CK/TCG/buylist values on /collection vs
 * /@usuario — whichever view's session happened to hit the transient
 * failure first was permanently frozen out of that set's prices, while the
 * other view (which never tried, or tried again later) kept them.
 *
 * These tests exercise the actual CALL SITE (getCardPrices) rather than an
 * internal helper in isolation — the project's own retrospective on its
 * costliest regression is that a helper with full coverage proved nothing
 * about whether its caller used it correctly.
 */

function installFakeDecompression() {
  class FakeDecompressionStream {
    readable: ReadableStream
    writable: WritableStream
    constructor() {
      const { readable, writable } = new TransformStream()
      this.readable = readable
      this.writable = writable
    }
  }
  vi.stubGlobal('DecompressionStream', FakeDecompressionStream)
}

function gzMockResponse(payload: unknown) {
  const jsonText = JSON.stringify(payload)
  const blob = new Blob([jsonText], { type: 'application/json' })
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    blob: () => Promise.resolve(blob),
  }
}

const failResponse = { ok: false, status: 500, headers: { get: () => null } }

describe('mtgjson.ts — failed-set cooldown vs. permanently-unknown sets (TASK-304)', () => {
  beforeEach(() => {
    vi.resetModules()
    installFakeDecompression()
    vi.stubGlobal('indexedDB', undefined)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('harm prevented: a card whose set-fetch failed transiently recovers its price once the cooldown elapses, instead of being frozen out for the rest of the session', async () => {
    const { getCardPrices } = await import('@/services/mtgjson')

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('SetList.json.gz')) {
        // No SetList available -> isKnownMtgjsonSet falls back to "unknown
        // treated as known" (legacy no-prefilter behavior), which is the
        // realistic case this bug actually manifested under.
        return Promise.resolve(failResponse)
      }
      if (url.includes('ZZZ.json.gz')) {
        return fetchMock.mock.calls.filter(c => (c[0] as string).includes('ZZZ.json.gz')).length === 1
          ? Promise.resolve(failResponse)
          : Promise.resolve(gzMockResponse({ data: { cards: [{ uuid: 'uuid-zzz', identifiers: { scryfallId: 'sf-1' } }] } }))
      }
      if (url.includes('AllPricesToday.json.gz')) {
        return Promise.resolve(gzMockResponse({
          data: { 'uuid-zzz': { paper: { cardkingdom: { retail: { normal: { '2026-09-20': 4.5 } } } } } },
        }))
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    // First read: the ZZZ set-mapping fetch fails transiently.
    const first = await getCardPrices('sf-1', 'ZZZ')
    expect(first).toBeNull()
    expect(fetchMock.mock.calls.filter(c => (c[0] as string).includes('ZZZ.json.gz'))).toHaveLength(1)

    // Advance past the 5-minute retry cooldown.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)

    // Second read, same card, same set: must retry (not stay frozen out) and
    // this time succeed, recovering the Card Kingdom price.
    const second = await getCardPrices('sf-1', 'ZZZ')
    expect(fetchMock.mock.calls.filter(c => (c[0] as string).includes('ZZZ.json.gz'))).toHaveLength(2)
    expect(second?.cardKingdom?.retail).toBe(4.5)
  })

  it('harm prevented: a set MTGJSON genuinely does not publish stays skipped forever, so the cooldown fix does not regenerate 404/CORS spam for a set that will never succeed', async () => {
    const { getCardPrices } = await import('@/services/mtgjson')

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('SetList.json.gz')) {
        // 'AAA' is the only set MTGJSON claims to publish — 'ZZZ' (used
        // below) is genuinely unknown.
        return Promise.resolve(gzMockResponse({ data: [{ code: 'AAA' }] }))
      }
      if (url.includes('ZZZ.json.gz')) {
        throw new Error('ZZZ.json.gz must never be requested once it is known-unknown')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await getCardPrices('sf-2', 'ZZZ')
    expect(first).toBeNull()
    expect(fetchMock.mock.calls.filter(c => (c[0] as string).includes('ZZZ.json.gz'))).toHaveLength(0)

    // Advance WAY past the transient-failure cooldown — an unknown set must
    // never become eligible again, unlike a transient failure.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    const second = await getCardPrices('sf-2', 'ZZZ')
    expect(second).toBeNull()
    expect(fetchMock.mock.calls.filter(c => (c[0] as string).includes('ZZZ.json.gz'))).toHaveLength(0)
  })
})
