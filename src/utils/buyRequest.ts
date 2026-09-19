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

/** Lo que `public_cards/{ownerUid}_{cardId}` (fuente publicada del vendedor) tiene HOY para una carta. */
export interface PublishedCardPrice {
  price: number
  status: string
}

export interface ResolvedPriceChange {
  cardId: string
  name: string
  cartPrice: number
  publishedPrice: number
}

export interface UnresolvedCartItem {
  cardId: string
  name: string
}

export interface PriceResolutionResult {
  /** false si alguna linea no resuelve contra lo publicado — nada debe persistirse en ese caso (AC5). */
  ok: boolean
  /** Items con `price` REEMPLAZADO por el publicado — nunca el que vino del carrito (AC2/AC3). */
  resolved: ExchangeCartItem[]
  /** Lineas cuyo precio publicado difiere del capturado al agregar al carrito (AC4). */
  changed: ResolvedPriceChange[]
  /** Lineas que ya no tienen un precio publicado resoluble (AC5). */
  unavailable: UnresolvedCartItem[]
}

/**
 * TASK-306: re-resuelve el precio de cada linea del carrito contra lo que el
 * VENDEDOR tiene publicado (inyectado via `getPublished`, nunca leido de
 * `items`), en vez de confiar en `item.price` tal como llego del navegador
 * del comprador. Pura — el caller (stores/buyRequests.ts) es quien lee
 * Firestore y pasa el lookup ya resuelto, para que esto sea testeable sin
 * mockear Firebase.
 *
 * Guarda AC5: una carta sin doc publicado, sin status vendible (sale/trade),
 * o con precio <= 0 no "resuelve" — va a `unavailable` y el item NO entra en
 * `resolved`. El caller debe rechazar el pedido entero en ese caso, nunca
 * persistir un precio inventado para esa linea.
 */
export const resolvePublishedPrices = (
  items: ExchangeCartItem[],
  getPublished: (cardId: string) => PublishedCardPrice | undefined,
): PriceResolutionResult => {
  const resolved: ExchangeCartItem[] = []
  const changed: ResolvedPriceChange[] = []
  const unavailable: UnresolvedCartItem[] = []

  for (const item of items) {
    const published = getPublished(item.cardId)
    const sellable = published && (published.status === 'sale' || published.status === 'trade') && published.price > 0
    if (!sellable || !published) {
      unavailable.push({ cardId: item.cardId, name: item.name })
      continue
    }
    if (published.price !== item.price) {
      changed.push({ cardId: item.cardId, name: item.name, cartPrice: item.price, publishedPrice: published.price })
    }
    resolved.push({ ...item, price: published.price })
  }

  return { ok: unavailable.length === 0, resolved, changed, unavailable }
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
