/**
 * TASK-241 (proxy re-scope: Rafael's argument is REQUEST COUNT to Scryfall,
 * not bytes — AC1 already fixed bytes). functions/lib/cardImage.js is a
 * plain CommonJS module with zero firebase-admin dependency, same pattern
 * as concurrency.js (TASK-232) — extracted so it can be require()'d and
 * EXECUTED here without a Storage/Functions emulator harness (TASK-236 gap,
 * still open). This proves the URL parsing, Storage-path mapping, and
 * throttle behave as claimed at runtime; it does NOT prove exports.cardImage
 * in functions/index.js wires them together correctly end-to-end (no
 * execution harness for that — see TASK-241 hand-off for the emulator
 * measurement that covers AC3/AC9 instead).
 */
import {
  parseImagePath,
  storagePath,
  scryfallUrl,
  createThrottle,
} from '../../../functions/lib/cardImage.js'

describe('cardImage.parseImagePath (TASK-241 AC2)', () => {
  it('parses a well-formed proxy path', () => {
    const result = parseImagePath('/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')
    expect(result).toEqual({
      variant: 'thumb',
      face: 'front',
      scryfallId: 'a268697b-22b0-4e1b-a5b6-d9be95025e57',
    })
  })

  it('parses the back face and the grid variant', () => {
    const result = parseImagePath('/img/grid/back/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')
    expect(result).toEqual({
      variant: 'grid',
      face: 'back',
      scryfallId: 'a268697b-22b0-4e1b-a5b6-d9be95025e57',
    })
  })

  it('rejects a variant outside the allow-list (e.g. png — never fetched, never stored)', () => {
    expect(parseImagePath('/img/png/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')).toBeNull()
  })

  it('rejects a malformed scryfallId (not a UUID) — never used to build a Storage path or outbound URL', () => {
    expect(parseImagePath('/img/thumb/front/not-a-uuid.webp')).toBeNull()
  })

  it('rejects path traversal in the id segment', () => {
    expect(parseImagePath('/img/thumb/front/../../etc/passwd.webp')).toBeNull()
  })

  it('rejects a missing extension', () => {
    expect(parseImagePath('/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57')).toBeNull()
  })

  it('returns null for an empty/undefined path', () => {
    expect(parseImagePath('')).toBeNull()
    expect(parseImagePath(undefined as unknown as string)).toBeNull()
  })
})

describe('cardImage.storagePath / scryfallUrl (TASK-241 AC2/AC3)', () => {
  const parsed = { variant: 'thumb', face: 'front', scryfallId: 'a268697b-22b0-4e1b-a5b6-d9be95025e57' }

  it('builds a stable Storage object path, one per (variant, face, id)', () => {
    expect(storagePath(parsed)).toBe('card-images/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')
  })

  it('builds the exact Scryfall CDN URL the fill path fetches / AC7 falls back to', () => {
    expect(scryfallUrl(parsed)).toBe(
      'https://cards.scryfall.io/thumb/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })
})

describe('cardImage.createThrottle (TASK-241 AC6)', () => {
  it('does not delay the first call', async () => {
    let t = 1_000
    const sleeps: number[] = []
    const wait = createThrottle(100, () => t, async (ms) => { sleeps.push(ms); t += ms })
    await wait()
    expect(sleeps).toEqual([])
  })

  it('delays a second call that arrives inside the interval by exactly the remainder', async () => {
    let t = 1_000
    const sleeps: number[] = []
    const wait = createThrottle(100, () => t, async (ms) => { sleeps.push(ms); t += ms })
    await wait() // t=1000, lastAt=1100
    t = 1_050 // only 50ms of real time passed
    await wait()
    expect(sleeps).toEqual([50]) // must wait the remaining 50ms to reach the 100ms floor
  })

  it('does not delay a call that already arrives after the interval has elapsed', async () => {
    let t = 1_000
    const sleeps: number[] = []
    const wait = createThrottle(100, () => t, async (ms) => { sleeps.push(ms); t += ms })
    await wait() // lastAt=1100
    t = 1_500 // well past the 100ms floor
    await wait()
    expect(sleeps).toEqual([])
  })
})
