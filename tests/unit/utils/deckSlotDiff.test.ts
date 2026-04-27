import { describe, expect, it } from 'vitest'
import {
  buildOriginalSlots,
  computeDeckSlotOps,
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
})
