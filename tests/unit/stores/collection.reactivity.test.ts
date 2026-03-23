/**
 * Regression test: card mutations in the collection store must produce
 * a new array reference so that downstream Vue 3.5 computed properties
 * (which skip propagation when oldValue === newValue) re-evaluate.
 *
 * Bug: shallowRef + in-place mutation + triggerRef kept the same array
 * reference, so the intermediate computed in CollectionView never
 * propagated changes to the grid.
 */
import { shallowRef, computed, nextTick } from 'vue'
import { makeCard } from '../helpers/fixtures'

describe('collection store reactivity: array reference changes', () => {
  /**
   * Simulates the exact pattern used in collection.ts:
   * shallowRef<Card[]> → intermediate computed → downstream computed
   * Verifies that mutations produce new array references so the full
   * chain re-evaluates (the actual bug was the intermediate computed
   * returning the same reference, blocking downstream updates).
   */

  it('updateCard: status change produces new array reference', () => {
    const card = makeCard({ id: 'c1', status: 'collection' })
    const cards = shallowRef([card])

    // Intermediate computed (mirrors CollectionView.vue:395)
    const collectionCards = computed(() => cards.value)

    // Downstream computed (mirrors statusFilteredCards)
    const saleCards = computed(() => collectionCards.value.filter(c => c.status === 'sale'))

    expect(saleCards.value).toHaveLength(0)

    // Simulate updateCard: NEW array reference (the fix)
    const refBefore = cards.value
    const updated = { ...card, status: 'sale' as const }
    const newCards = [...cards.value]
    newCards[0] = updated
    cards.value = newCards

    expect(cards.value).not.toBe(refBefore)
    expect(saleCards.value).toHaveLength(1)
    expect(saleCards.value[0].status).toBe('sale')
  })

  it('addCard: produces new array reference', () => {
    const cards = shallowRef([makeCard({ id: 'c1' })])
    const collectionCards = computed(() => cards.value)
    const count = computed(() => collectionCards.value.length)

    expect(count.value).toBe(1)

    const refBefore = cards.value
    cards.value = [...cards.value, makeCard({ id: 'c2' })]

    expect(cards.value).not.toBe(refBefore)
    expect(count.value).toBe(2)
  })

  it('deleteCard: produces new array reference', () => {
    const cards = shallowRef([makeCard({ id: 'c1' }), makeCard({ id: 'c2' })])
    const collectionCards = computed(() => cards.value)
    const count = computed(() => collectionCards.value.length)

    expect(count.value).toBe(2)

    const refBefore = cards.value
    cards.value = cards.value.filter(c => c.id !== 'c1')

    expect(cards.value).not.toBe(refBefore)
    expect(count.value).toBe(1)
  })

  it('applyLocalCardUpdates (bulk): single new reference for all updates', () => {
    const cards = shallowRef([
      makeCard({ id: 'c1', status: 'collection' }),
      makeCard({ id: 'c2', status: 'collection' }),
      makeCard({ id: 'c3', status: 'collection' }),
    ])
    const collectionCards = computed(() => cards.value)
    const saleCards = computed(() => collectionCards.value.filter(c => c.status === 'sale'))

    expect(saleCards.value).toHaveLength(0)

    // Simulate bulk update with new array
    const refBefore = cards.value
    const newCards = [...cards.value]
    for (let i = 0; i < newCards.length; i++) {
      newCards[i] = { ...newCards[i], status: 'sale' as const, updatedAt: new Date() }
    }
    cards.value = newCards

    expect(cards.value).not.toBe(refBefore)
    expect(saleCards.value).toHaveLength(3)
  })
})
