import {
  isEligibleForPublicCards,
  computePublicCardId,
  diffPublicCardIds,
  assertNoUndefinedFields,
  toAdminWritableDate,
  chunkList,
} from '../../../scripts/repairPublicCardsParityHelpers.mjs'

describe('isEligibleForPublicCards (TASK-290) — mirrors isPublicCard\'s write-gate', () => {
  it('eligible: status=sale, public=true', () => {
    expect(isEligibleForPublicCards({ status: 'sale', public: true })).toBe(true)
  })

  it('eligible: status=trade, public=true', () => {
    expect(isEligibleForPublicCards({ status: 'trade', public: true })).toBe(true)
  })

  it('NOT eligible: status=collection, even with public=true (TASK-085 whitelist, not a blacklist)', () => {
    expect(isEligibleForPublicCards({ status: 'collection', public: true })).toBe(false)
  })

  it('NOT eligible: status=wishlist, even with public=true — public_cards is anonymous-readable and must never leak a wishlist card', () => {
    expect(isEligibleForPublicCards({ status: 'wishlist', public: true })).toBe(false)
  })

  it('NOT eligible: status=sale but public=false', () => {
    expect(isEligibleForPublicCards({ status: 'sale', public: false })).toBe(false)
  })

  it('NOT eligible: status=sale but public is missing entirely (legacy card, strict on public)', () => {
    expect(isEligibleForPublicCards({ status: 'sale' })).toBe(false)
  })
})

describe('computePublicCardId (TASK-290) — must match the SUT\'s syncCardToPublic id shape exactly', () => {
  it('composes userId_cardId', () => {
    expect(computePublicCardId('uid1', 'card1')).toBe('uid1_card1')
  })

  it('throws on a missing userId or cardId — a silently wrong id is exactly what breaks idempotency (duplicates instead of upserts)', () => {
    expect(() => computePublicCardId('', 'card1')).toThrow()
    expect(() => computePublicCardId('uid1', '')).toThrow()
  })
})

describe('diffPublicCardIds (TASK-290)', () => {
  it('reports missing ids as toCreate and stale ids as toDelete', () => {
    const expected = ['a', 'b', 'c']
    const existing = ['a', 'z']
    const { toCreate, toDelete } = diffPublicCardIds(expected, existing)
    expect(toCreate).toEqual(['b', 'c'])
    expect(toDelete).toEqual(['z'])
  })

  it('growth case (TASK-290\'s actual scenario): 400 existing, 2202 expected, existing is a subset — zero orphans', () => {
    const existing = Array.from({ length: 400 }, (_, i) => `id${i}`)
    const expected = Array.from({ length: 2202 }, (_, i) => `id${i}`)
    const { toCreate, toDelete } = diffPublicCardIds(expected, existing)
    expect(toCreate).toHaveLength(1802)
    expect(toDelete).toHaveLength(0)
  })

  it('idempotent: running the diff again with existing === expected reports nothing to do', () => {
    const ids = ['a', 'b', 'c']
    const { toCreate, toDelete } = diffPublicCardIds(ids, ids)
    expect(toCreate).toEqual([])
    expect(toDelete).toEqual([])
  })

  it('orphan case: a card that stopped being eligible (sold/made private/deleted) is flagged for deletion', () => {
    const expected = ['a']
    const existing = ['a', 'orphan-of-a-deleted-card']
    const { toDelete } = diffPublicCardIds(expected, existing)
    expect(toDelete).toEqual(['orphan-of-a-deleted-card'])
  })
})

describe('assertNoUndefinedFields (TASK-290) — the candado for the measured mock-vs-real Firestore divergence', () => {
  it('passes through a doc with no undefined fields', () => {
    const doc = { a: 1, b: 'x', c: null, d: false }
    expect(assertNoUndefinedFields(doc)).toBe(doc)
  })

  it('throws when any field is undefined — this is the exact failure mode a mock would silently accept', () => {
    const doc = { a: 1, b: undefined }
    expect(() => assertNoUndefinedFields(doc, 'uid1_card1')).toThrow(/uid1_card1/)
    expect(() => assertNoUndefinedFields(doc)).toThrow(/undefined field/)
  })

  it('names every undefined field, not just the first', () => {
    const doc = { a: undefined, b: 1, c: undefined }
    expect(() => assertNoUndefinedFields(doc)).toThrow(/a, c/)
  })
})

describe('toAdminWritableDate (TASK-290) — converts the client SDK Timestamp buildPublicCardDoc stamps into what admin will accept', () => {
  it('calls .toDate() on a Timestamp-shaped value', () => {
    const fakeDate = new Date('2026-09-16T00:00:00Z')
    const fakeTimestamp = { toDate: () => fakeDate }
    expect(toAdminWritableDate(fakeTimestamp)).toBe(fakeDate)
  })

  it('throws on a plain object with no .toDate (e.g. already a Date, or malformed)', () => {
    expect(() => toAdminWritableDate({})).toThrow()
    expect(() => toAdminWritableDate(null)).toThrow()
  })
})

describe('chunkList (TASK-290) — Firestore batch size guard', () => {
  it('splits into fixed-size chunks', () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('empty input yields no chunks', () => {
    expect(chunkList([], 400)).toEqual([])
  })
})
