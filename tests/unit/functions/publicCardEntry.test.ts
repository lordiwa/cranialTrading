/**
 * TASK-247 (tanda 1/4): entry-building module for the public-profile index
 * this ticket replaces the old ~60-card in-memory scan with. Same technique
 * as cardIndexEntry.test.ts (TASK-245): a dependency-free CommonJS module
 * under functions/lib/ that vitest can require() and actually EXECUTE
 * without firebase-admin (functions/ still has no emulator harness —
 * TASK-236). This is a real sensor, not a source-text assertion.
 *
 * AC9 is the core of this tanda: 380/5145 (7.4%) cached public cards have
 * neither `colors` nor `color_identity` at the document root; 115 are
 * dual-faced cards whose colors live only in `card_faces[].colors`; 17
 * scryfallId of public_cards (5145/5162 = 99.67% coverage) have NO
 * scryfall_cache document at all. A fix that leaves that 7.4% mis-filtered
 * repeats the exact shape of bug this ticket exists to close.
 *
 * AC10: publicChunkId must derive from a hash of scryfallId, never from
 * array position — the TASK-208/TASK-238 family of bugs (chunks that lose
 * entries, an index that empties itself and doesn't repair) all trace back
 * to position-based chunking.
 */
import { buildPublicEntry, publicChunkId } from '../../../functions/lib/publicCardEntry.js'

/** A user's public_cards document, as read today. */
const basePublicCard = {
  scryfallId: 'sf-forest-1',
  cardId: 'card-1',
  name: 'Forest',
  quantity: 4,
  price: 0.1,
  status: 'sale',
  foil: false,
  condition: 'NM',
  setCode: 'znr',
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

    it('carries identity, name (+ lowercase for substring search), quantity, price, status, foil, condition, setCode', () => {
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
    })

    it('carries Scryfall metadata: type_line, cmc, colors, rarity (1 char), keywords, legalities compacted to the legal-format list', () => {
      expect(entry.t).toBe('Basic Land — Forest')
      expect(entry.cm).toBe(0)
      expect(entry.co).toEqual(['G'])
      expect(entry.r).toBe('c')
      expect(entry.kw).toEqual([])
      expect(entry.lg).toEqual(['modern', 'pioneer'])
    })

    it('is compact — stays well under raw-copy size (measured ~230B target vs ~832B raw)', () => {
      const bytes = Buffer.byteLength(JSON.stringify(entry), 'utf-8')
      expect(bytes).toBeLessThan(400)
    })

    it('is not flagged missing metadata (x) when the cache has usable colors', () => {
      expect(entry.x).toBeFalsy()
    })
  })

  describe('AC9 — color fallback chain: colors -> color_identity -> union of card_faces[].colors', () => {
    it('uses colors when present', () => {
      const entry = buildPublicEntry(basePublicCard, { colors: ['G'], color_identity: ['G', 'U'] })
      expect(entry.co).toEqual(['G'])
    })

    it('falls back to color_identity when colors is absent', () => {
      const entry = buildPublicEntry(basePublicCard, { color_identity: ['U', 'B'] })
      expect(entry.co).toEqual(['U', 'B'])
    })

    it('falls back to the union of card_faces[].colors when neither colors nor color_identity exist at the root — the 115 measured dual-faced cards', () => {
      // Measured example: face[0].colors exists, root color_identity also
      // exists — but this test locks the case where ONLY card_faces carries
      // color data, which is the actual gap AC9 requires closing.
      const cache = {
        card_faces: [
          { colors: ['U'], type_line: 'Creature — Human Wizard' },
          { colors: ['R'], type_line: 'Creature — Human Warrior' },
        ],
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

    it('is empty (not thrown, not undefined) when the card genuinely has none of the three — colorless', () => {
      const entry = buildPublicEntry(basePublicCard, { type_line: 'Artifact' })
      expect(entry.co).toEqual([])
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

  describe('AC9 — the 17 scryfallId with no scryfall_cache document', () => {
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
      expect(entry.cm).toBe(0)
      expect(entry.r).toBe('')
      expect(entry.kw).toEqual([])
      expect(entry.lg).toEqual([])
    })

    it('marks the entry with the explicit missing-metadata flag (x: 1) so the query layer and reconciliation can find it', () => {
      expect(buildPublicEntry(basePublicCard, null).x).toBe(1)
      expect(buildPublicEntry(basePublicCard, undefined).x).toBe(1)
    })

    it('does NOT set the flag when a cache document exists, even a sparse one', () => {
      expect(buildPublicEntry(basePublicCard, {}).x).toBeFalsy()
    })
  })

  describe('AC10 — publicChunkId derives from a scryfallId hash, never from array position', () => {
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

    it('stays within [0, totalChunks)', () => {
      for (const id of ['x', 'sf-forest-1', 'Leyline Binding', 'Scalding Tarn', 'Cranial Plating', "Kogla the Titan Ape"]) {
        const chunk = publicChunkId(id, 7)
        expect(chunk).toBeGreaterThanOrEqual(0)
        expect(chunk).toBeLessThan(7)
      }
    })

    it('distributes across chunks with reasonable spread (not everything landing in one bucket)', () => {
      const totalChunks = 8
      const buckets = new Set<number>()
      for (let i = 0; i < 200; i++) {
        buckets.add(publicChunkId(`scryfall-id-${i}`, totalChunks))
      }
      expect(buckets.size).toBeGreaterThan(1)
    })
  })
})
