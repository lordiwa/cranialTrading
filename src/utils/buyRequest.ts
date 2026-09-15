import type { ExchangeCartItem } from '@/types/exchangeCart'
import type { BuyerContact } from '@/types/buyRequest'

/** SCRUM-70: valor total de un carrito (price * quantity por item). */
export const computeTotalValue = (items: Pick<ExchangeCartItem, 'price' | 'quantity'>[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)

/**
 * TASK-291 AC3: id determinista del documento BuyRequest, derivado del
 * contenido del carrito + el contacto + el `createdAt` del carrito (unico
 * por sesion de carrito — ver stores/exchangeCart.ts: un carrito nuevo
 * siempre recibe un `createdAt` nuevo). Un reenvio del MISMO carrito produce
 * el MISMO id; un carrito distinto (o el mismo carrito reconstruido tras un
 * clearCart) produce un id distinto. Usado con setDoc en vez de addDoc para
 * que dos altas del mismo carrito apunten al mismo documento en vez de crear
 * dos — ver stores/buyRequests.ts.
 */
export const buildBuyRequestId = (
  contact: Pick<BuyerContact, 'phone' | 'email'>,
  items: Pick<ExchangeCartItem, 'scryfallId' | 'cardId' | 'quantity'>[],
  cartCreatedAt: number,
): string => {
  const itemsKey = items
    .map(i => `${i.scryfallId}:${i.cardId}:${i.quantity}`)
    .sort()
    .join('|')
  const raw = `${contact.phone.trim()}|${contact.email.trim().toLowerCase()}|${cartCreatedAt}|${itemsKey}`
  return `br_${fnv1a(raw)}`
}

/**
 * FNV-1a de 32 bits — hash determinista y estable, sin dependencias, para
 * derivar un id corto y valido de documento de Firestore (nunca contiene
 * '/'). No es criptografico: alcanza para des-duplicar reenvios del MISMO
 * carrito dentro de la subcoleccion de UN solo dueno, no para resistir
 * colisiones adversariales.
 */
const fnv1a = (str: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

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
