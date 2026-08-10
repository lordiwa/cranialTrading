import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from './auth'
import { useCollectionStore } from './collection'
import { computeTotalValue, planFulfillment } from '../utils/buyRequest'
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
   * SCRUM-70.1: un visitante (posiblemente anónimo) envía su carrito al dueño.
   * Persiste bajo /users/{ownerUid}/buyRequests. NO depende de authStore.
   */
  const submitBuyRequest = async (ownerUid: string, contact: BuyerContact, items: ExchangeCartItem[]): Promise<{ ok: boolean; error?: string }> => {
    if (!ownerUid) return { ok: false, error: 'no-owner-uid' }
    if (items.length === 0) return { ok: false, error: 'empty-cart' }
    try {
      const ref_ = collection(db, 'users', ownerUid, 'buyRequests')
      await addDoc(ref_, {
        buyerName: contact.name.trim() || 'Guest',
        buyerPhone: contact.phone.trim(),
        buyerEmail: contact.email.trim(),
        items,
        totalValue: computeTotalValue(items),
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
    loadBuyRequests,
    markSeen,
    deleteRequest,
    fulfillRequest,
  }
})
