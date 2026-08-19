/**
 * TASK-247 tanda 3/5 — the PUBLIC QUERY LAYER.
 *
 * This is the tanda that actually makes the public profile's filter and
 * search tell the truth. Everything before it built the index; nothing read
 * it. The regression being closed is measured, not theoretical: the public
 * profile filters and searches over the ~60 documents that happen to already
 * be paginated into memory, so Rafael's profile reports 36 black cards where
 * 1,412 public_cards documents are black.
 *
 * Same dependency-free CommonJS technique as publicCardEntry /
 * publicCardIndex / publicCardIndexReconciler: the query module takes `db` as
 * a plain injected argument, so a hand-rolled fake Firestore exercises the
 * real read orchestration (chunk range, `_meta` filtering, mid-rebuild
 * detection) without firebase-admin and without an emulator (TASK-236).
 *
 * THE NATURAL LOCKS. The AC numbers are the assertions — a synthetic index is
 * built to reproduce them exactly, so an implementation that "passes" by
 * counting something else (unique scryfallId = 1,049; copies summed by
 * quantity = 2,658) fails visibly instead of looking right:
 *   AC2  black = 1,412 DOCUMENTS, with the four measured negative controls
 *        (green 1,161 / red 1,619 / white 1,457 / blue 1,354). OR-inclusive
 *        by letter — Rafael's decision, not relitigable: a B/G card counts
 *        under BOTH black and green, and there is no separate 'Multicolor'
 *        bucket. The five controls sum to 7,003 over 6,647 documents, and
 *        that overshoot is the semantics working, not a bug.
 *   AC3  'blight' = 14 DOCUMENTS across 7 unique names. Includes the split
 *        card 'Blightreaper Thallid // Blightsower Thallid': the `//` is
 *        never tokenized away, and `.includes` returns a boolean, so a name
 *        containing the term twice still counts ONCE.
 *   AC5  no 50-result cap. `total` is over the whole collection; only the
 *        DELIVERY is paginated.
 *   AC6  the function never touches users/{uid}/cards or
 *        users/{uid}/card_index — grepped from the real source text below,
 *        because that is the only assertion an implementation cannot
 *        accidentally satisfy.
 *   AC9  `x`/`cu`-flagged entries are excluded from a colour-filtered result
 *        and kept in everything else — the decision already written into
 *        publicCardEntry.js's header, honored here rather than reinvented.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertValidPublicUserId,
  filterPublicIndexEntries,
  sortPublicIndexEntries,
  toPublicIndexCard,
  queryPublicCardIndexForUser,
  PUBLIC_INDEX_CARD_FIELDS,
} from '../../../functions/lib/publicCardIndexQuery.js'
import { buildPublicIndex } from '../../../functions/lib/publicCardIndex.js'

// ── The synthetic profile: 6,647 documents, reproducing every AC number ──
//
// Composition, chosen so the five colour totals and the document total are
// simultaneously exact (see the header for why the totals overshoot):
//   562 mono-B, 311 mono-G, 1457 mono-W, 1354 mono-U, 1619 mono-R,
//   850 dual B/G, 20 genuinely colourless (co: [] and NO flags — these must
//   stay reachable by a 'C' chip), 474 with no usable colour source at all
//   (`cu`, the measured 7.1% gap), of which 17 also have no scryfall_cache
//   document at all (`x`, also measured).
//     562 + 311 + 1457 + 1354 + 1619 + 850 + 20 + 474 = 6647
//     B = 562 + 850 = 1412     G = 311 + 850 = 1161
//     W = 1457     U = 1354     R = 1619
const BLIGHT_NAMES = [
  'Marauding Blight-Priest',
  'Blighted Blackthorn',
  'Blight Rot',
  'Hooded Blightfang',
  'Blightreaper Thallid // Blightsower Thallid',
  'Lithoform Blight',
  'Blight Pile',
]

/** 36-char UUID-shaped ids, like the 5,162 measured in production. */
function syntheticScryfallId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

interface SyntheticEntry {
  s: string
  i: string
  n: string
  nl: string
  q: number
  p: number
  st: 'sale' | 'trade'
  f: boolean
  cn: string
  sc: string
  ed: string
  t: string
  cm: number
  co: string[]
  pm: string[]
  r: string
  kw: string[]
  lg: string[]
  ca: number
  pw: string
  to: string
  fa: boolean
  x?: number
  cu?: number
}

function makeEntry(n: number, colors: string[], overrides: Partial<SyntheticEntry> = {}): SyntheticEntry {
  // Default names deliberately contain no 'blight' substring anywhere — the
  // 14 blight documents are injected explicitly, so an accidental collision
  // can never inflate the AC3 count.
  const name = overrides.n ?? `Synthetic Card ${n}`
  return {
    s: syntheticScryfallId(n),
    i: `card-${n}`,
    n: name,
    nl: name.toLowerCase(),
    q: 1,
    p: 1,
    st: n % 3 === 0 ? 'trade' : 'sale',
    f: false,
    cn: 'NM',
    sc: 'M21',
    ed: 'Core Set 2021',
    t: 'Creature — Human',
    cm: 2,
    co: colors,
    pm: [],
    r: 'c',
    kw: [],
    lg: ['modern'],
    ca: 1704067200000 + n,
    pw: '2',
    to: '2',
    fa: false,
    ...overrides,
  }
}

function buildSyntheticProfile(): SyntheticEntry[] {
  const entries: SyntheticEntry[] = []
  let n = 0
  const push = (colors: string[], count: number, overrides: Partial<SyntheticEntry> = {}) => {
    for (let k = 0; k < count; k++) entries.push(makeEntry(n++, colors, overrides))
  }

  // 562 mono-black, of which the first 14 carry the AC3 'blight' names
  // (2 documents per unique name — 14 documents, 7 unique names).
  for (let k = 0; k < 14; k++) {
    const name = BLIGHT_NAMES[k % BLIGHT_NAMES.length] as string
    // Two documents per unique name SHARING one scryfallId — the real shape
    // of a collection (same card, two conditions or a foil and a non-foil),
    // and the reason AC2's three numbers differ: 1,412 documents, 1,049
    // unique scryfallId, 2,658 copies. `q: 2` likewise makes sum(quantity)
    // differ from the document count, so an implementation that counted
    // either of the other two numbers cannot pass by coincidence.
    entries.push(
      makeEntry(n++, ['B'], {
        n: name,
        nl: name.toLowerCase(),
        s: syntheticScryfallId(900000 + (k % BLIGHT_NAMES.length)),
        q: 2,
      })
    )
  }
  push(['B'], 562 - 14)
  push(['G'], 311)
  push(['W'], 1457)
  push(['U'], 1354)
  push(['R'], 1619)
  push(['B', 'G'], 850)
  // Genuinely colourless: `co: []` and NO flag. publicCardEntry.js's header
  // is explicit that these must stay reachable — the private index's
  // `if (c.co.length === 0) return false` (functions/index.js:1688) would
  // make every one of them invisible.
  push([], 20)
  // The measured AC9 gap: no usable colour source. 17 of them also have no
  // scryfall_cache document at all.
  push([], 17, { cu: 1, x: 1 })
  push([], 474 - 17, { cu: 1 })

  return entries
}

const PROFILE = buildSyntheticProfile()

interface FakeState {
  chunkDocs: Record<string, unknown>
  metaDoc: Record<string, unknown> | null
  onMetaRead?: (readNumber: number) => void
}

/** Minimal fake Firestore: only the surface the query layer is allowed to use. */
function makeFakeDb(chunkDocs: Record<string, unknown>, metaDoc: Record<string, unknown> | null) {
  const reads: string[] = []
  const live: FakeState = { chunkDocs, metaDoc }
  let metaReads = 0
  const readMeta = () => {
    metaReads++
    live.onMetaRead?.(metaReads)
    return live.metaDoc
  }
  return {
    reads,
    live,
    get metaReads() {
      return metaReads
    },
    collection(path: string) {
      reads.push(path)
      return {
        doc(id: string) {
          return {
            async get() {
              if (id === '_meta') {
                const data = readMeta()
                return { id: '_meta', exists: data !== null, data: () => data }
              }
              return { id, exists: false, data: () => undefined }
            },
          }
        },
        async get() {
          const docs: Array<{ id: string; data: () => unknown }> = Object.entries(live.chunkDocs).map(
            ([id, data]) => ({ id, data: () => data })
          )
          const meta = readMeta()
          if (meta !== null) docs.push({ id: '_meta', data: () => meta })
          return { empty: docs.length === 0, docs, size: docs.length }
        },
      }
    },
  }
}

type FakeDb = ReturnType<typeof makeFakeDb>

/** Lay the synthetic profile out as real chunk documents. */
function makeIndexedDb(
  entries: SyntheticEntry[] = PROFILE,
  opts: { tcOverride?: Record<number, number> } = {}
): FakeDb {
  const docs = entries.map((e) => ({ cardId: e.i, scryfallId: e.s, cardName: e.n }))
  // buildPublicIndex owns the chunk-count sizing rule; reuse it rather than
  // hardcoding 32 here, so a change to DEFAULT_CHUNK_TARGET_SIZE shows up as
  // a real disagreement instead of a silently stale fixture.
  const { meta } = buildPublicIndex(docs, {}, {})
  const chunkDocs: Record<string, unknown> = {}
  for (let id = 0; id < meta.totalChunks; id++) {
    chunkDocs[String(id)] = { id, entries: [], tc: opts.tcOverride?.[id] ?? meta.totalChunks }
  }
  entries.forEach((e, idx) => {
    const chunkId = idx % meta.totalChunks
    ;(chunkDocs[String(chunkId)] as { entries: unknown[] }).entries.push(e)
  })
  return makeFakeDb(chunkDocs, {
    schemaVersion: 1,
    totalChunks: meta.totalChunks,
    count: entries.length,
    chunkTargetSize: 400,
  })
}

// ── AC6: the privacy boundary, asserted against the real source text ──

describe('AC6 — the public query layer never reaches a private collection', () => {
  const querySource = readFileSync(
    resolve(__dirname, '../../../functions/lib/publicCardIndexQuery.js'),
    'utf8'
  )
  const indexSource = readFileSync(resolve(__dirname, '../../../functions/index.js'), 'utf8')

  /** Strip comments so a doc comment MENTIONING the forbidden path isn't a false positive. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // `public_card_index` legitimately CONTAINS the substring `card_index`, so
  // the lookbehind is load-bearing: without it this test can only ever fail.
  const PRIVATE_INDEX = /(?<!public_)card_index/
  const PRIVATE_CARDS = /\/cards\b/

  it('publicCardIndexQuery.js contains no reference to users/{uid}/cards', () => {
    expect(stripComments(querySource)).not.toMatch(PRIVATE_CARDS)
  })

  it('publicCardIndexQuery.js contains no reference to the private card_index', () => {
    expect(stripComments(querySource)).not.toMatch(PRIVATE_INDEX)
  })

  it('the queryPublicCardIndex callable body touches no private collection', () => {
    const start = indexSource.indexOf('exports.queryPublicCardIndex')
    expect(start).toBeGreaterThan(-1)
    const rest = indexSource.slice(start)
    const end = rest.indexOf('\n);')
    const body = stripComments(rest.slice(0, end === -1 ? rest.length : end))
    expect(body).not.toMatch(PRIVATE_INDEX)
    expect(body).not.toMatch(PRIVATE_CARDS)
  })

  it('only ever reads the public_card_index collection of the requested user', async () => {
    const db = makeIndexedDb()
    await queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 0, pageSize: 60 })
    expect(db.reads.length).toBeGreaterThan(0)
    for (const path of db.reads) {
      expect(path).toBe('users/seller1/public_card_index')
    }
  })
})

// ── Path injection: the userId is client-supplied and unauthenticated ──

describe('assertValidPublicUserId — the path is built by string interpolation', () => {
  it('accepts a normal Firebase uid', () => {
    expect(() => assertValidPublicUserId('AbC123_-xyz')).not.toThrow()
  })

  it.each([
    ['a slash escapes the collection', 'x/public_card_index/../../other'],
    ['a bare slash', 'a/b'],
    ['a parent traversal', '..'],
    ['a dot segment', '.'],
    ['empty', ''],
    ['whitespace', ' '],
    ['a wildcard', '*'],
  ])('rejects %s', (_label, bad) => {
    expect(() => assertValidPublicUserId(bad)).toThrow()
  })

  it('rejects non-string values', () => {
    for (const bad of [null, undefined, 42, {}, ['a']]) {
      expect(() => assertValidPublicUserId(bad as unknown as string)).toThrow()
    }
  })

  it('rejects a userId longer than 128 characters', () => {
    expect(() => assertValidPublicUserId('a'.repeat(129))).toThrow()
    expect(() => assertValidPublicUserId('a'.repeat(128))).not.toThrow()
  })

  it('queryPublicCardIndexForUser refuses an injected path before any read', async () => {
    const db = makeIndexedDb()
    await expect(
      queryPublicCardIndexForUser({ db, userId: 'a/b', filters: {}, page: 0, pageSize: 60 })
    ).rejects.toThrow()
    expect(db.reads).toEqual([])
  })
})

// ── AC2: the colour filter, OR-inclusive by letter ──

describe('AC2 — colour filter counts DOCUMENTS, OR-inclusive by letter', () => {
  it('the synthetic profile really is 6,647 documents', () => {
    expect(PROFILE).toHaveLength(6647)
  })

  it.each([
    ['B', 1412],
    ['G', 1161],
    ['R', 1619],
    ['W', 1457],
    ['U', 1354],
  ])('colour %s matches %i documents', (letter, expected) => {
    expect(filterPublicIndexEntries(PROFILE, { color: [letter as string] })).toHaveLength(
      expected as number
    )
  })

  it('a B/G card is counted under BOTH black and green (no Multicolor bucket)', () => {
    const dual = PROFILE.filter((e) => e.co.length === 2)
    expect(dual).toHaveLength(850)
    const black = filterPublicIndexEntries(PROFILE, { color: ['B'] })
    const green = filterPublicIndexEntries(PROFILE, { color: ['G'] })
    for (const card of dual.slice(0, 5)) {
      expect(black).toContain(card)
      expect(green).toContain(card)
    }
  })

  it('the five colour totals overshoot the document count, as OR-inclusive semantics require', () => {
    const sum = ['B', 'G', 'R', 'W', 'U']
      .map((l) => filterPublicIndexEntries(PROFILE, { color: [l] }).length)
      .reduce((a, b) => a + b, 0)
    expect(sum).toBe(7003)
    expect(sum).toBeGreaterThan(PROFILE.length)
  })

  it('selecting two colours ORs them together, deduplicated by document', () => {
    // 562 mono-B + 311 mono-G + 850 dual, each counted exactly once
    expect(filterPublicIndexEntries(PROFILE, { color: ['B', 'G'] })).toHaveLength(1723)
  })

  it('is case-insensitive on the requested letters', () => {
    expect(filterPublicIndexEntries(PROFILE, { color: ['b'] })).toHaveLength(1412)
  })

  it('counts DOCUMENTS, not unique scryfallId and not summed quantity', () => {
    const black = filterPublicIndexEntries(PROFILE, { color: ['B'] })
    expect(black).toHaveLength(1412)
    // The other two numbers AC2 explicitly rules out. Both are genuinely
    // different in this fixture (see buildSyntheticProfile), so this is a
    // real lock and not a vacuous assertion.
    expect(new Set(black.map((e) => e.s)).size).toBe(1405)
    expect(black.reduce((sum, e) => sum + e.q, 0)).toBe(1426)
  })
})

describe('AC9 — colour-unknown entries are excluded from colour filters, kept everywhere else', () => {
  it('excludes cu-flagged entries from a colour-filtered result', () => {
    const flagged = PROFILE.filter((e) => e.cu === 1)
    expect(flagged).toHaveLength(474)
    const black = filterPublicIndexEntries(PROFILE, { color: ['B'] })
    for (const e of flagged.slice(0, 5)) expect(black).not.toContain(e)
  })

  it('excludes cu-flagged entries even from a Colorless chip', () => {
    expect(filterPublicIndexEntries(PROFILE, { color: ['C'] })).toHaveLength(20)
  })

  it('keeps a genuinely colourless card (co: [] with no flag) reachable', () => {
    const colorless = filterPublicIndexEntries(PROFILE, { color: ['C'] })
    expect(colorless.every((e) => e.co.length === 0 && !e.cu && !e.x)).toBe(true)
  })

  it('keeps flagged entries in an UNFILTERED listing', () => {
    expect(filterPublicIndexEntries(PROFILE, {})).toHaveLength(6647)
  })

  it('keeps flagged entries reachable by name search', () => {
    const flagged = PROFILE.find((e) => e.cu === 1) as SyntheticEntry
    expect(filterPublicIndexEntries(PROFILE, { search: flagged.nl })).toContain(flagged)
  })

  it('reports how many entries a colour filter dropped for missing colour data', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['B'] },
      page: 0,
      pageSize: 60,
    })
    expect(res.total).toBe(1412)
    expect(res.indexState.missing).toBe(474)
  })

  it('reports zero missing when no colour filter is active', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 0, pageSize: 60 })
    expect(res.indexState.missing).toBe(0)
  })
})

// ── AC3: substring search ──

describe("AC3 — 'blight' finds 14 documents / 7 unique names, beyond a prefix query's reach", () => {
  it('returns 14 documents', () => {
    expect(filterPublicIndexEntries(PROFILE, { search: 'blight' })).toHaveLength(14)
  })

  it('covers all 7 unique names', () => {
    const found = filterPublicIndexEntries(PROFILE, { search: 'blight' })
    expect(new Set(found.map((e) => e.n))).toEqual(new Set(BLIGHT_NAMES))
    expect(new Set(found.map((e) => e.s)).size).toBe(7)
  })

  it('beats the prefix query, which reaches only the names that START with the term', () => {
    const prefixOnly = PROFILE.filter((e) => e.nl.startsWith('blight'))
    expect(prefixOnly).toHaveLength(8)
    expect(filterPublicIndexEntries(PROFILE, { search: 'blight' }).length).toBeGreaterThan(
      prefixOnly.length
    )
  })

  it("counts the split card ONCE even though 'blight' appears in both faces", () => {
    const split = filterPublicIndexEntries(PROFILE, { search: 'blight' }).filter((e) =>
      e.n.includes(' // ')
    )
    expect(split).toHaveLength(2) // two documents, one name
    expect(new Set(split.map((e) => e.n)).size).toBe(1)
  })

  it('finds the BACK face of a split card, which a prefix query cannot', () => {
    const back = filterPublicIndexEntries(PROFILE, { search: 'blightsower' })
    expect(back).toHaveLength(2)
    expect(back[0]!.n).toBe('Blightreaper Thallid // Blightsower Thallid')
  })

  it('never tokenizes the // away', () => {
    expect(filterPublicIndexEntries(PROFILE, { search: 'thallid // blight' })).toHaveLength(2)
  })

  it('matches the edition as well as the name (parity with the profile filter of today)', () => {
    const entries = [
      makeEntry(90001, ['R'], { n: 'Nothing Special', nl: 'nothing special', ed: 'Blightmoor' }),
    ]
    expect(filterPublicIndexEntries(entries, { search: 'blightmoor' })).toHaveLength(1)
  })

  it('is a no-op below the 2-character minimum', () => {
    expect(filterPublicIndexEntries(PROFILE, { search: 'b' })).toHaveLength(6647)
    expect(filterPublicIndexEntries(PROFILE, { search: '   ' })).toHaveLength(6647)
  })

  it('is case-insensitive and trims the term', () => {
    expect(filterPublicIndexEntries(PROFILE, { search: '  BLIGHT  ' })).toHaveLength(14)
  })
})

// ── AC5: no 50-cap; total is over the whole collection ──

describe('AC5 — the 50-result cap is gone; only DELIVERY is paginated', () => {
  it('reports the full total while delivering one page', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['B'] },
      page: 0,
      pageSize: 60,
    })
    expect(res.total).toBe(1412)
    expect(res.cards).toHaveLength(60)
    expect(res.hasMore).toBe(true)
  })

  it('reaches results far past the old 50 cap', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['B'] },
      page: 20,
      pageSize: 60,
      sort: { field: 'name', direction: 'asc' },
    })
    expect(res.cards).toHaveLength(60)
    expect(res.page).toBe(20)
    expect(res.total).toBe(1412)
  })

  it('a search term matching thousands still reports the true total', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { search: 'synthetic' },
      page: 0,
      pageSize: 60,
    })
    expect(res.total).toBe(6647 - 14)
    expect(res.cards).toHaveLength(60)
  })

  it('clamps pageSize to [1, 120]', async () => {
    const db = makeIndexedDb()
    const big = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 5000,
    })
    expect(big.pageSize).toBe(120)
    expect(big.cards).toHaveLength(120)
    const missing = await queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 0 })
    expect(missing.pageSize).toBe(60)
  })

  it('the last page reports hasMore false', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['C'] },
      page: 0,
      pageSize: 60,
    })
    expect(res.total).toBe(20)
    expect(res.cards).toHaveLength(20)
    expect(res.hasMore).toBe(false)
  })

  it('a page past the end is empty but still reports the true total', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['C'] },
      page: 9,
      pageSize: 60,
    })
    expect(res.cards).toEqual([])
    expect(res.total).toBe(20)
    expect(res.hasMore).toBe(false)
  })

  it("mode 'facets' returns counts with no cards at all", async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
      mode: 'facets',
    })
    expect(res.cards).toEqual([])
    expect(res.total).toBe(6647)
    expect(res.facets.color.B).toBe(1412)
    expect(res.facets.color.G).toBe(1161)
    expect(res.facets.color.R).toBe(1619)
    expect(res.facets.color.W).toBe(1457)
    expect(res.facets.color.U).toBe(1354)
  })

  it('facet counts ignore the colour filter itself, so the chips stay clickable', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { color: ['B'] },
      page: 0,
      pageSize: 60,
      mode: 'facets',
    })
    expect(res.facets.color.G).toBe(1161)
    expect(res.facets.color.B).toBe(1412)
  })

  it('facet counts DO honor the other dimensions', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: { search: 'blight' },
      page: 0,
      pageSize: 60,
      mode: 'facets',
    })
    expect(res.total).toBe(14)
    expect(res.facets.color.B).toBe(14)
    expect(res.facets.color.G ?? 0).toBe(0)
  })
})

// ── The wire shape: 13 fields, no image, no seller repetition ──

describe('the response row is the 231-byte grid subset, not the 406-byte entry', () => {
  it('exposes exactly the documented field set', () => {
    const row = toPublicIndexCard(PROFILE[0] as SyntheticEntry)
    expect(Object.keys(row).sort()).toEqual([...PUBLIC_INDEX_CARD_FIELDS].sort())
  })

  it('never ships the server-side-only filter fields', () => {
    const row = toPublicIndexCard(PROFILE[0] as SyntheticEntry) as Record<string, unknown>
    for (const key of ['nl', 'cm', 'pm', 'kw', 'lg', 'ca', 'x', 'cu', 'pw', 'to', 'fa']) {
      expect(row).not.toHaveProperty(key)
    }
  })

  it('never ships an image URL — the client derives it from `s`', () => {
    const row = toPublicIndexCard(PROFILE[0] as SyntheticEntry) as Record<string, unknown>
    expect(row).not.toHaveProperty('image')
    expect(row.s).toBe(PROFILE[0]!.s)
  })

  it('never ships an email anywhere in the response', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(JSON.stringify(res)).not.toMatch(/email/i)
  })
})

// ── Mitigation A: detecting a rebuild in flight ──

describe('mitigation A — a half-finished rebuild is detected, never silently halved', () => {
  it('reports partial and refuses to invent a total when a chunk disagrees with _meta', async () => {
    // The measured window: growing 16 -> 32, chunks 0..15 already rewritten
    // carry the NEW tc while _meta still advertises the OLD totalChunks.
    const db = makeIndexedDb(PROFILE, { tcOverride: { 0: 999, 3: 999 } })
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(res.indexState.partial).toBe(true)
    expect(res.total).toBeNull()
    expect(res.cards.length).toBeGreaterThan(0)
  })

  it('re-reads _meta exactly once before giving up', async () => {
    const db = makeIndexedDb(PROFILE, { tcOverride: { 0: 999 } })
    await queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 0, pageSize: 60 })
    expect(db.metaReads).toBe(2)
  })

  it('reads _meta only once when the index is consistent', async () => {
    const db = makeIndexedDb()
    await queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 0, pageSize: 60 })
    expect(db.metaReads).toBe(1)
  })

  it('clears partial when the re-read of _meta catches up with the chunks', async () => {
    const db = makeIndexedDb()
    // Every chunk already carries the NEW tc; _meta catches up on read #2.
    for (const key of Object.keys(db.live.chunkDocs)) {
      ;(db.live.chunkDocs[key] as { tc: number }).tc = 999
    }
    const stale = db.live.metaDoc as Record<string, unknown>
    db.live.onMetaRead = (n) => {
      if (n >= 2) db.live.metaDoc = { ...stale, totalChunks: 999 }
    }
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(res.indexState.partial).toBe(false)
    expect(res.total).toBe(6647)
  })

  it('does not flag a legacy index whose chunks carry no tc at all', async () => {
    const db = makeIndexedDb()
    for (const key of Object.keys(db.live.chunkDocs)) {
      delete (db.live.chunkDocs[key] as Record<string, unknown>).tc
    }
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(res.indexState.partial).toBe(false)
    expect(res.total).toBe(6647)
  })

  it('never treats the _meta document as a chunk', async () => {
    const db = makeIndexedDb()
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    // _meta has no `entries` array — expanding it would either throw or
    // silently contribute a phantom row.
    expect(res.total).toBe(6647)
    expect(res.indexState.count).toBe(6647)
    expect(res.indexState.totalChunks).toBe(32)
  })

  it('ignores chunk documents outside the range _meta advertises', async () => {
    const db = makeIndexedDb()
    // A stale chunk left over from a shrink: it holds duplicates of live
    // cards, and counting it would double them.
    db.live.chunkDocs['999'] = { id: 999, tc: 32, entries: PROFILE.slice(0, 100) }
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(res.total).toBe(6647)
  })

  it('returns an empty, non-partial result when the index does not exist yet', async () => {
    const db = makeFakeDb({}, null)
    const res = await queryPublicCardIndexForUser({
      db,
      userId: 'seller1',
      filters: {},
      page: 0,
      pageSize: 60,
    })
    expect(res.cards).toEqual([])
    expect(res.total).toBe(0)
    expect(res.indexState.partial).toBe(false)
  })
})

// ── The remaining filters and the sort ──

describe('the rest of the filter set', () => {
  it('filters by status', () => {
    const sale = filterPublicIndexEntries(PROFILE, { status: ['sale'] })
    const trade = filterPublicIndexEntries(PROFILE, { status: ['trade'] })
    expect(sale.length + trade.length).toBe(6647)
    expect(trade.every((e) => e.st === 'trade')).toBe(true)
  })

  it('filters by rarity, accepting full names', () => {
    const entries = [makeEntry(1, ['R'], { r: 'm' }), makeEntry(2, ['R'], { r: 'c' })]
    expect(filterPublicIndexEntries(entries, { rarity: ['mythic'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { rarity: ['m'] })).toHaveLength(1)
  })

  it('filters by type as a substring of the type line', () => {
    const entries = [
      makeEntry(1, ['R'], { t: 'Legendary Creature — Goblin Shaman' }),
      makeEntry(2, ['R'], { t: 'Instant' }),
    ]
    expect(filterPublicIndexEntries(entries, { type: ['creature'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { type: ['goblin'] })).toHaveLength(1)
  })

  it('filters by mana value, with a 10+ bucket', () => {
    const entries = [makeEntry(1, [], { cm: 3 }), makeEntry(2, [], { cm: 12 })]
    expect(filterPublicIndexEntries(entries, { manaValue: [3] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { manaValue: ['10+'] })).toHaveLength(1)
  })

  it('filters by set code, foil, condition and price range', () => {
    const entries = [
      makeEntry(1, [], { sc: 'M21', f: true, cn: 'LP', p: 5 }),
      makeEntry(2, [], { sc: 'ZNR', f: false, cn: 'NM', p: 50 }),
    ]
    expect(filterPublicIndexEntries(entries, { edition: ['m21'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { foil: true })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { condition: ['nm'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { minPrice: 10 })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { maxPrice: 10 })).toHaveLength(1)
  })

  it('requires EVERY selected format and EVERY selected keyword (AND, as useCardFilter does)', () => {
    const entries = [
      makeEntry(1, [], { lg: ['modern', 'legacy'], kw: ['Flying', 'Vigilance'] }),
      makeEntry(2, [], { lg: ['modern'], kw: ['Flying'] }),
    ]
    expect(filterPublicIndexEntries(entries, { formats: ['modern', 'legacy'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { keywords: ['flying', 'vigilance'] })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { keywords: ['flying'] })).toHaveLength(2)
  })

  it('matches a keyword that only appears in the type line (as useCardFilter does)', () => {
    const entries = [makeEntry(1, [], { kw: [], t: 'Enchantment — Aura' })]
    expect(filterPublicIndexEntries(entries, { keywords: ['aura'] })).toHaveLength(1)
  })

  it('filters by power, toughness and full art', () => {
    const entries = [
      makeEntry(1, [], { pw: '2', to: '3', fa: false }),
      makeEntry(2, [], { pw: '7', to: '7', fa: true }),
      makeEntry(3, [], { pw: '*', to: '*', fa: false }),
    ]
    expect(filterPublicIndexEntries(entries, { powerMin: 5 })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { toughnessMax: 4 })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { fullArt: true })).toHaveLength(1)
    // A non-numeric stat ('*') fails a range, exactly as useCardFilter's
    // passesStatRange does — NaN never satisfies a bound.
    expect(filterPublicIndexEntries(entries, { powerMin: 0 })).toHaveLength(2)
  })

  it('matches a dual-faced power on EITHER face', () => {
    const entries = [makeEntry(1, [], { pw: '1 // 6', to: '1 // 6' })]
    expect(filterPublicIndexEntries(entries, { powerMin: 5 })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { powerMax: 2 })).toHaveLength(1)
    expect(filterPublicIndexEntries(entries, { powerMin: 7 })).toHaveLength(0)
  })

  it('combines every filter with AND', () => {
    const res = filterPublicIndexEntries(PROFILE, {
      color: ['B'],
      status: ['trade'],
      search: 'blight',
    })
    expect(res.every((e) => e.co.includes('B') && e.st === 'trade' && e.nl.includes('blight'))).toBe(
      true
    )
    expect(res.length).toBe(5)
  })
})

describe('sorting', () => {
  const entries = [
    makeEntry(1, [], { n: 'Zebra', p: 3, q: 1, sc: 'ZNR', ca: 300 }),
    makeEntry(2, [], { n: 'Alpha', p: 1, q: 9, sc: 'AAA', ca: 100 }),
    makeEntry(3, [], { n: 'Mid', p: 2, q: 5, sc: 'MMM', ca: 200 }),
  ]

  it('sorts by name, price, quantity, edition and date', () => {
    expect(sortPublicIndexEntries(entries, { field: 'name', direction: 'asc' }).map((e) => e.n)).toEqual([
      'Alpha',
      'Mid',
      'Zebra',
    ])
    expect(sortPublicIndexEntries(entries, { field: 'price', direction: 'desc' }).map((e) => e.p)).toEqual([3, 2, 1])
    expect(sortPublicIndexEntries(entries, { field: 'quantity', direction: 'asc' }).map((e) => e.q)).toEqual([1, 5, 9])
    expect(sortPublicIndexEntries(entries, { field: 'edition', direction: 'asc' }).map((e) => e.sc)).toEqual([
      'AAA',
      'MMM',
      'ZNR',
    ])
    expect(sortPublicIndexEntries(entries, { field: 'dateAdded', direction: 'desc' }).map((e) => e.ca)).toEqual([
      300, 200, 100,
    ])
  })

  it('does not mutate its input', () => {
    const copy = [...entries]
    sortPublicIndexEntries(entries, { field: 'name', direction: 'asc' })
    expect(entries).toEqual(copy)
  })

  it('returns the same page for the same query', async () => {
    const db = makeIndexedDb()
    const opts = {
      db,
      userId: 'seller1',
      filters: {},
      page: 3,
      pageSize: 60,
      sort: { field: 'name' as const, direction: 'asc' as const },
    }
    const a = await queryPublicCardIndexForUser(opts)
    const b = await queryPublicCardIndexForUser(opts)
    expect(a.cards).toEqual(b.cards)
  })
})

describe('argument validation', () => {
  it('rejects a negative or non-integer page', async () => {
    const db = makeIndexedDb()
    await expect(
      queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: -1, pageSize: 60 })
    ).rejects.toThrow()
    await expect(
      queryPublicCardIndexForUser({ db, userId: 'seller1', filters: {}, page: 1.5, pageSize: 60 })
    ).rejects.toThrow()
  })

  it('rejects an unknown sort field and an unknown mode', async () => {
    const db = makeIndexedDb()
    await expect(
      queryPublicCardIndexForUser({
        db,
        userId: 'seller1',
        filters: {},
        page: 0,
        pageSize: 60,
        sort: { field: 'nope' as 'name', direction: 'asc' },
      })
    ).rejects.toThrow()
    await expect(
      queryPublicCardIndexForUser({
        db,
        userId: 'seller1',
        filters: {},
        page: 0,
        pageSize: 60,
        mode: 'ids' as 'cards',
      })
    ).rejects.toThrow()
  })
})
