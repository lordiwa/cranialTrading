/**
 * TASK-286 REABIERTO (2026-08-26): a mock Firestore accepts `undefined`
 * without complaint, which is exactly why the original TASK-286 tests
 * didn't catch this — none of them exercised the real rejection rule.
 * MEASURED against the deployed dev function: a bare Lightning Bolt (an
 * instant, so no power/toughness anywhere) blew up bulkImportCards with
 *
 *   Error: Value for argument "data" is not a valid Firestore document.
 *   Cannot use "undefined" as a Firestore value (found in field "power").
 *
 * This file does NOT mock Firestore and accept undefined — it reimplements
 * Firestore's own rejection rule (assertFirestoreSafe, below) and runs
 * pickDefinedFields' real output through it, so a regression here fails
 * the same way the real SDK failed, for the same reason.
 */
import { pickDefinedFields } from '../../../functions/lib/pickDefinedFields.js'
import { mergeScryfallMetadata } from '../../../functions/lib/cardIndexEntry.js'

const USER_CARD_FIELDS = new Set([
  'scryfallId', 'quantity', 'condition', 'foil', 'status', 'public',
  'price', 'language', 'name', 'edition', 'setCode', 'image', 'deckName',
  'cmc', 'type_line', 'colors', 'rarity', 'power', 'toughness',
  'full_art', 'produced_mana', 'keywords', 'legalities', 'oracle_text',
])

/**
 * Mirrors Firestore's own `WriteBatch.set` validation: a document value
 * of `undefined` is rejected, naming the offending field, exactly like
 * the real SDK error captured above. Passing this is what actually proves
 * a payload is safe to batch.set — a mock that silently accepts undefined
 * proves nothing.
 */
function assertFirestoreSafe(doc: Record<string, unknown>) {
  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined) {
      throw new Error(
        `Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "${key}").`
      )
    }
  }
}

describe('pickDefinedFields', () => {
  it('drops keys whose value is undefined', () => {
    const result = pickDefinedFields({ name: 'Forest', power: undefined, quantity: 1 }, USER_CARD_FIELDS)
    expect(result).toEqual({ name: 'Forest', quantity: 1 })
    expect('power' in result).toBe(false)
  })

  it('keeps a legitimate falsy value (0, "", false) — only undefined is dropped', () => {
    const result = pickDefinedFields({ cmc: 0, foil: false, edition: '' }, USER_CARD_FIELDS)
    expect(result).toEqual({ cmc: 0, foil: false, edition: '' })
  })

  it('still filters to USER_CARD_FIELDS (unrelated to the undefined fix)', () => {
    const result = pickDefinedFields({ name: 'Forest', notAUserField: 'x' }, USER_CARD_FIELDS)
    expect(result).toEqual({ name: 'Forest' })
  })

  it('the regression: a mock that accepts undefined proves nothing — this does not', () => {
    const permissiveMock = { set: (doc: Record<string, unknown>) => doc } // accepts anything, catches nothing
    const withUndefined = { name: 'Lightning Bolt', power: undefined }
    expect(() => permissiveMock.set(withUndefined)).not.toThrow() // the trap TASK-286's first pass fell into
    expect(() => assertFirestoreSafe(withUndefined)).toThrow(/power/)
  })
})

describe('pickDefinedFields + mergeScryfallMetadata — the Lightning Bolt scenario', () => {
  // The exact repro measured against dev 2026-08-26T23:41:26Z: a bare
  // client card (old-client scenario TASK-286 exists to cover — no
  // type_line/colors/rarity/cmc, no _cacheFields) for an instant, enriched
  // against a scryfall_cache entry that — like Scryfall's own API for a
  // non-creature — simply has no power/toughness/produced_mana fields.
  const bareCard = {
    scryfallId: '7673784e-db4b-43a1-8d55-1bb9fc1e284f',
    name: 'Lightning Bolt',
    quantity: 1,
    condition: 'NM',
    foil: false,
    status: 'collection',
    price: 0.5,
  }
  const scryfallCacheEntry = {
    type_line: 'Instant',
    colors: ['R'],
    rarity: 'common',
    cmc: 1,
    full_art: false,
    keywords: [],
    legalities: { modern: 'legal' },
    // no power, toughness, or produced_mana — exactly like Scryfall's real
    // response for an instant.
  }

  it('mergeScryfallMetadata alone leaves power/toughness/produced_mana as literal undefined keys', () => {
    const merged = mergeScryfallMetadata(bareCard, scryfallCacheEntry)
    expect('power' in merged).toBe(true)
    expect(merged.power).toBeUndefined()
    expect('toughness' in merged).toBe(true)
    expect('produced_mana' in merged).toBe(true)
    // proves the write WOULD have failed before this fix
    expect(() => assertFirestoreSafe(merged)).toThrow(/power/)
  })

  it('pickDefinedFields on the merged result is a valid Firestore document (the fix)', () => {
    const merged = mergeScryfallMetadata(bareCard, scryfallCacheEntry)
    const payload = pickDefinedFields(merged, USER_CARD_FIELDS)
    expect(() => assertFirestoreSafe(payload)).not.toThrow()
    expect('power' in payload).toBe(false)
    expect('toughness' in payload).toBe(false)
    expect('produced_mana' in payload).toBe(false)
    // real data survives
    expect(payload.name).toBe('Lightning Bolt')
    expect(payload.type_line).toBe('Instant')
    expect(payload.cmc).toBe(1)
  })

  // AC3 (TASK-286 original): each field mergeScryfallMetadata fills via
  // `||`/`??` can independently come out undefined once BOTH sides lack
  // it — this is the "family", not a single field. cmc/rarity/full_art/
  // keywords/legalities are included for completeness even though a
  // healthy scryfall_cache doc almost always carries them.
  const fieldsThatCanGoUndefined: Array<[string, Record<string, unknown>]> = [
    ['power', { type_line: 'Instant' }],
    ['toughness', { type_line: 'Instant' }],
    ['produced_mana', { type_line: 'Instant' }],
    ['colors', { type_line: 'Instant' }], // absent on transform/modal_dfc cards too
    ['type_line', { colors: ['R'] }], // absent on some multi-face layouts
    ['cmc', { type_line: 'Instant' }], // absent on a pre-field-addition cache doc
    ['rarity', { type_line: 'Instant' }],
    ['full_art', { type_line: 'Instant' }],
    ['keywords', { type_line: 'Instant' }],
    ['legalities', { type_line: 'Instant' }],
  ]

  it.each(fieldsThatCanGoUndefined)(
    'neither the user card nor the cache carrying "%s" never lands as undefined in the write payload',
    (field, cacheWithoutField) => {
      const merged = mergeScryfallMetadata({ scryfallId: 'x', name: 'Test Card' }, cacheWithoutField)
      const payload = pickDefinedFields(merged, USER_CARD_FIELDS)
      expect(field in payload).toBe(false)
      expect(() => assertFirestoreSafe(payload)).not.toThrow()
    }
  )
})
