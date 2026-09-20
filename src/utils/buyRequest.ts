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
  /**
   * TASK-307 AC5: stock publicado por el vendedor. Igual que el precio, la
   * cantidad del carrito se valida contra este numero al ENVIAR el pedido
   * — nunca se persiste verbatim lo que trae el navegador del comprador.
   */
  quantity: number
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
 * Guarda AC5 (306): una carta sin doc publicado, sin status vendible
 * (sale/trade), sin stock (quantity <= 0), o con precio <= 0 no "resuelve"
 * — va a `unavailable` y el item NO entra en `resolved`. El caller debe
 * rechazar el pedido entero en ese caso, nunca persistir un precio
 * inventado para esa linea.
 *
 * TASK-307 AC5: la CANTIDAD tambien se valida contra lo publicado, del mismo
 * modo que el precio — `resolved[i].quantity` nunca excede `published.quantity`.
 * Una cantidad manipulada en el navegador del comprador (p.ej. editada a mano
 * en localStorage, sin pasar por el clamp de addItem/setQuantity) queda
 * truncada al stock real antes de persistirse, nunca verbatim.
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
    const sellable = published
      && (published.status === 'sale' || published.status === 'trade')
      && published.price > 0
      && published.quantity > 0
    // TASK-307/316 review R-2: `item.quantity` viene del carrito del
    // comprador (localStorage, editable a mano) — antes solo se acotaba por
    // ARRIBA (`Math.min(item.quantity, published.quantity)`, ver mas abajo),
    // nunca por ABAJO. Una cantidad negativa o NaN pasaba intacta a
    // `resolved` y submitBuyRequest la persistia verbatim en el doc del
    // pedido — el mismo tipo de dano que TASK-306 ya cerro para el precio.
    // Rechazar la linea entera como `unavailable`, igual que un precio no
    // vendible, en vez de intentar "arreglarla" en silencio.
    const validQuantity = Number.isInteger(item.quantity) && item.quantity > 0
    if (!sellable || !published || !validQuantity) {
      unavailable.push({ cardId: item.cardId, name: item.name })
      continue
    }
    if (published.price !== item.price) {
      changed.push({ cardId: item.cardId, name: item.name, cartPrice: item.price, publishedPrice: published.price })
    }
    const boundedQuantity = Math.min(item.quantity, published.quantity)
    resolved.push({ ...item, price: published.price, quantity: boundedQuantity })
  }

  return { ok: unavailable.length === 0, resolved, changed, unavailable }
}

export type FulfillAction =
  | { cardId: string; action: 'update'; newQuantity: number }
  | { cardId: string; action: 'delete' }
  | { cardId: string; action: 'missing'; requested: number }
  | { cardId: string; action: 'insufficient'; available: number; requested: number }

/**
 * TASK-307 AC3: una linea que no se puede cumplir entera — sea porque la
 * carta ya no existe (`available: 0`) o porque existe pero no alcanza —
 * junto con CUANTO faltó, no solo cuál carta.
 */
export interface FulfillmentShortfall {
  cardId: string
  requested: number
  available: number
}

/**
 * SCRUM-70.3 / TASK-307: decide, por cada item vendido, qué hacer con la
 * colección del dueño:
 *  - 'update'      → decrementar la cantidad (quedan unidades),
 *  - 'delete'      → borrar la carta — SOLO cuando el decremento da
 *                    EXACTAMENTE 0 sobre un stock que alcanzaba entero
 *                    (TASK-307 AC2: nunca sobre un pedido insuficiente),
 *  - 'missing'     → la carta ya no existe,
 *  - 'insufficient'→ la carta existe pero el stock no alcanza para la
 *                    cantidad pedida (TASK-307 hallazgo: antes esta rama
 *                    caía en 'delete' y borraba la fila entera).
 *
 * Pura: recibe un lookup `getCard` en lugar de tocar el store — el caller
 * (stores/buyRequests.ts) es quien decide de dónde viene esa lectura (fresca,
 * dentro de una transacción, nunca un snapshot local — TASK-316 AC2).
 */
export const planFulfillment = (
  items: Pick<ExchangeCartItem, 'cardId' | 'quantity'>[],
  getCard: (cardId: string) => { quantity: number } | undefined,
): FulfillAction[] =>
  items.map(item => {
    const card = getCard(item.cardId)
    if (!card) return { cardId: item.cardId, action: 'missing', requested: item.quantity }
    // TASK-307/316 review R-2: `items` viene de un doc de Firestore que
    // cualquier cliente anonimo puede escribir a mano (firestore.rules:180
    // solo valida status=='pending') — una cantidad negativa, NaN o no
    // entera nunca debe llegar a `card.quantity - item.quantity`. Sin este
    // chequeo, `quantity: -100` sobre un stock de 10 evaluaba
    // `-100 > 10` como falso y calculaba `newQuantity = 10 - (-100) = 110`:
    // inventario INFLADO con exito completo, con la autoridad de escritura
    // del propio vendedor. Tratarla como 'insufficient' (nunca se tira) para
    // que el vendedor vea el aviso de cumplimiento parcial en vez de un
    // exito silencioso que le infla o corrompe el stock.
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { cardId: item.cardId, action: 'insufficient', available: card.quantity, requested: item.quantity }
    }
    if (item.quantity > card.quantity) {
      return { cardId: item.cardId, action: 'insufficient', available: card.quantity, requested: item.quantity }
    }
    const newQuantity = card.quantity - item.quantity
    if (newQuantity <= 0) return { cardId: item.cardId, action: 'delete' }
    return { cardId: item.cardId, action: 'update', newQuantity }
  })

/**
 * TASK-307/316 review M-3: colapsa lineas duplicadas del MISMO cardId en una
 * sola, sumando sus cantidades. Firestore rules solo validan status=='pending'
 * (firestore.rules:180), asi que un doc de buyRequest artesanal puede traer
 * dos lineas del mismo cardId. Sin este colapso, planFulfillment planificaba
 * dos pasos independientes contra la MISMA lectura fresca (10 -> 4 dos veces,
 * last-write-wins dentro de la transaccion) — se descontaban 6 unidades
 * habiendo "vendido" 12, con exito completo. Llamar ANTES de planFulfillment
 * hace que el pedido real (12 sobre 10 -> insufficient, con shortfall) se vea
 * como una sola linea en vez de dos independientes.
 */
export const dedupeItemsByCardId = <T extends Pick<ExchangeCartItem, 'cardId' | 'quantity'>>(items: T[]): T[] => {
  const byId = new Map<string, T>()
  for (const item of items) {
    const existing = byId.get(item.cardId)
    byId.set(item.cardId, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item)
  }
  return [...byId.values()]
}

/** TASK-307 AC3: extrae del plan las lineas que no se pudieron cumplir enteras, con la cantidad que faltó. */
export const shortfallsOf = (plan: FulfillAction[]): FulfillmentShortfall[] =>
  plan
    .filter((step): step is Extract<FulfillAction, { action: 'missing' | 'insufficient' }> =>
      step.action === 'missing' || step.action === 'insufficient')
    .map(step => ({
      cardId: step.cardId,
      requested: step.requested,
      available: step.action === 'insufficient' ? step.available : 0,
    }))
