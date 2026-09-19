/**
 * SCRUM-70 — Lógica pura de buy requests.
 *  - computeTotalValue: suma price*quantity.
 *  - planFulfillment: decide por carta si decrementar, borrar (queda 0) o marcar
 *    como faltante (la carta ya no existe en la colección).
 *  - resolvePublishedPrices (TASK-306): re-resuelve el precio de cada línea
 *    contra lo publicado por el vendedor, nunca contra lo que vino del carrito.
 */
import { buildBuyRequestId, computeTotalValue, planFulfillment, resolvePublishedPrices, shortfallsOf } from '@/utils/buyRequest'

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

describe('buildBuyRequestId (TASK-291 AC3)', () => {
  const contact = { phone: ' 099123 ', email: ' A@B.com ' }
  const items = [item({ scryfallId: 's1', cardId: 'c1', quantity: 2 }), item({ scryfallId: 's2', cardId: 'c2', quantity: 1 })]

  it('is stable regardless of item array order (a re-render can reorder the cart)', () => {
    const id1 = buildBuyRequestId(contact, items, 1000)
    const id2 = buildBuyRequestId(contact, [...items].reverse(), 1000)
    expect(id1).toBe(id2)
  })

  it('is insensitive to contact whitespace/casing (same buyer, same result)', () => {
    const id1 = buildBuyRequestId({ phone: '099123', email: 'a@b.com' }, items, 1000)
    const id2 = buildBuyRequestId(contact, items, 1000)
    expect(id1).toBe(id2)
  })

  it('changes when the cart createdAt changes (a new cart session must not collide)', () => {
    const id1 = buildBuyRequestId(contact, items, 1000)
    const id2 = buildBuyRequestId(contact, items, 2000)
    expect(id1).not.toBe(id2)
  })

  it('changes when the item quantities change', () => {
    const id1 = buildBuyRequestId(contact, items, 1000)
    const id2 = buildBuyRequestId(contact, [item({ scryfallId: 's1', cardId: 'c1', quantity: 3 }), items[1]], 1000)
    expect(id1).not.toBe(id2)
  })
})

describe('resolvePublishedPrices (TASK-306 — hallazgo WG4-O3A-02)', () => {
  it('reemplaza el precio del carrito por el publicado por el vendedor cuando difieren — previene que un comprador fije el precio de su propio pedido', () => {
    const cartItems = [item({ cardId: 'c1', name: 'Angel of the Ruins', price: 0.01, quantity: 1 })]
    const getPublished = (cardId: string) => (cardId === 'c1' ? { price: 2.4, status: 'sale', quantity: 9 } : undefined)

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(result.ok).toBe(true)
    expect(result.resolved[0].price).toBe(2.4) // nunca 0.01
    expect(result.changed).toEqual([{ cardId: 'c1', name: 'Angel of the Ruins', cartPrice: 0.01, publishedPrice: 2.4 }])
  })

  it('computeTotalValue sobre las lineas resueltas da el total del vendedor, no el manipulado del carrito', () => {
    const cartItems = [
      item({ cardId: 'c1', name: 'Angel of the Ruins', price: 0.01, quantity: 1 }),
      item({ cardId: 'c2', name: 'Serra Angel', price: 4.5, quantity: 2 }),
    ]
    const getPublished = (cardId: string) =>
      ({ c1: { price: 2.4, status: 'sale', quantity: 9 }, c2: { price: 4.5, status: 'sale', quantity: 9 } })[cardId]

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(computeTotalValue(result.resolved)).toBe(11.4) // 2.40*1 + 4.50*2, no 0.01 + 9.00
  })

  it('una carta despublicada (sin doc, o sin precio vendible) queda "unavailable" y ok=false — no se inventa un precio para persistirla', () => {
    const cartItems = [item({ cardId: 'gone', name: 'Old Card', price: 5, quantity: 1 })]
    const getPublished = () => undefined // carta ya no está en public_cards

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(result.ok).toBe(false)
    expect(result.resolved).toEqual([])
    expect(result.unavailable).toEqual([{ cardId: 'gone', name: 'Old Card' }])
  })

  it('un precio publicado en 0 o un status no vendible tampoco resuelve — un "gratis" o "collection" no es un precio de transaccion valido', () => {
    const cartItems = [
      item({ cardId: 'c1', name: 'Zero Price', price: 3, quantity: 1 }),
      item({ cardId: 'c2', name: 'Now Wishlist', price: 3, quantity: 1 }),
    ]
    const getPublished = (cardId: string) =>
      ({ c1: { price: 0, status: 'sale', quantity: 9 }, c2: { price: 3, status: 'wishlist', quantity: 9 } })[cardId]

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(result.ok).toBe(false)
    expect(result.unavailable.map(u => u.cardId).sort()).toEqual(['c1', 'c2'])
  })

  it('TASK-307 AC5: una cantidad pedida por encima del stock publicado se trunca al stock real, nunca verbatim — previene que el navegador del comprador fije su propia cantidad', () => {
    const cartItems = [item({ cardId: 'c1', name: 'Angel of the Ruins', price: 2.4, quantity: 5 })]
    const getPublished = () => ({ price: 2.4, status: 'sale', quantity: 1 }) // el vendedor solo tiene 1

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(result.ok).toBe(true)
    expect(result.resolved[0].quantity).toBe(1) // nunca 5
  })

  it('un stock publicado en 0 tampoco resuelve — sin stock no hay transaccion valida aunque el precio y el status sean vendibles', () => {
    const cartItems = [item({ cardId: 'c1', name: 'Out of Stock', price: 3, quantity: 1 })]
    const getPublished = () => ({ price: 3, status: 'sale', quantity: 0 })

    const result = resolvePublishedPrices(cartItems, getPublished)

    expect(result.ok).toBe(false)
    expect(result.unavailable).toEqual([{ cardId: 'c1', name: 'Out of Stock' }])
  })
})

describe('planFulfillment (TASK-307 — antes solo distinguia missing/delete/update)', () => {
  it('decrementa cuando quedan unidades', () => {
    const getCard = (id: string) => (id === 'c1' ? { id: 'c1', quantity: 5 } : undefined)
    const plan = planFulfillment([item({ cardId: 'c1', quantity: 2 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'c1', action: 'update', newQuantity: 3 }])
  })

  it('borra cuando la cantidad llega a 0 exacto sobre un stock que alcanzaba entero', () => {
    const getCard = (id: string) => (id === 'c1' ? { id: 'c1', quantity: 2 } : undefined)
    const plan = planFulfillment([item({ cardId: 'c1', quantity: 2 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'c1', action: 'delete' }])
  })

  it('marca faltante (con la cantidad pedida) cuando la carta ya no existe', () => {
    const getCard = () => undefined
    const plan = planFulfillment([item({ cardId: 'gone', quantity: 1 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'gone', action: 'missing', requested: 1 }])
  })

  it('TASK-307 AC2: una carta que EXISTE pero no alcanza para la cantidad pedida es "insufficient", nunca "delete" — previene borrar la fila entera sobre un pedido que no se pudo cumplir', () => {
    const getCard = (id: string) => (id === 'c1' ? { id: 'c1', quantity: 1 } : undefined)
    const plan = planFulfillment([item({ cardId: 'c1', quantity: 2 })], getCard as any)
    expect(plan).toEqual([{ cardId: 'c1', action: 'insufficient', available: 1, requested: 2 }])
  })

  it('maneja varios items a la vez, cada uno con su propia accion', () => {
    const cards: Record<string, any> = { c1: { id: 'c1', quantity: 1 }, c2: { id: 'c2', quantity: 10 }, c4: { id: 'c4', quantity: 1 } }
    const getCard = (id: string) => cards[id]
    const plan = planFulfillment(
      [
        item({ cardId: 'c1', quantity: 1 }),
        item({ cardId: 'c2', quantity: 3 }),
        item({ cardId: 'c3', quantity: 1 }),
        item({ cardId: 'c4', quantity: 5 }),
      ],
      getCard as any,
    )
    expect(plan).toEqual([
      { cardId: 'c1', action: 'delete' },
      { cardId: 'c2', action: 'update', newQuantity: 7 },
      { cardId: 'c3', action: 'missing', requested: 1 },
      { cardId: 'c4', action: 'insufficient', available: 1, requested: 5 },
    ])
  })
})

describe('shortfallsOf (TASK-307 AC3)', () => {
  it('extrae missing e insufficient con su cantidad, ignora update/delete', () => {
    const plan = planFulfillment(
      [item({ cardId: 'c1', quantity: 1 }), item({ cardId: 'c2', quantity: 5 }), item({ cardId: 'gone', quantity: 2 })],
      (id: string) => ({ c1: { quantity: 1 }, c2: { quantity: 2 } } as Record<string, { quantity: number }>)[id],
    )
    expect(shortfallsOf(plan)).toEqual([
      { cardId: 'c2', requested: 5, available: 2 },
      { cardId: 'gone', requested: 2, available: 0 },
    ])
  })
})
