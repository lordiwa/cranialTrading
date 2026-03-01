import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from '../services/firebase'
import { useToastStore } from '../stores/toast'
import type { Card } from '../types/card'
import type { CardPrices } from '../services/mtgjson'

export interface PriceSnapshot {
  date: string   // YYYY-MM-DD
  tcg: number
  ck: number
  buylist: number
  cards: number
  unique: number
}

export interface CardHistoryPoint {
  date: string
  tcg: number
  ck: number
  buylist: number
}

const STORAGE_KEY = 'cranial_snapshot_date'
const CARD_STORAGE_KEY = 'cranial_card_snapshot_date'

function getTodayStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function usePriceHistory() {
  const toastStore = useToastStore()

  /**
   * Save a daily snapshot — gated by localStorage so at most 1 write/day.
   * Fire-and-forget: caller should NOT await this.
   */
  const saveSnapshot = (totals: { tcg: number; ck: number; buylist: number }, cardCount: number, uniqueCount: number) => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const today = getTodayStr()

    // localStorage gate — skip if already saved today
    try {
      if (localStorage.getItem(STORAGE_KEY) === today) return
    } catch {
      // localStorage unavailable — proceed to write
    }

    // Don't save empty snapshots
    if (totals.tcg === 0 && totals.ck === 0 && totals.buylist === 0) return

    const data: Omit<PriceSnapshot, 'date'> = {
      tcg: Math.round(totals.tcg * 100) / 100,
      ck: Math.round(totals.ck * 100) / 100,
      buylist: Math.round(totals.buylist * 100) / 100,
      cards: cardCount,
      unique: uniqueCount,
    }

    setDoc(doc(db, 'users', uid, 'priceHistory', today), data)
      .then(() => {
        try { localStorage.setItem(STORAGE_KEY, today) } catch { /* noop */ }
      })
      .catch((e: unknown) => {
        console.warn('Failed to save price snapshot:', e)
        toastStore.show('Error guardando historial de precios', 'error')
      })
  }

  /**
   * Load up to 90 daily snapshots, ordered chronologically by doc ID.
   */
  const loadHistory = async (): Promise<PriceSnapshot[]> => {
    const uid = auth.currentUser?.uid
    if (!uid) return []

    const colRef = collection(db, 'users', uid, 'priceHistory')
    const q = query(colRef, orderBy('__name__'), limit(90))
    const snap = await getDocs(q)

    return snap.docs.map(d => ({
      date: d.id,
      ...(d.data() as Omit<PriceSnapshot, 'date'>),
    }))
  }

  /**
   * Save per-card prices — gated by localStorage so at most 1 batch/day.
   * Deduplicates by scryfallId. Fire-and-forget.
   */
  const saveCardPrices = (cards: Card[], cardPricesMap: Map<string, CardPrices | null>) => {
    const uid = auth.currentUser?.uid
    if (!uid) return

    const today = getTodayStr()

    try {
      if (localStorage.getItem(CARD_STORAGE_KEY) === today) return
    } catch {
      // proceed
    }

    // Dedup by scryfallId — pick first card per scryfallId
    const seen = new Set<string>()
    const entries: { scryfallId: string; prices: [number, number, number] }[] = []

    for (const card of cards) {
      if (!card.scryfallId || seen.has(card.scryfallId)) continue
      seen.add(card.scryfallId)

      const tcg = card.price || 0
      const ckData = cardPricesMap.get(card.id)
      const ck = ckData?.cardKingdom?.retail || 0
      const bl = ckData?.cardKingdom?.buylist || 0

      // Skip cards with no prices at all
      if (tcg === 0 && ck === 0 && bl === 0) continue

      entries.push({
        scryfallId: card.scryfallId,
        prices: [
          Math.round(tcg * 100) / 100,
          Math.round(ck * 100) / 100,
          Math.round(bl * 100) / 100,
        ],
      })
    }

    if (entries.length === 0) return

    // Write in batches of 400
    const BATCH_SIZE = 400
    const batchPromises: Promise<void>[] = []

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)

      for (const entry of chunk) {
        const ref = doc(db, 'users', uid, 'cardPriceHistory', entry.scryfallId)
        batch.set(ref, { [today]: entry.prices }, { merge: true })
      }

      batchPromises.push(batch.commit())
    }

    Promise.all(batchPromises)
      .then(() => {
        try { localStorage.setItem(CARD_STORAGE_KEY, today) } catch { /* noop */ }
      })
      .catch((e: unknown) => {
        console.warn('Failed to save card price history:', e)
        toastStore.show('Error guardando historial de precios por carta', 'error')
      })
  }

  /**
   * Load price history for a single card by scryfallId.
   * Returns sorted array of { date, tcg, ck, buylist }.
   */
  const loadCardHistory = async (scryfallId: string): Promise<CardHistoryPoint[]> => {
    const uid = auth.currentUser?.uid
    if (!uid || !scryfallId) return []

    const ref = doc(db, 'users', uid, 'cardPriceHistory', scryfallId)
    const snap = await getDoc(ref)

    if (!snap.exists()) return []

    const data = snap.data() as Record<string, [number, number, number]>
    const points: CardHistoryPoint[] = []

    for (const [date, arr] of Object.entries(data)) {
      if (!Array.isArray(arr) || arr.length < 3) continue
      points.push({
        date,
        tcg: arr[0],
        ck: arr[1],
        buylist: arr[2],
      })
    }

    points.sort((a, b) => a.date.localeCompare(b.date))
    return points
  }

  return { saveSnapshot, loadHistory, saveCardPrices, loadCardHistory }
}
