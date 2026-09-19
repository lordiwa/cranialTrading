import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from './auth'
import {
  buildBuyRequestId,
  computeTotalValue,
  type FulfillmentShortfall,
  planFulfillment,
  type PriceResolutionResult,
  type PublishedCardPrice,
  resolvePublishedPrices,
  shortfallsOf,
} from '../utils/buyRequest'
import { logSanitizedError } from '../utils/logSanitizedError'
import type { ExchangeCartItem } from '../types/exchangeCart'
import type { BuyerContact, BuyRequest, BuyRequestStatus } from '../types/buyRequest'

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date()
}

export const useBuyRequestsStore = defineStore('buyRequests', () => {
  const buyRequests = ref<BuyRequest[]>([])
  const loading = ref(false)

  const authStore = useAuthStore()

  /** Pendientes (no vistos ni cumplidos) — para el badge de la pestaña. */
  const pendingCount = computed(() => buyRequests.value.filter(r => r.status === 'pending').length)

  /**
   * TASK-306/TASK-307: lee lo que el VENDEDOR tiene publicado HOY para cada
   * linea del carrito, directamente desde `public_cards/{ownerUid}_{item.cardId}`
   * — el mismo id que syncCardToPublic/removeCardFromPublic usan para escribir
   * y borrar ese doc (services/publicCards.ts), asi que es la fuente de verdad
   * del precio Y de la cantidad, nunca `items` (que viene del navegador del
   * comprador). Un doc ausente (carta despublicada) resuelve a `undefined` a
   * proposito — resolvePublishedPrices lo trata como no-vendible (AC5).
   */
  const fetchPublishedPriceMap = async (
    ownerUid: string,
    items: ExchangeCartItem[],
  ): Promise<Record<string, PublishedCardPrice | undefined>> => {
    const entries = await Promise.all(
      items.map(async (item): Promise<readonly [string, PublishedCardPrice | undefined]> => {
        const snap = await getDoc(doc(db, 'public_cards', `${ownerUid}_${item.cardId}`))
        if (!snap.exists()) return [item.cardId, undefined] as const
        const data = snap.data() as { price?: number; status?: string; quantity?: number }
        return [item.cardId, { price: data.price ?? 0, status: data.status ?? '', quantity: data.quantity ?? 0 }] as const
      })
    )
    return Object.fromEntries(entries)
  }

  /**
   * TASK-306 AC4: re-chequeo de precio SIN persistir — lo usa la UI del
   * carrito antes de enviar, para mostrarle al comprador el precio nuevo (o
   * que la carta ya no esta disponible) y pedirle que confirme con el numero
   * vigente en vez de enviar a ciegas. submitBuyRequest hace este mismo
   * re-chequeo de forma independiente al persistir (defensa en profundidad:
   * AC2/AC3/AC5 valen aunque este paso de UI se salte).
   */
  const checkPriceChanges = async (ownerUid: string, items: ExchangeCartItem[]): Promise<PriceResolutionResult> => {
    const priceMap = await fetchPublishedPriceMap(ownerUid, items)
    return resolvePublishedPrices(items, (cardId) => priceMap[cardId])
  }

  /**
   * SCRUM-70.1: un visitante (posiblemente anónimo) envía su carrito al dueño.
   * Persiste bajo /users/{ownerUid}/buyRequests. NO depende de authStore.
   *
   * TASK-291 AC3: `cartCreatedAt` (el `createdAt` del carrito en
   * exchangeCart.ts, único por sesión de carrito) entra en un id
   * determinista (buildBuyRequestId) y el alta usa `setDoc` sobre ese id en
   * vez de `addDoc`. Dos envíos del MISMO carrito apuntan al MISMO
   * documento: el reenvío no crea un segundo BuyRequest. Nota de reglas: la
   * regla `create` de firestore.rules no distingue un id generado por el
   * cliente (addDoc) de uno elegido por el cliente (setDoc) — ambos son
   * "el cliente elige el id antes de escribir", y ambos evalúan `create`
   * mientras el documento no exista. Un reenvío que SÍ colisiona con un
   * documento existente pasa a evaluarse como `update`, que exige
   * `request.auth.uid == userId` (el dueño) — un comprador anónimo nunca lo
   * cumple, así que el reenvío falla con permission-denied en vez de
   * pisar el documento original. No hizo falta tocar firestore.rules.
   */
  const submitBuyRequest = async (
    ownerUid: string,
    contact: BuyerContact,
    items: ExchangeCartItem[],
    cartCreatedAt: number,
  ): Promise<{ ok: boolean; error?: string; unavailable?: { cardId: string; name: string }[] }> => {
    if (!ownerUid) return { ok: false, error: 'no-owner-uid' }
    if (items.length === 0) return { ok: false, error: 'empty-cart' }
    try {
      // TASK-306 AC2/AC3/AC5: el precio que se persiste es SIEMPRE el
      // resuelto contra `public_cards` en este mismo instante, nunca
      // `item.price` tal como llego del carrito del comprador. Si alguna
      // linea no resuelve (carta despublicada / sin precio vendible), el
      // pedido ENTERO se rechaza en vez de persistir un numero inventado
      // para esa linea — no hay alta parcial silenciosa.
      const priceMap = await fetchPublishedPriceMap(ownerUid, items)
      const resolution = resolvePublishedPrices(items, (cardId) => priceMap[cardId])
      if (!resolution.ok) {
        return { ok: false, error: 'unavailable-items', unavailable: resolution.unavailable }
      }

      const id = buildBuyRequestId(contact, items, cartCreatedAt)
      const ref_ = doc(db, 'users', ownerUid, 'buyRequests', id)
      await setDoc(ref_, {
        buyerName: contact.name.trim() || 'Guest',
        buyerPhone: contact.phone.trim(),
        buyerEmail: contact.email.trim(),
        items: resolution.resolved,
        totalValue: computeTotalValue(resolution.resolved),
        status: 'pending' as BuyRequestStatus,
        createdAt: new Date(),
      })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logSanitizedError('submitBuyRequest error', err)
      return { ok: false, error: msg }
    }
  }

  /** SCRUM-70.2: el dueño carga sus buy requests. */
  const loadBuyRequests = async (): Promise<void> => {
    if (!authStore.user) return
    loading.value = true
    try {
      const snapshot = await getDocs(collection(db, 'users', authStore.user.id, 'buyRequests'))
      buyRequests.value = snapshot.docs
        .map(d => {
          const data = d.data() as Record<string, unknown>
          return {
            id: d.id,
            buyerName: (data.buyerName as string) ?? 'Guest',
            buyerPhone: (data.buyerPhone as string) ?? '',
            buyerEmail: (data.buyerEmail as string) ?? '',
            items: (data.items as ExchangeCartItem[]) ?? [],
            totalValue: (data.totalValue as number) ?? 0,
            status: (data.status as BuyRequestStatus) ?? 'pending',
            createdAt: toDate(data.createdAt),
          }
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (err) {
      logSanitizedError('loadBuyRequests error', err)
      buyRequests.value = []
    } finally {
      loading.value = false
    }
  }

  const markSeen = async (requestId: string): Promise<void> => {
    if (!authStore.user) return
    const target = buyRequests.value.find(r => r.id === requestId)
    if (target?.status !== 'pending') return
    try {
      await updateDoc(doc(db, 'users', authStore.user.id, 'buyRequests', requestId), { status: 'seen' })
      target.status = 'seen'
    } catch (err) {
      logSanitizedError('markSeen error', err)
    }
  }

  const deleteRequest = async (requestId: string): Promise<boolean> => {
    if (!authStore.user) return false
    try {
      await deleteDoc(doc(db, 'users', authStore.user.id, 'buyRequests', requestId))
      buyRequests.value = buyRequests.value.filter(r => r.id !== requestId)
      return true
    } catch (err) {
      logSanitizedError('deleteRequest error', err)
      return false
    }
  }

  /**
   * SCRUM-70.3 / TASK-307 / TASK-316: marcar como vendido → descontar cada
   * carta de la colección del dueño y marcar la solicitud como 'fulfilled'.
   *
   * TASK-316 hallazgo: la version anterior calculaba `newQuantity` contra el
   * SNAPSHOT LOCAL de collectionStore (cargado una vez al abrir la pestaña) y
   * escribia una cantidad ABSOLUTA con updateCard/deleteCard — dos pestañas
   * que cumplen pedidos distintos sobre la MISMA carta pisan la escritura de
   * la otra (lost update). Ahora todo el descuento corre DENTRO de un
   * runTransaction: se relee el doc del pedido y el de cada carta FRESCOS en
   * el momento del commit — nunca el cache local — y Firestore reintenta la
   * funcion entera si algun doc leido cambio antes de comitear, asi que dos
   * cumplimientos concurrentes de la misma carta nunca se pisan (AC2).
   *
   * TASK-316 AC3: guarda de estado explicita, igual que markSeen — un pedido
   * ya 'fulfilled' se rechaza, tanto en el chequeo local (doble click en la
   * MISMA pestaña) como releido dentro de la transaccion (dos pestañas).
   *
   * TASK-307 hallazgo: planFulfillment distingue 'insufficient' (existe pero
   * no alcanza) de 'missing' (no existe) — 'insufficient' NUNCA cae en
   * 'delete', asi que una carta con stock insuficiente para el pedido no se
   * borra entera. Las lineas 'missing'/'insufficient' no escriben nada y se
   * reportan en `shortfalls` con la cantidad que faltó (AC3); las demas
   * lineas del MISMO pedido, si alcanzan, se descuentan igual dentro de la
   * misma transaccion.
   */
  const fulfillRequest = async (requestId: string): Promise<{
    ok: boolean
    missing: string[]
    shortfalls: FulfillmentShortfall[]
    alreadyFulfilled?: boolean
  }> => {
    if (!authStore.user) return { ok: false, missing: [], shortfalls: [] }
    const uid = authStore.user.id
    const target = buyRequests.value.find(r => r.id === requestId)
    if (!target) return { ok: false, missing: [], shortfalls: [] }

    // TASK-316 AC3: chequeo LOCAL primero — cubre el doble click en la MISMA
    // pestaña sin ni siquiera abrir una transaccion. La relectura fresca
    // dentro de la transaccion, mas abajo, cubre dos pestañas distintas.
    if (target.status === 'fulfilled') {
      return { ok: false, missing: [], shortfalls: [], alreadyFulfilled: true }
    }

    const requestRef = doc(db, 'users', uid, 'buyRequests', requestId)

    try {
      const outcome = await runTransaction(db, async (tx) => {
        const requestSnap = await tx.get(requestRef)
        if (!requestSnap.exists()) {
          return { notFound: true, alreadyFulfilled: false, shortfalls: [] as FulfillmentShortfall[] }
        }
        const requestData = requestSnap.data() as { status?: BuyRequestStatus; items?: ExchangeCartItem[] }
        if (requestData.status === 'fulfilled') {
          return { notFound: false, alreadyFulfilled: true, shortfalls: [] as FulfillmentShortfall[] }
        }

        const items = requestData.items ?? []
        // TASK-316 AC2: lectura fresca de CADA carta, dentro de la misma
        // transaccion — nunca collectionStore.getCardById (el snapshot local
        // de esta pestaña). Se indexa por cardId con Maps (no por posicion de
        // array) para no depender de que dos arrays paralelos conserven el
        // mismo largo/orden bajo noUncheckedIndexedAccess.
        const cardRefByCardId = new Map(items.map(item => [item.cardId, doc(db, 'users', uid, 'cards', item.cardId)] as const))
        const cardSnaps = await Promise.all([...cardRefByCardId.values()].map(ref => tx.get(ref)))
        const quantityByCardId = new Map<string, number>()
        ;[...cardRefByCardId.keys()].forEach((cardId, i) => {
          const snap = cardSnaps[i]
          if (snap?.exists()) {
            const data = snap.data() as { quantity?: number }
            quantityByCardId.set(cardId, data.quantity ?? 0)
          }
        })

        const plan = planFulfillment(items, (cardId) => {
          const quantity = quantityByCardId.get(cardId)
          return quantity === undefined ? undefined : { quantity }
        })

        for (const step of plan) {
          const cardRef = cardRefByCardId.get(step.cardId)
          if (!cardRef) continue // no debería pasar — cardRefByCardId se construyó a partir de estos mismos items
          if (step.action === 'delete') {
            tx.delete(cardRef)
          } else if (step.action === 'update') {
            tx.update(cardRef, { quantity: step.newQuantity, updatedAt: new Date() })
          }
          // 'missing' / 'insufficient' → no se escribe nada para esa linea.
        }
        tx.update(requestRef, { status: 'fulfilled' as BuyRequestStatus })

        return { notFound: false, alreadyFulfilled: false, shortfalls: shortfallsOf(plan) }
      })

      if (outcome.notFound) return { ok: false, missing: [], shortfalls: [] }
      if (outcome.alreadyFulfilled) {
        target.status = 'fulfilled'
        return { ok: false, missing: [], shortfalls: [], alreadyFulfilled: true }
      }

      target.status = 'fulfilled'
      return { ok: true, missing: outcome.shortfalls.map(s => s.cardId), shortfalls: outcome.shortfalls }
    } catch (err) {
      logSanitizedError('fulfillRequest error', err)
      return { ok: false, missing: [], shortfalls: [] }
    }
  }

  return {
    buyRequests,
    loading,
    pendingCount,
    submitBuyRequest,
    checkPriceChanges,
    loadBuyRequests,
    markSeen,
    deleteRequest,
    fulfillRequest,
  }
})
