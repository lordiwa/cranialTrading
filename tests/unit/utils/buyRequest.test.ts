/**
 * SCRUM-70 — Lógica pura de buy requests.
 *  - computeTotalValue: suma price*quantity.
 *  - planFulfillment: decide por carta si decrementar, borrar (queda 0) o marcar
 *    como faltante (la carta ya no existe en la colección).
 */
import { computeTotalValue, planFulfillment } from '@/utils/buyRequest'

const item = (over: Partial<any> = {}) => ({
  scryfallId: 's', cardId: 'c1', name: 'N', edition: '', quantity: 1,
  maxQuantity: 9, condition: 'NM', foil: false, price: 0, image: '', status: 'sale',
  ...over,
})

describe('computeTotalValue', () => {
  it('suma price * quantity de cada item', () => {
    expect(computeTotalValue([item({ price: 2, quantity: 3 }), item({ price: 5, quantity: 1 })])).toBe(11)
  })
  it('devuelve 0 para carrito vacío', () => {
    expect(computeTotalValue([])).toBe(0)
  })
})

describe('planFulfillment', () => {
  it('decrementa cuando quedan unidades', () => {
    const getCard = (id: string) => (id === 'c1' ? { id: 'c1', quantity: 5 } : undefined)
    const plan = planFulfillment([item({ cardId: 'c1', quantity: 2 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'c1', action: 'update', newQuantity: 3 }])
  })

  it('borra cuando la cantidad llega a 0 o menos', () => {
    const getCard = (id: string) => (id === 'c1' ? { id: 'c1', quantity: 2 } : undefined)
    const plan = planFulfillment([item({ cardId: 'c1', quantity: 2 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'c1', action: 'delete' }])
  })

  it('marca faltante cuando la carta ya no existe (fallback)', () => {
    const getCard = () => undefined
    const plan = planFulfillment([item({ cardId: 'gone', quantity: 1 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'gone', action: 'missing' }])
  })

  it('maneja varios items a la vez', () => {
    const cards: Record<string, any> = { c1: { id: 'c1', quantity: 1 }, c2: { id: 'c2', quantity: 10 } }
    const getCard = (id: string) => cards[id]
    const plan = planFulfillment(
      [item({ cardId: 'c1', quantity: 1 }), item({ cardId: 'c2', quantity: 3 }), item({ cardId: 'c3', quantity: 1 })],
      getCard as any,
    )
    expect(plan).toEqual([
      { cardId: 'c1', action: 'delete' },
      { cardId: 'c2', action: 'update', newQuantity: 7 },
      { cardId: 'c3', action: 'missing' },
    ])
  })
})
