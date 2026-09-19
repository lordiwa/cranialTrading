import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from './auth'
import { useCollectionStore } from './collection'
import {
  buildBuyRequestId,
  computeTotalValue,
  planFulfillment,
  type PriceResolutionResult,
  type PublishedCardPrice,
  resolvePublishedPrices,
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
   * TASK-306: lee lo que el VENDEDOR tiene publicado HOY para cada linea del
   * carrito, directamente desde `public_cards/{ownerUid}_{item.cardId}` — el
   * mismo id que syncCardToPublic/removeCardFromPublic usan para escribir y
   * borrar ese doc (services/publicCards.ts), asi que es la fuente de verdad
   * del precio, nunca `items` (que viene del navegador del comprador). Un
   * doc ausente (carta despublicada) resuelve a `undefined` a proposito —
   * resolvePublishedPrices lo trata como no-vendible (AC5).
   */
  const fetchPublishedPriceMap = async (
    ownerUid: string,
    items: ExchangeCartItem[],
  ): Promise<Record<string, PublishedCardPrice | undefined>> => {
    const entries = await Promise.all(
      items.map(async (item): Promise<readonly [string, PublishedCardPrice | undefined]> => {
        const snap = await getDoc(doc(db, 'public_cards', `${ownerUid}_${item.cardId}`))
        if (!snap.exists()) return [item.cardId, undefined] as const
        const data = snap.data() as { price?: number; status?: string }
        return [item.cardId, { price: data.price ?? 0, status: data.status ?? '' }] as const
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
   * SCRUM-70.3: marcar como vendido → descontar cada carta de la colección del
   * dueño (reutiliza updateCard/deleteCard) y marcar la solicitud como 'fulfilled'.
   * Devuelve la lista de cardIds faltantes (fallback) por si la UI quiere avisar.
   */
  const fulfillRequest = async (requestId: string): Promise<{ ok: boolean; missing: string[] }> => {
    if (!authStore.user) return { ok: false, missing: [] }
    const target = buyRequests.value.find(r => r.id === requestId)
    if (!target) return { ok: false, missing: [] }

    const collectionStore = useCollectionStore()
    const plan = planFulfillment(target.items, (cardId) => collectionStore.getCardById(cardId))
    const missing: string[] = []

    try {
      for (const step of plan) {
        if (step.action === 'missing') {
          missing.push(step.cardId)
        } else if (step.action === 'delete') {
          await collectionStore.deleteCard(step.cardId)
        } else {
          await collectionStore.updateCard(step.cardId, { quantity: step.newQuantity })
        }
      }

      await updateDoc(doc(db, 'users', authStore.user.id, 'buyRequests', requestId), { status: 'fulfilled' })
      target.status = 'fulfilled'
      return { ok: true, missing }
    } catch (err) {
      logSanitizedError('fulfillRequest error', err)
      return { ok: false, missing }
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
