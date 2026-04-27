import { describe, expect, it } from 'vitest'
import { makeCard } from '../helpers/fixtures'
import {
  buildOriginalDistribution,
  computeStatusOperations,
  findCardByIdentity,
  findCardByPrint,
  findPrintMatches,
  type CardIdentity,
} from '@/utils/cardSaveDiff'
import type { Card } from '@/types/card'

const ident = (overrides: Partial<CardIdentity> = {}): CardIdentity => ({
  scryfallId: 'scryfall-abc',
  edition: 'Magic 2021',
  condition: 'NM',
  foil: false,
  ...overrides,
})

describe('findCardByIdentity', () => {
  it('matches on (status, scryfallId, edition, condition, foil) — strict', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', condition: 'NM', foil: false }),
      makeCard({ id: 'b', status: 'collection', condition: 'LP', foil: false }),
      makeCard({ id: 'c', status: 'collection', condition: 'NM', foil: true }),
      makeCard({ id: 'd', status: 'sale', condition: 'NM', foil: false }),
    ]
    expect(findCardByIdentity(cards, 'collection', ident({ condition: 'NM', foil: false }))?.id).toBe('a')
    expect(findCardByIdentity(cards, 'collection', ident({ condition: 'LP', foil: false }))?.id).toBe('b')
    expect(findCardByIdentity(cards, 'collection', ident({ condition: 'NM', foil: true }))?.id).toBe('c')
    expect(findCardByIdentity(cards, 'sale', ident())?.id).toBe('d')
  })

  it('returns undefined when no match', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection' })]
    expect(findCardByIdentity(cards, 'wishlist', ident())).toBeUndefined()
  })

  it('does NOT collapse different conditions/foils into same identity (B1 regression)', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', condition: 'NM', quantity: 2 }),
      makeCard({ id: 'b', status: 'collection', condition: 'LP', quantity: 1 }),
    ]
    const nmHit = findCardByIdentity(cards, 'collection', ident({ condition: 'NM' }))
    const lpHit = findCardByIdentity(cards, 'collection', ident({ condition: 'LP' }))
    expect(nmHit?.id).toBe('a')
    expect(lpHit?.id).toBe('b')
    expect(nmHit?.quantity).toBe(2)
    expect(lpHit?.quantity).toBe(1)
  })
})

describe('buildOriginalDistribution', () => {
  it('sums quantities per status only for matching identity', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', condition: 'NM', quantity: 2 }),
      makeCard({ id: 'b', status: 'sale', condition: 'NM', quantity: 1 }),
      makeCard({ id: 'c', status: 'collection', condition: 'LP', quantity: 1 }),
      makeCard({ id: 'd', status: 'collection', condition: 'NM', foil: true, quantity: 1 }),
    ]
    const dist = buildOriginalDistribution(cards, ident({ condition: 'NM', foil: false }))
    expect(dist).toEqual({ collection: 2, sale: 1, trade: 0, wishlist: 0 })
  })

  it('returns zeros when no cards match identity', () => {
    expect(buildOriginalDistribution([], ident())).toEqual({ collection: 0, sale: 0, trade: 0, wishlist: 0 })
  })
})

describe('computeStatusOperations — single-status changes', () => {
  it('add: target=1, no existing → create', () => {
    const ops = computeStatusOperations(
      { collection: 1, sale: 0, trade: 0, wishlist: 0 },
      ident(),
      [],
    )
    expect(ops).toEqual([{ type: 'create', status: 'collection', quantity: 1 }])
  })

  it('remove: target=0, existing → delete', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 1 })]
    const ops = computeStatusOperations(
      { collection: 0, sale: 0, trade: 0, wishlist: 0 },
      ident(),
      cards,
    )
    expect(ops).toEqual([{ type: 'delete', status: 'collection', cardId: 'a', quantity: 0 }])
  })

  it('update: target=3, existing qty=2 → update', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 2 })]
    const ops = computeStatusOperations(
      { collection: 3, sale: 0, trade: 0, wishlist: 0 },
      ident(),
      cards,
    )
    expect(ops).toEqual([{ type: 'update', status: 'collection', cardId: 'a', quantity: 3 }])
  })

  it('no-op: target=existing.quantity → empty ops', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 2 })]
    const ops = computeStatusOperations(
      { collection: 2, sale: 0, trade: 0, wishlist: 0 },
      ident(),
      cards,
    )
    expect(ops).toEqual([])
  })
})

describe('computeStatusOperations — grouped multi-status changes', () => {
  it('move 1 from collection to sale (collection -1, sale +1)', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 1 })]
    const ops = computeStatusOperations(
      { collection: 0, sale: 1, trade: 0, wishlist: 0 },
      ident(),
      cards,
    )
    expect(ops).toEqual([
      { type: 'delete', status: 'collection', cardId: 'a', quantity: 0 },
      { type: 'create', status: 'sale', quantity: 1 },
    ])
  })

  it('grouped 4-status change: collection -2, sale +1, trade +1, wishlist +1', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 2 })]
    const ops = computeStatusOperations(
      { collection: 0, sale: 1, trade: 1, wishlist: 1 },
      ident(),
      cards,
    )
    expect(ops).toEqual([
      { type: 'delete', status: 'collection', cardId: 'a', quantity: 0 },
      { type: 'create', status: 'sale', quantity: 1 },
      { type: 'create', status: 'trade', quantity: 1 },
      { type: 'create', status: 'wishlist', quantity: 1 },
    ])
  })

  it('partial reduce: collection 4 → 2 (existing) + create wishlist 2', () => {
    const cards: Card[] = [makeCard({ id: 'a', status: 'collection', quantity: 4 })]
    const ops = computeStatusOperations(
      { collection: 2, sale: 0, trade: 0, wishlist: 2 },
      ident(),
      cards,
    )
    expect(ops).toEqual([
      { type: 'update', status: 'collection', cardId: 'a', quantity: 2 },
      { type: 'create', status: 'wishlist', quantity: 2 },
    ])
  })

  it('updates existing rows for all 4 statuses simultaneously', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', quantity: 1 }),
      makeCard({ id: 'b', status: 'sale', quantity: 1 }),
      makeCard({ id: 'c', status: 'trade', quantity: 1 }),
      makeCard({ id: 'd', status: 'wishlist', quantity: 1 }),
    ]
    const ops = computeStatusOperations(
      { collection: 5, sale: 4, trade: 3, wishlist: 2 },
      ident(),
      cards,
    )
    expect(ops).toEqual([
      { type: 'update', status: 'collection', cardId: 'a', quantity: 5 },
      { type: 'update', status: 'sale', cardId: 'b', quantity: 4 },
      { type: 'update', status: 'trade', cardId: 'c', quantity: 3 },
      { type: 'update', status: 'wishlist', cardId: 'd', quantity: 2 },
    ])
  })
})

describe('computeStatusOperations — B1 regression (multi-condition isolation)', () => {
  it('NM and LP rows in same status are independent — touching NM does NOT inflate LP', () => {
    const cards: Card[] = [
      makeCard({ id: 'nm', status: 'collection', condition: 'NM', quantity: 2 }),
      makeCard({ id: 'lp', status: 'collection', condition: 'LP', quantity: 1 }),
    ]
    // User opened modal for NM, save sin cambios → debe ser no-op para NM y LP debe quedar intacta
    const ops = computeStatusOperations(
      { collection: 2, sale: 0, trade: 0, wishlist: 0 },
      ident({ condition: 'NM' }),
      cards,
    )
    expect(ops).toEqual([])

    // User aumenta NM a 3 → solo update a NM. LP NO debe aparecer en ops.
    const ops2 = computeStatusOperations(
      { collection: 3, sale: 0, trade: 0, wishlist: 0 },
      ident({ condition: 'NM' }),
      cards,
    )
    expect(ops2).toEqual([{ type: 'update', status: 'collection', cardId: 'nm', quantity: 3 }])
    expect(ops2.find(o => o.cardId === 'lp')).toBeUndefined()
  })

  it('foil and non-foil rows are independent identities', () => {
    const cards: Card[] = [
      makeCard({ id: 'reg', status: 'collection', foil: false, quantity: 2 }),
      makeCard({ id: 'foil', status: 'collection', foil: true, quantity: 1 }),
    ]
    const ops = computeStatusOperations(
      { collection: 3, sale: 0, trade: 0, wishlist: 0 },
      ident({ foil: false }),
      cards,
    )
    expect(ops).toEqual([{ type: 'update', status: 'collection', cardId: 'reg', quantity: 3 }])
    expect(ops.find(o => o.cardId === 'foil')).toBeUndefined()
  })

  it('different scryfallId is a different identity (different prints)', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', scryfallId: 'sid-a', status: 'collection', edition: 'Magic 2021', quantity: 2 }),
      makeCard({ id: 'b', scryfallId: 'sid-b', status: 'collection', edition: 'Modern Horizons 2', quantity: 1 }),
    ]
    const ops = computeStatusOperations(
      { collection: 5, sale: 0, trade: 0, wishlist: 0 },
      ident({ scryfallId: 'sid-a', edition: 'Magic 2021' }),
      cards,
    )
    expect(ops).toEqual([{ type: 'update', status: 'collection', cardId: 'a', quantity: 5 }])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// SCRUM-35 Phase D: print-relaxed match + self-healing consolidation
// ────────────────────────────────────────────────────────────────────────────

describe('findCardByPrint — relaxed identity (drops edition)', () => {
  it('matches on scryfallId+condition+foil regardless of edition string', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', edition: 'Lorwyn Eclipsed', condition: 'NM', foil: false }),
      makeCard({ id: 'b', status: 'collection', edition: 'ECL', condition: 'NM', foil: false }),
    ]
    // identity edition mismatches both — but findCardByPrint returns first by print
    const hit = findCardByPrint(cards, 'collection', ident({ edition: 'XYZ' }))
    expect(hit).toBeDefined()
    expect(['a', 'b']).toContain(hit?.id)
  })

  it('respects condition/foil isolation (does NOT collapse them)', () => {
    const cards: Card[] = [
      makeCard({ id: 'nm', condition: 'NM' }),
      makeCard({ id: 'lp', condition: 'LP' }),
    ]
    expect(findCardByPrint(cards, 'collection', ident({ condition: 'NM' }))?.id).toBe('nm')
    expect(findCardByPrint(cards, 'collection', ident({ condition: 'LP' }))?.id).toBe('lp')
  })
})

describe('findPrintMatches — returns all dupes for self-heal', () => {
  it('returns every row sharing scryfallId+condition+foil+status', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', edition: 'Lorwyn Eclipsed' }),
      makeCard({ id: 'b', status: 'collection', edition: 'ECL' }),
      makeCard({ id: 'c', status: 'collection', condition: 'LP' }),
      makeCard({ id: 'd', status: 'wishlist', edition: 'Lorwyn Eclipsed' }),
    ]
    const hits = findPrintMatches(cards, 'collection', ident({ condition: 'NM' }))
    expect(hits.map(h => h.id).sort()).toEqual(['a', 'b'])
  })
})

describe('computeStatusOperations — self-healing consolidation (SCRUM-35 D)', () => {
  it('consolidates legacy duplicates with mismatched edition into canonical row', () => {
    // Bug: stale card_index v2 served edition="ECL" while modal cardData has "Lorwyn Eclipsed".
    // Previous saves CREATED dupes instead of UPDATING. Now save merges them.
    const cards: Card[] = [
      makeCard({ id: 'canonical', status: 'collection', edition: 'Lorwyn Eclipsed', quantity: 6 }),
      makeCard({ id: 'dupe1', status: 'collection', edition: 'ECL', quantity: 3 }),
      makeCard({ id: 'dupe2', status: 'collection', edition: 'ECL', quantity: 3 }),
    ]
    const ops = computeStatusOperations(
      { collection: 6, sale: 0, trade: 0, wishlist: 0 },
      ident({ edition: 'Lorwyn Eclipsed' }),
      cards,
    )
    // Dupes deleted; canonical kept (no qty change; user set target=6 which already matches)
    expect(ops).toContainEqual({ type: 'delete', status: 'collection', cardId: 'dupe1', quantity: 0 })
    expect(ops).toContainEqual({ type: 'delete', status: 'collection', cardId: 'dupe2', quantity: 0 })
    expect(ops.find(o => o.cardId === 'canonical')).toBeUndefined()
  })

  it('picks canonical even when no row matches identity edition (uses first)', () => {
    // All rows have stale "ECL" edition. Pick first as canonical, force-update its edition.
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', edition: 'ECL', quantity: 4 }),
      makeCard({ id: 'b', status: 'collection', edition: 'ECL', quantity: 2 }),
    ]
    const ops = computeStatusOperations(
      { collection: 6, sale: 0, trade: 0, wishlist: 0 },
      ident({ edition: 'Lorwyn Eclipsed' }),
      cards,
    )
    // 'a' is canonical → update to qty 6 (and edition self-heals via cardData in applyStatusOperations)
    // 'b' is dupe → delete
    expect(ops).toContainEqual({ type: 'update', status: 'collection', cardId: 'a', quantity: 6 })
    expect(ops).toContainEqual({ type: 'delete', status: 'collection', cardId: 'b', quantity: 0 })
  })

  it('emits update when canonical edition mismatches even if quantity already matches (force self-heal)', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', edition: 'ECL', quantity: 4 }),
    ]
    const ops = computeStatusOperations(
      { collection: 4, sale: 0, trade: 0, wishlist: 0 },
      ident({ edition: 'Lorwyn Eclipsed' }),
      cards,
    )
    expect(ops).toEqual([{ type: 'update', status: 'collection', cardId: 'a', quantity: 4 }])
  })

  it('target=0 deletes ALL print matches (canonical + dupes)', () => {
    const cards: Card[] = [
      makeCard({ id: 'a', status: 'collection', edition: 'Lorwyn Eclipsed', quantity: 6 }),
      makeCard({ id: 'b', status: 'collection', edition: 'ECL', quantity: 3 }),
    ]
    const ops = computeStatusOperations(
      { collection: 0, sale: 0, trade: 0, wishlist: 0 },
      ident({ edition: 'Lorwyn Eclipsed' }),
      cards,
    )
    expect(ops).toContainEqual({ type: 'delete', status: 'collection', cardId: 'a', quantity: 0 })
    expect(ops).toContainEqual({ type: 'delete', status: 'collection', cardId: 'b', quantity: 0 })
  })

  it('does NOT consolidate across condition/foil boundaries', () => {
    const cards: Card[] = [
      makeCard({ id: 'nm', status: 'collection', condition: 'NM', edition: 'ECL', quantity: 4 }),
      makeCard({ id: 'lp', status: 'collection', condition: 'LP', edition: 'ECL', quantity: 1 }),
    ]
    const ops = computeStatusOperations(
      { collection: 5, sale: 0, trade: 0, wishlist: 0 },
      ident({ condition: 'NM', edition: 'Lorwyn Eclipsed' }),
      cards,
    )
    // Only nm gets touched; lp is untouched (different condition)
    expect(ops).toContainEqual({ type: 'update', status: 'collection', cardId: 'nm', quantity: 5 })
    expect(ops.find(o => o.cardId === 'lp')).toBeUndefined()
  })
})
