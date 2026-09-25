import { describe, expect, it } from 'vitest'
import {
  buildOriginalSlots,
  computeDeckMigrationOps,
  computeDeckSlotOps,
  type DeckRowAllocation,
  type DeckSlot,
  type DeckSlotOp,
} from '@/utils/deckSlotDiff'

const slot = (mb = 0, sb = 0): DeckSlot => ({ mb, sb })

describe('buildOriginalSlots', () => {
  it('aggregates allocations from all related cards into per-deck mb/sb slots', () => {
    const allocsByCardId = new Map<string, { deckId: string; quantity: number; isInSideboard: boolean }[]>([
      ['owned-1', [{ deckId: 'D1', quantity: 1, isInSideboard: false }]],
      ['wish-1', [
        { deckId: 'D1', quantity: 9, isInSideboard: false },
        { deckId: 'D1', quantity: 5, isInSideboard: true },
      ]],
    ])
    const slots = buildOriginalSlots(['owned-1', 'wish-1'], allocsByCardId)
    expect(slots.get('D1')).toEqual({ mb: 10, sb: 5 })
  })

  it('returns empty map when no allocations exist', () => {
    const slots = buildOriginalSlots([], new Map())
    expect(slots.size).toBe(0)
  })

  it('handles multiple decks independently', () => {
    const allocsByCardId = new Map([
      ['c-1', [
        { deckId: 'D1', quantity: 3, isInSideboard: false },
        { deckId: 'D2', quantity: 2, isInSideboard: true },
      ]],
    ])
    const slots = buildOriginalSlots(['c-1'], allocsByCardId)
    expect(slots.get('D1')).toEqual({ mb: 3, sb: 0 })
    expect(slots.get('D2')).toEqual({ mb: 0, sb: 2 })
  })
})

describe('computeDeckSlotOps — diff per (deck, board)', () => {
  it('no ops when target equals original', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(2, 1)]]),
      targetSlots: { D1: slot(2, 1) },
      relatedCardIds: ['owned-1', 'wish-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual([])
  })

  it('mb change only — emits deallocate-all for mb + reallocate for mb (sb untouched)', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(10, 5)]]),
      targetSlots: { D1: slot(4, 5) },
      relatedCardIds: ['owned-1', 'wish-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: false },
      { type: 'deallocate', deckId: 'D1', cardId: 'wish-1', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'owned-1', quantity: 4, isInSideboard: false },
    ])
  })

  it('sb change only — touches sb across all related cardIds, leaves mb intact', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(2, 5)]]),
      targetSlots: { D1: slot(2, 0) },
      relatedCardIds: ['owned-1', 'wish-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: true },
      { type: 'deallocate', deckId: 'D1', cardId: 'wish-1', isInSideboard: true },
    ])
  })

  it('both mb and sb change — emits both groups in deterministic order (mb first, then sb)', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(1, 1)]]),
      targetSlots: { D1: slot(2, 3) },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'owned-1', quantity: 2, isInSideboard: false },
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: true },
      { type: 'allocate', deckId: 'D1', cardId: 'owned-1', quantity: 3, isInSideboard: true },
    ])
  })

  it('skips allocate when target=0 — only deallocates', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(3, 0)]]),
      targetSlots: { D1: slot(0, 0) },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: false },
    ])
  })

  it('skips deallocate when original=0 — only allocates new', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map(),
      targetSlots: { D1: slot(2, 1) },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'allocate', deckId: 'D1', cardId: 'owned-1', quantity: 2, isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'owned-1', quantity: 1, isInSideboard: true },
    ])
  })

  it('processes multiple decks in input order', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }, { deckId: 'D2' }],
      originalSlots: new Map([['D1', slot(1, 0)], ['D2', slot(0, 0)]]),
      targetSlots: { D1: slot(2, 0), D2: slot(0, 1) },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    const deckOrder = ops.map(o => o.deckId)
    const firstD2 = deckOrder.indexOf('D2')
    const lastD1 = deckOrder.lastIndexOf('D1')
    expect(lastD1).toBeLessThan(firstD2)
  })

  it('skips allocate when ownedCardId is null (no destination)', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(2, 0)]]),
      targetSlots: { D1: slot(3, 0) },
      relatedCardIds: ['owned-1'],
      ownedCardId: null,
    })
    expect(ops.find(o => o.type === 'allocate')).toBeUndefined()
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'owned-1', isInSideboard: false },
    ])
  })

  it('handles deck not present in originalSlots map (treats as { mb:0, sb:0 })', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map(),
      targetSlots: { D1: slot(0, 0) },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual([])
  })

  // TASK-318 AC5 regression: a condition/foil/print change with UNCHANGED deck
  // allocations previously emitted NO ops at all (targetQty === origQty short-
  // circuited the loop), leaving the deck pointing at the deleted old-identity
  // cardId. identityChanged forces the migrate-in-place even when qty is stable.
  it('identityChanged=true migrates an unchanged allocation onto the new cardId (was a no-op before TASK-318)', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map([['D1', slot(2, 0)]]),
      targetSlots: { D1: slot(2, 0) },
      relatedCardIds: ['old-card-id'],
      ownedCardId: 'new-card-id',
      identityChanged: true,
    })
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'old-card-id', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'new-card-id', quantity: 2, isInSideboard: false },
    ])
  })

  it('identityChanged=true is a true no-op when the deck has no allocation for this card at all', () => {
    const ops = computeDeckSlotOps({
      decks: [{ deckId: 'D1' }],
      originalSlots: new Map(),
      targetSlots: { D1: slot(0, 0) },
      relatedCardIds: ['old-card-id'],
      ownedCardId: 'new-card-id',
      identityChanged: true,
    })
    expect(ops).toEqual([])
  })
})

describe('computeDeckMigrationOps — TASK-318 H7: per-row migration, no aggregation', () => {
  // Regression for R1 (rev4 probe): two source rows (sale x3, trade x2) both
  // allocated to the SAME deck used to get merged into one total (5) and
  // reallocated onto a single destination row — the sale row's own quantity
  // (3) capped the allocate call, and the leftover 2 silently overflowed
  // into a NEW wishlist row instead of landing on the trade row.
  it('migrates each row to its own mapped id, preserving the per-status split (no overflow)', () => {
    const rows: DeckRowAllocation[] = [
      { deckId: 'D1', cardId: 'nm-sale', mb: 3, sb: 0 },
      { deckId: 'D1', cardId: 'nm-trade', mb: 2, sb: 0 },
    ]
    const idByCardId = new Map([['nm-sale', 'lp-sale'], ['nm-trade', 'lp-trade']])
    const ops = computeDeckMigrationOps(rows, idByCardId)
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'nm-sale', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'lp-sale', quantity: 3, isInSideboard: false },
      { type: 'deallocate', deckId: 'D1', cardId: 'nm-trade', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'lp-trade', quantity: 2, isInSideboard: false },
    ])
  })

  it('migrates mb and sb independently for a single row', () => {
    const rows: DeckRowAllocation[] = [{ deckId: 'D1', cardId: 'nm', mb: 3, sb: 2 }]
    const idByCardId = new Map([['nm', 'lp']])
    const ops = computeDeckMigrationOps(rows, idByCardId)
    expect(ops).toEqual<DeckSlotOp[]>([
      { type: 'deallocate', deckId: 'D1', cardId: 'nm', isInSideboard: false },
      { type: 'allocate', deckId: 'D1', cardId: 'lp', quantity: 3, isInSideboard: false },
      { type: 'deallocate', deckId: 'D1', cardId: 'nm', isInSideboard: true },
      { type: 'allocate', deckId: 'D1', cardId: 'lp', quantity: 2, isInSideboard: true },
    ])
  })

  // A row already at its own mapped id (destination-only row that's already
  // its own canonical, or identity genuinely unchanged) must not be touched
  // at all — no dealloc/realloc no-op churn.
  it('skips a row whose mapped id is itself (nothing to move)', () => {
    const rows: DeckRowAllocation[] = [{ deckId: 'D1', cardId: 'lp-existing', mb: 2, sb: 0 }]
    const idByCardId = new Map([['lp-existing', 'lp-existing']])
    expect(computeDeckMigrationOps(rows, idByCardId)).toEqual([])
  })

  it('skips a row with no allocation at all (mb=0, sb=0)', () => {
    const rows: DeckRowAllocation[] = [{ deckId: 'D1', cardId: 'nm', mb: 0, sb: 0 }]
    const idByCardId = new Map([['nm', 'lp']])
    expect(computeDeckMigrationOps(rows, idByCardId)).toEqual([])
  })

  it('falls back to the row\'s own id when no mapping exists (treated as unmapped, no-op)', () => {
    const rows: DeckRowAllocation[] = [{ deckId: 'D1', cardId: 'nm', mb: 3, sb: 0 }]
    expect(computeDeckMigrationOps(rows, new Map())).toEqual([])
  })
})
