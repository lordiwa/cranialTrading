/**
 * TASK-245: a status change (single card OR bulk) rewrote the card's
 * card_index entry from its user document ALONE, with no join against
 * scryfall_cache. On this project's older accounts the user document never
 * carried type_line/cmc/colors/rarity (they live in scryfall_cache), so the
 * rewritten entry came out with t='', cm=0, co=[], r='' — measured in dev:
 * 6787/6787 touched cards lost type_line, index land count 7129 -> 376.
 *
 * Unlike the source-text assertions in applyCardIndexDelta.test.ts /
 * buildCardIndexAuthz.test.ts (which TASK-236 correctly calls empty locks —
 * they prove a LINE exists, never that a MECHANISM works), this file is an
 * EXECUTION lock, same technique as concurrency.test.ts: the entry-building
 * logic now lives in functions/lib/cardIndexEntry.js, a dependency-free
 * CommonJS module that can be require()'d and run for real without
 * firebase-admin (functions/ still has no emulator harness — TASK-236).
 *
 * RED PLANTED AND CAPTURED (2026-08-18, TASK-245): with
 * `mergeScryfallMetadata` returning `data` untouched — i.e. exactly the
 * pre-fix behavior of functions/index.js:1471/1479, which passed the raw
 * `snap.data()` straight into toIndexCard — the four tests in the
 * "preserves Scryfall metadata" block fail with `expected '' to be
 * 'Basic Land — Forest'` (and cm 0, co [], r ''). Restoring the merge turns
 * them green. That red run is the evidence this lock is a real sensor.
 *
 * WHAT THIS LOCK DOES *NOT* PROVE: that applyCardIndexDelta in
 * functions/index.js actually calls this module with a populated cache map.
 * That call-site coupling has no execution harness and is covered only by
 * the source-text tripwire added in applyCardIndexDelta.test.ts, plus the
 * AC7 in-dev measurement.
 */
import {
  toIndexCard,
  mergeScryfallMetadata,
  isDualFaced,
  buildIndexEntry,
} from '../../../functions/lib/cardIndexEntry.js'

/** A user card document as it exists on the older accounts: no Scryfall metadata. */
const userDocWithoutMetadata = {
  scryfallId: 'sf-forest-1',
  name: 'Forest',
  status: 'sale',
  quantity: 4,
  price: 0.1,
  setCode: 'znr',
  edition: 'Zendikar Rising',
  condition: 'NM',
  foil: false,
  public: true,
}

/** The scryfall_cache document that holds the metadata for that card. */
const cacheEntry = {
  cmc: 0,
  type_line: 'Basic Land — Forest',
  colors: ['G'],
  rarity: 'common',
  power: '',
  toughness: '',
  full_art: false,
  produced_mana: ['G'],
  keywords: [],
  legalities: { modern: 'legal', standard: 'not_legal' },
}

describe('card_index entry building — Scryfall metadata join (TASK-245)', () => {
  describe('preserves Scryfall metadata when the user document has none', () => {
    const entry = toIndexCard('card-1', mergeScryfallMetadata(userDocWithoutMetadata, cacheEntry))

    it('keeps type_line (t) — the field whose loss made the land filter return 376 of 7129', () => {
      expect(entry.t).toBe('Basic Land — Forest')
    })

    it('keeps colors (co)', () => {
      expect(entry.co).toEqual(['G'])
    })

    it('keeps rarity (r, compacted to its first char)', () => {
      expect(entry.r).toBe('c')
    })

    it('keeps produced_mana (pm) and legalities (lg)', () => {
      expect(entry.pm).toEqual(['G'])
      expect(entry.lg).toEqual(['modern'])
    })
  })

  it('keeps cmc (cm) from the cache when the user doc omits it', () => {
    const creatureDoc = { ...userDocWithoutMetadata, name: 'Llanowar Elves', scryfallId: 'sf-elves' }
    const creatureCache = { ...cacheEntry, cmc: 1, type_line: 'Creature — Elf Druid', rarity: 'uncommon', power: '1', toughness: '1' }
    const entry = toIndexCard('card-2', mergeScryfallMetadata(creatureDoc, creatureCache))
    expect(entry.cm).toBe(1)
    expect(entry.pw).toBe('1')
    expect(entry.to).toBe('1')
    expect(entry.r).toBe('u')
  })

  // NOTE (review round LOW): this test PASSES with the metadata-join defect
  // planted — with no merge, both sides come out equally blank and still
  // compare equal. It locks "toIndexCard is a pure function of its input,
  // status is not entangled with anything else"; it is NOT the sensor for
  // this ticket's bug. That sensor is the "preserves Scryfall metadata"
  // block above, which is what actually went red.
  it('toIndexCard is a pure function of status — flipping st changes st and nothing else', () => {
    const before = toIndexCard('card-1', mergeScryfallMetadata({ ...userDocWithoutMetadata, status: 'sale' }, cacheEntry))
    const after = toIndexCard('card-1', mergeScryfallMetadata({ ...userDocWithoutMetadata, status: 'collection' }, cacheEntry))

    expect(before.st).toBe('sale')
    expect(after.st).toBe('collection')

    const { st: _beforeSt, ...beforeRest } = before
    const { st: _afterSt, ...afterRest } = after
    expect(afterRest).toEqual(beforeRest)
  })

  it('the user document wins over the cache when it DOES carry the metadata', () => {
    const richDoc = {
      ...userDocWithoutMetadata,
      cmc: 3,
      type_line: 'Enchantment',
      colors: ['W'],
      rarity: 'mythic',
    }
    const entry = toIndexCard('card-3', mergeScryfallMetadata(richDoc, cacheEntry))
    expect(entry.t).toBe('Enchantment')
    expect(entry.cm).toBe(3)
    expect(entry.co).toEqual(['W'])
    expect(entry.r).toBe('m')
  })

  it('is a no-op passthrough when there is no cache entry at all (never throws, never blanks the doc values)', () => {
    const richDoc = { ...userDocWithoutMetadata, type_line: 'Instant', cmc: 2 }
    expect(mergeScryfallMetadata(richDoc, null)).toEqual(richDoc)
    expect(mergeScryfallMetadata(richDoc, undefined)).toEqual(richDoc)
    const entry = toIndexCard('card-4', mergeScryfallMetadata(richDoc, null))
    expect(entry.t).toBe('Instant')
    expect(entry.cm).toBe(2)
  })

  it('cmc 0 in the user doc is kept, not overwritten by the cache (?? not ||)', () => {
    const doc = { ...userDocWithoutMetadata, cmc: 0 }
    const merged = mergeScryfallMetadata(doc, { ...cacheEntry, cmc: 5 })
    expect(merged.cmc).toBe(0)
  })

  describe('buildIndexEntry — THE shared entry builder both writers use (review round MEDIUM-3)', () => {
    const dualCache = { ...cacheEntry, card_faces: [{ image_uris: {} }, { image_uris: {} }] }

    it('does the merge itself — same result as toIndexCard(mergeScryfallMetadata(...))', () => {
      const viaHelper = buildIndexEntry('card-1', userDocWithoutMetadata, cacheEntry)
      const viaParts = toIndexCard('card-1', mergeScryfallMetadata(userDocWithoutMetadata, cacheEntry))
      expect(viaHelper).toEqual({ ...viaParts, df: false })
      expect(viaHelper.t).toBe('Basic Land — Forest')
    })

    it('takes df from the CACHE, not from the image JSON — the two writers must agree', () => {
      // A card whose image JSON says dual-faced but which has no cache doc:
      // buildCardIndex has always written df=false for it. The delta path
      // must write false too, or a rebuild and a status change disagree.
      const imageSaysDual = {
        ...userDocWithoutMetadata,
        image: JSON.stringify({ card_faces: [{ image_uris: {} }, { image_uris: {} }] }),
      }
      expect(toIndexCard('card-5', imageSaysDual).df).toBe(true) // raw heuristic
      expect(buildIndexEntry('card-5', imageSaysDual, null).df).toBe(false) // cache is the authority
      expect(buildIndexEntry('card-5', imageSaysDual, cacheEntry).df).toBe(false)
      expect(buildIndexEntry('card-5', imageSaysDual, dualCache).df).toBe(true)
    })

    it('is idempotent — re-running it over an already-merged document changes nothing', () => {
      // The delta path builds entries from the document it read; nothing may
      // depend on that document being "raw" vs already carrying metadata.
      const merged = mergeScryfallMetadata(userDocWithoutMetadata, cacheEntry)
      expect(buildIndexEntry('card-1', merged, cacheEntry)).toEqual(
        buildIndexEntry('card-1', userDocWithoutMetadata, cacheEntry)
      )
    })
  })

  describe('isDualFaced (shared dual-face detection, previously inline in buildCardIndex)', () => {
    it('is true only when 2+ faces carry image_uris', () => {
      expect(isDualFaced({ card_faces: [{ image_uris: {} }, { image_uris: {} }] })).toBe(true)
      expect(isDualFaced({ card_faces: [{ image_uris: {} }, {}] })).toBe(false)
      expect(isDualFaced({ card_faces: [{ image_uris: {} }] })).toBe(false)
      expect(isDualFaced({})).toBe(false)
      expect(isDualFaced(null)).toBe(false)
    })
  })
})
