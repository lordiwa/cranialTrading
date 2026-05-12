import { describe, expect, it } from 'vitest'
import {
  buildOriginalBinderSlots,
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
})
