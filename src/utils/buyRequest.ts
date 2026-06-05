import type { ExchangeCartItem } from '@/types/exchangeCart'

/** SCRUM-70: valor total de un carrito (price * quantity por item). */
export const computeTotalValue = (items: Pick<ExchangeCartItem, 'price' | 'quantity'>[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export type FulfillAction =
  | { cardId: string; action: 'update'; newQuantity: number }
  | { cardId: string; action: 'delete' }
  | { cardId: string; action: 'missing' }

/**
 * SCRUM-70.3: decide, por cada item vendido, qué hacer con la colección del dueño:
 *  - 'update'  → decrementar la cantidad (quedan unidades),
 *  - 'delete'  → borrar la carta (la cantidad llega a 0 o menos),
 *  - 'missing' → la carta ya no existe (fallback: se omite el descuento).
 *
 * Pura: recibe un lookup `getCard` en lugar de tocar el store.
 */
export const planFulfillment = (
  items: Pick<ExchangeCartItem, 'cardId' | 'quantity'>[],
  getCard: (cardId: string) => { quantity: number } | undefined,
): FulfillAction[] =>
  items.map(item => {
    const card = getCard(item.cardId)
    if (!card) return { cardId: item.cardId, action: 'missing' }
    const newQuantity = card.quantity - item.quantity
    if (newQuantity <= 0) return { cardId: item.cardId, action: 'delete' }
    return { cardId: item.cardId, action: 'update', newQuantity }
  })
