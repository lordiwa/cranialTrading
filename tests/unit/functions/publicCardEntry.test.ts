/**
 * TASK-247 (tanda 1/4): entry-building module for the public-profile index
 * this ticket replaces the old ~60-card in-memory scan with. Same technique
 * as cardIndexEntry.test.ts (TASK-245): a dependency-free CommonJS module
 * under functions/lib/ that vitest can require() and actually EXECUTE
 * without firebase-admin (functions/ still has no emulator harness —
 * TASK-236). This is a real sensor, not a source-text assertion.
 *
 * Corrections round (review of e49d5db, measured against the 6,647 real
 * public_cards documents of the production profile):
 *
 * HIGH-1: public_cards documents do NOT have a `name` field — the real
 * fields are `cardName` / `cardNameLower`. The base fixture below now
 * matches the real document shape (no `name` key at all) so a regression
 * to `data.name` fails loudly instead of silently reading `undefined`.
 *
 * HIGH-2: `colors: []` is a legitimate value (incolora), not "missing" —
 * `color_identity` is a DIFFERENT concept (it includes mana symbols in the
 * card's rules text) and must never stand in for "the card's color" when
 * `colors` is present-but-empty. Measured real card locked below: Cranial
 * Plating (colors=[], color_identity=[B]) must NOT be counted as black.
 *
 * AC9, corrected: 474 of 6,647 (7.1%) public_cards have NO usable color
 * source at all (no `colors`, no `card_faces[].colors`, no
 * `color_identity`) — those must be distinguishable from a genuinely
 * colorless card, or every color filter silently treats them as
 * colorless. Decision (see header of publicCardEntry.js): a new `cu`
 * (color-unknown) flag, separate from `x` (no cache doc at all) — `cu` can
 * be set even when a cache doc exists, because the cache doc itself can
 * lack every color source.
 *
 * AC10, corrected: hash-mod-totalChunks alone is not stable under growth —
 * measured 6,294/6,647 (94.7%) of entries change chunk when totalChunks
 * goes 17 -> 18. publicChunkId now rounds the requested chunk count up to
 * the next power of two internally, so growth that doesn't cross a
 * power-of-two boundary remaps nothing, and crossing one remaps ~half
 * (each old bucket splits in two), never the whole index.
 *
 * Second correction pass (fresh-context reviewer, mutation-tested — 7/9
 * mutations killed, 2 survived):
 *
 * - The old chunk-distribution test passed against a mutant
 *   `chunk = length(scryfallId) % totalChunks` because it used synthetic
 *   ids of varying length and a threshold too weak to notice — real
 *   scryfallId are all UUIDs, measured EXACTLY 36 characters, so that
 *   mutant collapses 100% of real cards into one chunk. Fixed: UUID-shaped
 *   ids and a hard assertion that every bucket gets used within a bounded
 *   spread, not just "more than one bucket got something".
 * - The old color-fallback tests passed against inverting the
 *   card_faces/color_identity order because no test had BOTH fields
 *   present with card_faces carrying real data. The 'prefers
 *   card_faces[].colors over color_identity' test already covers that,
 *   and a new Westvale-Abbey-shaped test locks the complementary case:
 *   card_faces present but empty of color data must still fall through to
 *   color_identity, not stop at `cu: 1`.
 * - New fields from the reviewer's read of the real consumers
 *   (useCardFilter.ts, UserProfileView.vue): `ed` (edition — the human sc
 *   set name, distinct from `sc`/setCode, used by the existing
 *   substring-search-on-name-or-edition fallback), `pm` (produced_mana —
 *   drives land color categorization), `ca` (a createdAt-equivalent
 *   timestamp — public_cards has no real createdAt, `updatedAt` is used
 *   as the measured best-available proxy).
 * - LOW: `q: data.quantity || 1` silently promoted a stored 0 to 1; fixed
 *   to `??` so an explicit zero survives.
 *
 * Third correction pass (fresh-context reviewer, 0 HIGH — confirmed the
 * above fixes hold in the code, not just in the commit message):
 * MEDIUM-1 pins that `cu` is also set on the no-cache path (it's a
 * superset of `x`); MEDIUM-2 pins that a genuinely-different stored
 * cardNameLower wins over a freshly recomputed one; MEDIUM-3 pins that
 * `nextPowerOfTwo`/`publicChunkId` THROW on a non-finite or sub-1
 * totalChunks instead of silently collapsing the whole index into chunk
 * 0; LOW-1 pins that an unparseable updatedAt resolves to 0, not NaN.
 */
import { buildPublicEntry, publicChunkId, nextPowerOfTwo } from '../../../functions/lib/publicCardEntry.js'

/**
 * A user's public_cards document, as it is actually stored — measured
 * fields: avatarUrl, cardId, cardName, cardNameLower, condition, edition,
 * foil, image, location, price, quantity, scryfallId, setCode, status,
 * updatedAt, userId, username. There is NO `name` field.
 */
const basePublicCard = {
  scryfallId: 'sf-forest-1',
  cardId: 'card-1',
  cardName: 'Forest',
  cardNameLower: 'forest',
  quantity: 4,
  price: 0.1,
  status: 'sale',
  foil: false,
  condition: 'NM',
  setCode: 'znr',
  edition: 'Zendikar Rising',
}

/**
 * A real scryfallId is a UUID — measured exactly 36 characters on all
 * 5,162 ids in the production profile. Synthetic ids that don't match that
 * shape can hide a hash bug (e.g. hashing by string LENGTH rather than
 * content) that a real UUID population would expose immediately, since
 * every real id is the same length.
 */
function fakeScryfallUuid(i: number): string {
  const seed = (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0')
  const hex = (seed + seed + seed + seed).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

describe('publicCardEntry — public-profile index entry building (TASK-247 tanda 1)', () => {
  describe('buildPublicEntry — compact shape', () => {
    const cache = {
      type_line: 'Basic Land — Forest',
      cmc: 0,
      colors: ['G'],
      color_identity: ['G'],
      rarity: 'common',
      keywords: [],
      legalities: { modern: 'legal', standard: 'not_legal', pioneer: 'legal' },
    }
    const entry = buildPublicEntry(basePublicCard, cache)

    it('carries identity, name (+ lowercase for substring search) from cardName/cardNameLower — NOT from a `name` field, which does not exist on real documents', () => {
      expect(entry.s).toBe('sf-forest-1')
      expect(entry.i).toBe('card-1')
      expect(entry.n).toBe('Forest')
      expect(entry.nl).toBe('forest')
      expect(entry.q).toBe(4)
      expect(entry.p).toBe(0.1)
      expect(entry.st).toBe('sale')
      expect(entry.f).toBe(false)
      expect(entry.cn).toBe('NM')
      expect(entry.sc).toBe('znr')
      expect(entry.ed).toBe('Zendikar Rising')
    })

    it('derives nl from cardName lowercased when cardNameLower is missing, rather than reading a nonexistent `name`', () => {
      const { cardNameLower, ...withoutLower } = basePublicCard
      const e = buildPublicEntry({ ...withoutLower, cardName: 'Roiling Dragonstorm' }, cache)
      expect(e.n).toBe('Roiling Dragonstorm')
      expect(e.nl).toBe('roiling dragonstorm')
    })

    it('MEDIUM-2 mutation-pin: the STORED cardNameLower wins over a fresh cardName.toLowerCase() when the two genuinely differ — a mutant that always recomputes from cardName would pass every other fixture here, since they all happen to already match', () => {
      // Æther Vial: a stored lowercase that strips the ligature/diacritic in
      // a way a naive .toLowerCase() on the display name would NOT
      // reproduce — the stored value is deliberately NOT
      // cardName.toLowerCase() so this test can tell the two apart.
      const e = buildPublicEntry(
        { ...basePublicCard, cardName: 'Æther Vial', cardNameLower: 'aether vial' },
        cache,
      )
      expect(e.n).toBe('Æther Vial')
      expect(e.nl).toBe('aether vial')
      expect(e.nl).not.toBe('Æther Vial'.toLowerCase())
    })

    it('carries Scryfall metadata: type_line, cmc, colors, rarity (1 char), keywords, legalities compacted to the legal-format list', () => {
      expect(entry.t).toBe('Basic Land — Forest')
      expect(entry.cm).toBe(0)
      expect(entry.co).toEqual(['G'])
      expect(entry.r).toBe('c')
      expect(entry.kw).toEqual([])
      expect(entry.lg).toEqual(['modern', 'pioneer'])
    })

    it('is compact — stays well under raw-copy size (measured ~230B target vs ~832B raw; grew a little with ed/pm/ca but still well under the raw-copy baseline)', () => {
      const bytes = Buffer.byteLength(JSON.stringify(entry), 'utf-8')
      expect(bytes).toBeLessThan(450)
    })

    it('is not flagged missing metadata (x) or color-unknown (cu) when the cache has usable colors', () => {
      expect(entry.x).toBeFalsy()
      expect(entry.cu).toBeFalsy()
    })
  })

  describe('review addendum — fields required by real consumers (useCardFilter.ts, UserProfileView.vue)', () => {
    it('carries edition (ed) — the human set name UserProfileView\'s substring search matches against alongside the card name, distinct from sc/setCode', () => {
      const entry = buildPublicEntry(basePublicCard, {})
      expect(entry.ed).toBe('Zendikar Rising')
    })

    it('is empty string, not thrown, when edition is missing', () => {
      const { edition, ...withoutEdition } = basePublicCard
      const entry = buildPublicEntry(withoutEdition, {})
      expect(entry.ed).toBe('')
    })

    it('carries produced_mana (pm) — used by useCardFilter to categorize lands by the color(s) they actually produce', () => {
      const entry = buildPublicEntry(basePublicCard, { type_line: 'Land', produced_mana: ['U', 'B'] })
      expect(entry.pm).toEqual(['U', 'B'])
    })

    it('is an empty array, not thrown, when produced_mana is absent or there is no cache', () => {
      expect(buildPublicEntry(basePublicCard, { type_line: 'Land' }).pm).toEqual([])
      expect(buildPublicEntry(basePublicCard, null).pm).toEqual([])
    })

    it('carries a createdAt-equivalent timestamp (ca) derived from updatedAt — public_cards has no real createdAt field', () => {
      const withTimestamp = { ...basePublicCard, updatedAt: { toMillis: () => 1_700_000_000_000 } }
      const entry = buildPublicEntry(withTimestamp, {})
      expect(entry.ca).toBe(1_700_000_000_000)
    })

    it('also accepts a plain Date or ISO string for updatedAt (not only a Firestore Timestamp), and 0 when there is none', () => {
      expect(buildPublicEntry({ ...basePublicCard, updatedAt: new Date(1_700_000_000_000) }, {}).ca).toBe(1_700_000_000_000)
      expect(buildPublicEntry({ ...basePublicCard, updatedAt: '2023-11-14T22:13:20.000Z' }, {}).ca).toBe(1_700_000_000_000)
      expect(buildPublicEntry(basePublicCard, {}).ca).toBe(0)
    })

    it('LOW-1 mutation-pin: an unparseable updatedAt string resolves to 0, never NaN — removing the Number.isNaN guard would let a garbage string poison ca with NaN instead of the safe 0 default', () => {
      const entry = buildPublicEntry({ ...basePublicCard, updatedAt: 'not-a-real-date' }, {})
      expect(entry.ca).toBe(0)
      expect(Number.isNaN(entry.ca)).toBe(false)
    })
  })

  describe('HIGH-1 regression — substring search reads cardName/cardNameLower, not a nonexistent `name` field', () => {
    it('a real-shaped document with no `name` key still produces a searchable nl', () => {
      const doc = { ...basePublicCard, cardName: 'Blightning', cardNameLower: 'blightning' }
      expect('name' in doc).toBe(false)
      const entry = buildPublicEntry(doc, null)
      expect(entry.n).toBe('Blightning')
      expect(entry.nl).toBe('blightning')
      expect(entry.nl.includes('blight')).toBe(true)
    })

    it('does NOT silently produce an empty nl for a real document (the exact regression measured: 0/14 "blight" matches instead of 14)', () => {
      const entry = buildPublicEntry(basePublicCard, null)
      expect(entry.n).not.toBe('')
      expect(entry.nl).not.toBe('')
    })
  })

  describe('LOW regression — a stored quantity of 0 must survive, not silently become 1', () => {
    it('preserves an explicit quantity of 0 (a corrupted/zeroed doc should NOT read as having stock)', () => {
      const entry = buildPublicEntry({ ...basePublicCard, quantity: 0 }, null)
      expect(entry.q).toBe(0)
    })

    it('still defaults to 1 when quantity is missing entirely', () => {
      const { quantity, ...withoutQuantity } = basePublicCard
      const entry = buildPublicEntry(withoutQuantity, null)
      expect(entry.q).toBe(1)
    })
  })

  describe('AC9 — color fallback chain: colors (even empty) -> union of card_faces[].colors -> color_identity (last resort)', () => {
    it('uses colors when present, even though it is also present in color_identity', () => {
      const entry = buildPublicEntry(basePublicCard, { colors: ['G'], color_identity: ['G', 'U'] })
      expect(entry.co).toEqual(['G'])
    })

    it('HIGH-2 regression: colors=[] (incolora) is NOT replaced by color_identity — measured real card Cranial Plating, colors=[], color_identity=[B], must not read as black', () => {
      const cranialPlating = {
        type_line: 'Artifact — Equipment',
        colors: [],
        color_identity: ['B'],
      }
      const entry = buildPublicEntry(basePublicCard, cranialPlating)
      expect(entry.co).toEqual([])
      expect(entry.co).not.toContain('B')
    })

    it('HIGH-2 regression: a 5-color-identity artifact with colors=[] stays colorless, not five colors — measured real card Marshals\' Pathcruiser', () => {
      const pathcruiser = {
        type_line: 'Artifact — Vehicle',
        colors: [],
        color_identity: ['B', 'G', 'R', 'U', 'W'],
      }
      const entry = buildPublicEntry(basePublicCard, pathcruiser)
      expect(entry.co).toEqual([])
    })

    it('falls back to color_identity only when colors is entirely absent (not an array at all) and there are no card_faces', () => {
      const entry = buildPublicEntry(basePublicCard, { color_identity: ['U', 'B'] })
      expect(entry.co).toEqual(['U', 'B'])
    })

    it('falls back to the union of card_faces[].colors when colors is absent at the root — the measured dual-faced cards', () => {
      const cache = {
        card_faces: [
          { colors: ['U'], type_line: 'Creature — Human Wizard' },
          { colors: ['R'], type_line: 'Creature — Human Warrior' },
        ],
      }
      const entry = buildPublicEntry(basePublicCard, cache)
      expect(entry.co).toEqual(['U', 'R'])
    })

    it('prefers card_faces[].colors over color_identity when colors is absent at the root but both are available', () => {
      const cache = {
        color_identity: ['U', 'R', 'B'],
        card_faces: [{ colors: ['U'] }, { colors: ['R'] }],
      }
      const entry = buildPublicEntry(basePublicCard, cache)
      expect(entry.co).toEqual(['U', 'R'])
    })

    it('dedupes the card_faces union (a card whose faces share a color)', () => {
      const cache = {
        card_faces: [{ colors: ['U'] }, { colors: ['U', 'B'] }],
      }
      const entry = buildPublicEntry(basePublicCard, cache)
      expect(entry.co).toEqual(['U', 'B'])
    })

    it('mutation-pin: falls THROUGH card_faces to color_identity when card_faces exist but none carry usable colors — the Westvale Abbey shape (a dual-faced land: both faces are colorless, but color_identity carries the color from an activated ability)', () => {
      const westvaleAbbey = {
        color_identity: ['B'],
        card_faces: [
          { type_line: 'Land' },
          { type_line: 'Creature — Zombie' },
        ],
      }
      const entry = buildPublicEntry(basePublicCard, westvaleAbbey)
      expect(entry.co).toEqual(['B'])
      expect(entry.cu).toBeFalsy()
    })
  })

  describe('AC9 — distinguishing "incolora" (a real colors:[] value) from "no color data at all" (the measured 474/6,647 = 7.1%)', () => {
    it('a genuinely colorless card (colors: [] present) is co: [] with NO color-unknown flag', () => {
      const entry = buildPublicEntry(basePublicCard, { type_line: 'Artifact', colors: [] })
      expect(entry.co).toEqual([])
      expect(entry.cu).toBeFalsy()
    })

    it('a cache doc with NEITHER colors, NOR card_faces, NOR color_identity is co: [] but IS flagged color-unknown (cu: 1) — this is the measured 7.1% gap, invisible without the flag', () => {
      const entry = buildPublicEntry(basePublicCard, { type_line: 'Artifact' })
      expect(entry.co).toEqual([])
      expect(entry.cu).toBe(1)
    })

    it('card_faces present but none of the faces carry a colors array also counts as color-unknown, not colorless', () => {
      const entry = buildPublicEntry(basePublicCard, {
        card_faces: [{ type_line: 'A' }, { type_line: 'B' }],
      })
      expect(entry.co).toEqual([])
      expect(entry.cu).toBe(1)
    })
  })

  describe('AC9 — type_line fallback chain: root -> union of card_faces[].type_line', () => {
    it('uses the root type_line when present', () => {
      const entry = buildPublicEntry(basePublicCard, { type_line: 'Basic Land — Forest' })
      expect(entry.t).toBe('Basic Land — Forest')
    })

    it('falls back to joining card_faces[].type_line when the root has none — the 1 measured card missing type_line', () => {
      const cache = {
        card_faces: [
          { type_line: 'Creature — Human Wizard' },
          { type_line: 'Creature — Human Warrior' },
        ],
      }
      const entry = buildPublicEntry(basePublicCard, cache)
      expect(entry.t).toBe('Creature — Human Wizard // Creature — Human Warrior')
    })

    it('is empty string, not thrown, when there is no root type_line and no card_faces', () => {
      const entry = buildPublicEntry(basePublicCard, {})
      expect(entry.t).toBe('')
    })
  })

  describe('AC9 — the measured scryfallId with no scryfall_cache document at all', () => {
    it('still builds a full entry from the public_cards fields alone when cache is null', () => {
      const entry = buildPublicEntry(basePublicCard, null)
      expect(entry.s).toBe('sf-forest-1')
      expect(entry.n).toBe('Forest')
      expect(entry.q).toBe(4)
    })

    it('leaves Scryfall-derived fields empty rather than throwing or inventing data', () => {
      const entry = buildPublicEntry(basePublicCard, null)
      expect(entry.t).toBe('')
      expect(entry.co).toEqual([])
      expect(entry.pm).toEqual([])
      expect(entry.cm).toBe(0)
      expect(entry.r).toBe('')
      expect(entry.kw).toEqual([])
      expect(entry.lg).toEqual([])
    })

    it('marks the entry with the explicit missing-cache flag (x: 1) so the query layer and reconciliation can find it', () => {
      expect(buildPublicEntry(basePublicCard, null).x).toBe(1)
      expect(buildPublicEntry(basePublicCard, undefined).x).toBe(1)
    })

    it('MEDIUM-1 mutation-pin: also sets cu (color-unknown) when there is no cache at all — cu is a SUPERSET of x, so a consumer that excludes cu from color filters already covers the no-cache case too', () => {
      expect(buildPublicEntry(basePublicCard, null).cu).toBe(1)
      expect(buildPublicEntry(basePublicCard, undefined).cu).toBe(1)
    })

    it('does NOT set the missing-cache flag when a cache document exists, even a sparse one', () => {
      expect(buildPublicEntry(basePublicCard, {}).x).toBeFalsy()
    })
  })

  describe('AC10 — publicChunkId is stable under growth: bucket count rounds up to the next power of two', () => {
    it('is deterministic: the same scryfallId always resolves to the same chunk', () => {
      const a = publicChunkId('sf-forest-1', 10)
      const b = publicChunkId('sf-forest-1', 10)
      expect(a).toBe(b)
    })

    it('is not positional: the same card keeps its chunk no matter where it sits in a list', () => {
      const ids = ['sf-forest-1', 'sf-elves', 'sf-tarn', 'sf-plating', 'sf-kogla']
      const reordered = [...ids].reverse()
      const totalChunks = 10
      const byOriginalOrder = new Map(ids.map((id) => [id, publicChunkId(id, totalChunks)]))
      for (const id of reordered) {
        expect(publicChunkId(id, totalChunks)).toBe(byOriginalOrder.get(id))
      }
    })

    it('two differently-ordered lists assign every id to the same chunk', () => {
      const ids = ['sf-a', 'sf-b', 'sf-c', 'sf-d', 'sf-e', 'sf-f']
      const shuffled = [ids[3], ids[0], ids[5], ids[1], ids[4], ids[2]]
      const totalChunks = 4
      const assignFrom = (list: string[]) =>
        new Map(list.map((id) => [id, publicChunkId(id, totalChunks)]))
      const a = assignFrom(ids)
      const b = assignFrom(shuffled)
      for (const id of ids) {
        expect(b.get(id)).toBe(a.get(id))
      }
    })

    it('stays within [0, nextPowerOfTwo(totalChunks)) — the actual bucket space, not the raw requested count', () => {
      const totalChunks = 7
      const bucketSpace = nextPowerOfTwo(totalChunks)
      expect(bucketSpace).toBe(8)
      for (const id of ['x', 'sf-forest-1', 'Leyline Binding', 'Scalding Tarn', 'Cranial Plating', "Kogla the Titan Ape"]) {
        const chunk = publicChunkId(id, totalChunks)
        expect(chunk).toBeGreaterThanOrEqual(0)
        expect(chunk).toBeLessThan(bucketSpace)
      }
    })

    it('mutation-pin: distributes UUID-shaped scryfallId across every chunk with bounded spread — a `length(id) % totalChunks` mutant survived the old version of this test because it used ids of varying length and a threshold of just ">1 bucket used"; every real scryfallId measures exactly 36 characters, so that mutant collapses 100% of real cards into a single chunk', () => {
      const totalChunks = 8
      const sampleSize = 4000
      const counts = new Map<number, number>()
      for (let i = 0; i < sampleSize; i++) {
        const id = fakeScryfallUuid(i)
        expect(id).toHaveLength(36)
        const chunk = publicChunkId(id, totalChunks)
        counts.set(chunk, (counts.get(chunk) || 0) + 1)
      }
      expect(counts.size).toBe(totalChunks)
      const expectedPerBucket = sampleSize / totalChunks
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(expectedPerBucket * 0.7)
        expect(count).toBeLessThan(expectedPerBucket * 1.3)
      }
    })

    it('nextPowerOfTwo rounds a requested chunk count up to the nearest power of two', () => {
      expect(nextPowerOfTwo(1)).toBe(1)
      expect(nextPowerOfTwo(2)).toBe(2)
      expect(nextPowerOfTwo(3)).toBe(4)
      expect(nextPowerOfTwo(16)).toBe(16)
      expect(nextPowerOfTwo(17)).toBe(32)
      expect(nextPowerOfTwo(18)).toBe(32)
      expect(nextPowerOfTwo(2.5)).toBe(4)
    })

    it('MEDIUM-3 mutation-pin: THROWS on a non-finite or sub-1 totalChunks instead of silently collapsing the whole index into chunk 0 — a real failure mode (e.g. a failed read of the persisted totalChunks metadata this module\'s own contract requires) that used to coerce to bucket count 1', () => {
      for (const bad of [0, -5, NaN, undefined, null]) {
        expect(() => nextPowerOfTwo(bad as unknown as number)).toThrow()
        expect(() => publicChunkId('sf-forest-1', bad as unknown as number)).toThrow()
      }
    })

    it('does NOT throw for valid edge inputs (exactly 1, and non-integer >= 1)', () => {
      expect(() => nextPowerOfTwo(1)).not.toThrow()
      expect(() => publicChunkId('sf-forest-1', 1)).not.toThrow()
      expect(() => nextPowerOfTwo(1.5)).not.toThrow()
    })

    it('HIGH-3 regression: growth that stays under the current power-of-two capacity remaps NOTHING (measured baseline: 94.7% remapped going 17 -> 18 with plain hash % totalChunks)', () => {
      const ids = Array.from({ length: 500 }, (_, i) => `scryfall-id-${i}`)
      const before = new Map(ids.map((id) => [id, publicChunkId(id, 9)])) // rounds to 16
      const after = new Map(ids.map((id) => [id, publicChunkId(id, 16)])) // still rounds to 16
      let remapped = 0
      for (const id of ids) if (before.get(id) !== after.get(id)) remapped++
      expect(remapped).toBe(0)
    })

    it('HIGH-3 regression: crossing a power-of-two boundary remaps roughly half the index, never the whole thing', () => {
      const ids = Array.from({ length: 2000 }, (_, i) => `scryfall-id-${i}`)
      const before = new Map(ids.map((id) => [id, publicChunkId(id, 16)])) // 16 buckets
      const after = new Map(ids.map((id) => [id, publicChunkId(id, 17)])) // rounds up to 32 buckets
      let remapped = 0
      for (const id of ids) if (before.get(id) !== after.get(id)) remapped++
      const pct = (remapped / ids.length) * 100
      // Each of the 16 old buckets splits into 2 of the 32 new ones — entries
      // that land in the "upper half" move, entries in the "lower half"
      // don't. Expect roughly half, bounded well away from the 94.7%
      // measured on the un-fixed hash % totalChunks scheme.
      expect(pct).toBeGreaterThan(30)
      expect(pct).toBeLessThan(70)
    })
  })

  // ── TASK-247 tanda 3: the four advanced-filter fields ──
  //
  // Rafael's decision for this tanda: power, toughness, full_art and
  // keywords go INTO the index; oracle_text does NOT. `kw` was already here
  // since tanda 1, so the gap is `pw`/`to`/`fa` — the three fields
  // useCardFilter's advPowerMin/advPowerMax, advToughnessMin/advToughnessMax
  // and advFullArtOnly read. Without them, migrating the public profile onto
  // this index would satisfy AC2/AC3 and REGRESS those three advanced
  // filters at the same time (feedback_verificar_contra_el_comportamiento_anterior).
  //
  // oracle_text stays out on purpose: its only consumer is passesKeywords,
  // which already matches against `keywords` and `type_line` too — both of
  // which are in the index — and it is hundreds of bytes of free text per
  // card, which is the one thing the 4G-slow byte budget cannot absorb.
  // Deferred to TASK-248.
  describe('advanced-filter fields (pw / to / fa)', () => {
    it('carries power, toughness and full_art from the cache document', () => {
      const entry = buildPublicEntry(
        { scryfallId: 'sf-1', cardId: 'c-1', cardName: 'Grizzly Bears' },
        { colors: ['G'], type_line: 'Creature — Bear', power: '2', toughness: '2', full_art: false }
      )
      expect(entry.pw).toBe('2')
      expect(entry.to).toBe('2')
      expect(entry.fa).toBe(false)
    })

    it('marks a full-art printing', () => {
      const entry = buildPublicEntry(
        { scryfallId: 'sf-2', cardId: 'c-2', cardName: 'Island' },
        { colors: [], type_line: 'Basic Land — Island', full_art: true }
      )
      expect(entry.fa).toBe(true)
    })

    it('falls back to card_faces for a dual-faced creature that prints no root power', () => {
      // Real Scryfall shape for a transforming creature: the root document
      // has no power/toughness at all, each face has its own.
      const entry = buildPublicEntry(
        { scryfallId: 'sf-3', cardId: 'c-3', cardName: 'Delver of Secrets // Insectile Aberration' },
        {
          card_faces: [
            { colors: ['U'], type_line: 'Creature — Human Wizard', power: '1', toughness: '1' },
            { colors: ['U'], type_line: 'Creature — Human Insect', power: '3', toughness: '2' },
          ],
        }
      )
      // Joined the same way `t` joins type lines, so the two stay aligned
      // face-for-face and neither face's stats are silently dropped.
      expect(entry.pw).toBe('1 // 3')
      expect(entry.to).toBe('1 // 2')
    })

    it('leaves pw/to empty for a non-creature rather than inventing a 0', () => {
      const entry = buildPublicEntry(
        { scryfallId: 'sf-4', cardId: 'c-4', cardName: 'Lightning Bolt' },
        { colors: ['R'], type_line: 'Instant' }
      )
      expect(entry.pw).toBe('')
      expect(entry.to).toBe('')
      expect(entry.fa).toBe(false)
    })

    it('preserves a non-numeric power such as * without coercing it', () => {
      const entry = buildPublicEntry(
        { scryfallId: 'sf-5', cardId: 'c-5', cardName: 'Tarmogoyf' },
        { colors: ['G'], type_line: 'Creature — Lhurgoyf', power: '*', toughness: '1+*' }
      )
      expect(entry.pw).toBe('*')
      expect(entry.to).toBe('1+*')
    })

    it('is safe when there is no cache document at all', () => {
      const entry = buildPublicEntry({ scryfallId: 'sf-6', cardId: 'c-6', cardName: 'Unknown' }, null)
      expect(entry.pw).toBe('')
      expect(entry.to).toBe('')
      expect(entry.fa).toBe(false)
      expect(entry.x).toBe(1)
    })
  })

})
