import { describe, expect, it } from 'vitest'
import {
  buildOriginalBinderSlots,
  type BinderRowAllocation,
  computeBinderMigrationOps,
  computeBinderSlotOps,
  type BinderSlotOp,
} from '@/utils/binderSlotDiff'

describe('buildOriginalBinderSlots', () => {
  it('aggregates allocations from all related cards into per-binder totals', () => {
    const allocsByCardId = new Map<string, { binderId: string; quantity: number }[]>([
      ['owned-1', [{ binderId: 'B1', quantity: 1 }]],
      ['wish-1', [
        { binderId: 'B1', quantity: 9 },
        { binderId: 'B2', quantity: 2 },
      ]],
    ])
    const slots = buildOriginalBinderSlots(['owned-1', 'wish-1'], allocsByCardId)
    expect(slots.get('B1')).toBe(10)
    expect(slots.get('B2')).toBe(2)
  })

  it('returns empty map when no allocations exist', () => {
    const slots = buildOriginalBinderSlots([], new Map())
    expect(slots.size).toBe(0)
  })

  it('skips related cardIds with no allocations', () => {
    const allocsByCardId = new Map<string, { binderId: string; quantity: number }[]>([
      ['c-1', [{ binderId: 'B1', quantity: 3 }]],
    ])
    const slots = buildOriginalBinderSlots(['c-1', 'c-2', 'c-3'], allocsByCardId)
    expect(slots.get('B1')).toBe(3)
    expect(slots.size).toBe(1)
  })
})

describe('computeBinderSlotOps — diff per binder', () => {
  it('no ops when target equals original', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 4]]),
      targetSlots: { B1: 4 },
      relatedCardIds: ['owned-1', 'wish-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual([])
  })

  it('increment — emits deallocate-all + reallocate target', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 4]]),
      targetSlots: { B1: 5 },
      relatedCardIds: ['owned-1', 'wish-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'owned-1' },
      { type: 'deallocate', binderId: 'B1', cardId: 'wish-1' },
      { type: 'allocate', binderId: 'B1', cardId: 'owned-1', quantity: 5 },
    ])
  })

  it('decrement to zero — only deallocates, no reallocate', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 3]]),
      targetSlots: { B1: 0 },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'owned-1' },
    ])
  })

  it('add new — only allocates, no dealloc when original missing', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map(),
      targetSlots: { B1: 2 },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'allocate', binderId: 'B1', cardId: 'owned-1', quantity: 2 },
    ])
  })

  it('skips allocate when ownedCardId is null', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 2]]),
      targetSlots: { B1: 3 },
      relatedCardIds: ['owned-1'],
      ownedCardId: null,
    })
    expect(ops.find(o => o.type === 'allocate')).toBeUndefined()
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'owned-1' },
    ])
  })

  it('processes multiple binders independently', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }, { binderId: 'B2' }],
      originalSlots: new Map([['B1', 1], ['B2', 0]]),
      targetSlots: { B1: 2, B2: 3 },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'owned-1' },
      { type: 'allocate', binderId: 'B1', cardId: 'owned-1', quantity: 2 },
      { type: 'allocate', binderId: 'B2', cardId: 'owned-1', quantity: 3 },
    ])
  })

  it('binder not in originalSlots map (treats as 0)', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map(),
      targetSlots: { B1: 0 },
      relatedCardIds: ['owned-1'],
      ownedCardId: 'owned-1',
    })
    expect(ops).toEqual([])
  })

  it('emits deallocate for each related cardId so legacy rows get cleaned', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 6]]),
      targetSlots: { B1: 2 },
      relatedCardIds: ['owned-1', 'wish-1', 'legacy-dupe'],
      ownedCardId: 'owned-1',
    })
    const deallocCardIds = ops.filter(o => o.type === 'deallocate').map(o => o.cardId)
    expect(deallocCardIds).toEqual(['owned-1', 'wish-1', 'legacy-dupe'])
  })

  // TASK-318 AC5 regression: same failure mode as deckSlotDiff — an identity
  // change with an unchanged binder allocation quantity used to emit no ops,
  // leaving the binder pointing at the row the identity-change deleted.
  it('identityChanged=true migrates an unchanged allocation onto the new cardId (was a no-op before TASK-318)', () => {
    const ops = computeBinderSlotOps({
      binders: [{ binderId: 'B1' }],
      originalSlots: new Map([['B1', 4]]),
      targetSlots: { B1: 4 },
      relatedCardIds: ['old-card-id'],
      ownedCardId: 'new-card-id',
      identityChanged: true,
    })
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'old-card-id' },
      { type: 'allocate', binderId: 'B1', cardId: 'new-card-id', quantity: 4 },
    ])
  })
})

describe('computeBinderMigrationOps — TASK-318 H7: per-row migration, no aggregation', () => {
  // Regression for R2 (rev4 probe): binder counterpart of the deck bug —
  // two rows in the same binder used to be merged into one total and
  // reallocated onto a single destination id.
  it('migrates each row to its own mapped id, preserving the per-status split', () => {
    const rows: BinderRowAllocation[] = [
      { binderId: 'B1', cardId: 'nm-sale', quantity: 3 },
      { binderId: 'B1', cardId: 'nm-trade', quantity: 2 },
    ]
    const idByCardId = new Map([['nm-sale', 'lp-sale'], ['nm-trade', 'lp-trade']])
    const ops = computeBinderMigrationOps(rows, idByCardId)
    expect(ops).toEqual<BinderSlotOp[]>([
      { type: 'deallocate', binderId: 'B1', cardId: 'nm-sale' },
      { type: 'allocate', binderId: 'B1', cardId: 'lp-sale', quantity: 3 },
      { type: 'deallocate', binderId: 'B1', cardId: 'nm-trade' },
      { type: 'allocate', binderId: 'B1', cardId: 'lp-trade', quantity: 2 },
    ])
  })

  it('skips a row whose mapped id is itself', () => {
    const rows: BinderRowAllocation[] = [{ binderId: 'B1', cardId: 'lp-existing', quantity: 2 }]
    expect(computeBinderMigrationOps(rows, new Map([['lp-existing', 'lp-existing']]))).toEqual([])
  })

  it('skips a row with zero quantity', () => {
    const rows: BinderRowAllocation[] = [{ binderId: 'B1', cardId: 'nm', quantity: 0 }]
    expect(computeBinderMigrationOps(rows, new Map([['nm', 'lp']]))).toEqual([])
  })
})
