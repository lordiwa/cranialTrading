import { parseSetListCodes, isKnownMtgjsonSet } from '@/services/mtgjsonSetList'

describe('mtgjsonSetList', () => {
  describe('parseSetListCodes', () => {
    it('extracts codes from data[].code', () => {
      const json = {
        meta: { version: '5.2.2', date: '2026-06-07' },
        data: [
          { code: '10E', name: 'Tenth Edition' },
          { code: 'LEA', name: 'Limited Edition Alpha' },
        ],
      }
      const codes = parseSetListCodes(json)
      expect(codes).toBeInstanceOf(Set)
      expect(codes.has('10E')).toBe(true)
      expect(codes.has('LEA')).toBe(true)
      expect(codes.size).toBe(2)
    })

    it('uppercases codes that arrive in lower/mixed case', () => {
      const json = {
        data: [
          { code: 'plst' },
          { code: 'TkHm' },
        ],
      }
      const codes = parseSetListCodes(json)
      expect(codes.has('PLST')).toBe(true)
      expect(codes.has('TKHM')).toBe(true)
      // original casing should NOT be present
      expect(codes.has('plst')).toBe(false)
      expect(codes.has('TkHm')).toBe(false)
    })

    it('returns an empty set when data is missing', () => {
      expect(parseSetListCodes({}).size).toBe(0)
      expect(parseSetListCodes({ meta: {} }).size).toBe(0)
    })

    it('returns an empty set when data is empty', () => {
      expect(parseSetListCodes({ data: [] }).size).toBe(0)
    })

    it('returns an empty set for null / undefined / non-object input', () => {
      expect(parseSetListCodes(null).size).toBe(0)
      expect(parseSetListCodes(undefined).size).toBe(0)
      expect(parseSetListCodes('nope').size).toBe(0)
      expect(parseSetListCodes(42).size).toBe(0)
    })

    it('skips entries with missing or non-string code', () => {
      const json = {
        data: [
          { code: '10E' },
          { name: 'no code here' },
          { code: 123 },
          { code: null },
          { code: '' },
          { code: 'MOM' },
        ],
      }
      const codes = parseSetListCodes(json)
      expect(codes.has('10E')).toBe(true)
      expect(codes.has('MOM')).toBe(true)
      expect(codes.size).toBe(2)
    })

    it('handles a non-array data field gracefully', () => {
      expect(parseSetListCodes({ data: { code: 'X' } }).size).toBe(0)
      expect(parseSetListCodes({ data: 'string' }).size).toBe(0)
    })
  })

  describe('isKnownMtgjsonSet', () => {
    const validCodes = new Set(['10E', 'LEA', 'MOM'])

    it('returns true for a known code (exact case)', () => {
      expect(isKnownMtgjsonSet('10E', validCodes)).toBe(true)
    })

    it('matches case-insensitively (lowercase scryfall code)', () => {
      expect(isKnownMtgjsonSet('mom', validCodes)).toBe(true)
      expect(isKnownMtgjsonSet('LeA', validCodes)).toBe(true)
    })

    it('returns false for a code not in the set', () => {
      expect(isKnownMtgjsonSet('PLST', validCodes)).toBe(false)
      expect(isKnownMtgjsonSet('ptoken', validCodes)).toBe(false)
    })

    it('returns false for empty / falsy setCode', () => {
      expect(isKnownMtgjsonSet('', validCodes)).toBe(false)
    })

    describe('graceful degradation when validCodes is unavailable', () => {
      it('returns true (do not pre-filter) when validCodes is empty', () => {
        // An empty set means the SetList never loaded; we must NOT block any
        // fetch, falling back to the legacy attempt-and-catch-404 behavior.
        expect(isKnownMtgjsonSet('10E', new Set())).toBe(true)
        expect(isKnownMtgjsonSet('PLST', new Set())).toBe(true)
      })

      it('returns true when validCodes is null / undefined', () => {
        expect(isKnownMtgjsonSet('PLST', null)).toBe(true)
        expect(isKnownMtgjsonSet('PLST', undefined)).toBe(true)
      })
    })
  })
})
