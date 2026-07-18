/**
 * Persistent cache for resolved per-card prices (scryfallId -> CardPrices),
 * backed by IndexedDB (TASK-137).
 *
 * useCollectionTotals.ts does a sequential pass over the whole collection to
 * resolve Card Kingdom prices per card, at the Scryfall rate-limiter's pace —
 * for large collections this can take minutes. Results only lived in an
 * in-memory Map (`pricesCache`), so every page reload repeated the full pass.
 * This module persists those resolved results with a ~24h TTL (aligned with
 * MTGJSON's daily price cadence) so a warm reload can skip network fetches
 * for still-fresh cards.
 *
 * Reuses services/mtgjson.ts's `openDatabase()` (same physical IndexedDB
 * database, one extra object store) instead of opening a second IndexedDB
 * connection — see TASK-137 hand-off for the reuse rationale.
 *
 * Every function here is best-effort: IndexedDB being unavailable (no
 * support, private browsing, quota errors) or containing corrupted data
 * never throws — callers get an empty Map / a silent no-op and the caller's
 * existing network-fetch fallback behavior is unaffected.
 */
import { type CardPrices, openDatabase, RESOLVED_PRICES_STORE } from './mtgjson'

const TTL_MS = 24 * 60 * 60 * 1000 // 24h

export interface CardPricesCacheEntry {
  prices: CardPrices | null
  cachedAt: number
}

function isFreshEntry(value: unknown, now: number): value is CardPricesCacheEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CardPricesCacheEntry).cachedAt === 'number' &&
    (now - (value as CardPricesCacheEntry).cachedAt) < TTL_MS
  )
}

/**
 * Load all non-expired cached entries as scryfallId -> CardPrices.
 * Expired or corrupted entries are silently dropped (they'll be re-fetched).
 */
export async function hydrateCardPricesCache(): Promise<Map<string, CardPrices | null>> {
  const result = new Map<string, CardPrices | null>()
  try {
    const db = await openDatabase()
    const [keys, values] = await new Promise<[IDBValidKey[], unknown[]]>((resolve, reject) => {
      const tx = db.transaction(RESOLVED_PRICES_STORE, 'readonly')
      const store = tx.objectStore(RESOLVED_PRICES_STORE)
      const keysReq = store.getAllKeys()
      const valuesReq = store.getAll()
      let keysResult: IDBValidKey[] | undefined
      let valuesResult: unknown[] | undefined
      const tryResolve = () => {
        if (keysResult !== undefined && valuesResult !== undefined) {
          resolve([keysResult, valuesResult])
        }
      }
      keysReq.onsuccess = () => { keysResult = keysReq.result; tryResolve() }
      keysReq.onerror = () => { reject(new Error(String(keysReq.error))) }
      valuesReq.onsuccess = () => { valuesResult = valuesReq.result; tryResolve() }
      valuesReq.onerror = () => { reject(new Error(String(valuesReq.error))) }
    })

    const now = Date.now()
    keys.forEach((key, i) => {
      // Keys are always scryfallId strings — this module is the only writer
      // (persistCardPricesBatch always puts with a string key).
      const raw = values[i]
      if (isFreshEntry(raw, now)) {
        result.set(key as string, raw.prices)
      }
    })
  } catch (e) {
    console.warn('[cardPricesCache] hydrate failed, falling back to a cold fetch:', e)
  }
  return result
}

/**
 * Persist a batch of newly-resolved prices in a single readwrite transaction
 * (never one write per card). Best-effort: any failure is swallowed so a
 * broken/unavailable IndexedDB never interrupts the price-fetch loop.
 */
export async function persistCardPricesBatch(entries: Map<string, CardPrices | null>): Promise<void> {
  if (entries.size === 0) return
  try {
    const db = await openDatabase()
    const tx = db.transaction(RESOLVED_PRICES_STORE, 'readwrite')
    const store = tx.objectStore(RESOLVED_PRICES_STORE)
    const now = Date.now()
    await Promise.all(Array.from(entries, ([scryfallId, prices]) =>
      new Promise<void>((resolve, reject) => {
        const entry: CardPricesCacheEntry = { prices, cachedAt: now }
        const req = store.put(entry, scryfallId)
        req.onsuccess = () => { resolve() }
        req.onerror = () => { reject(new Error(String(req.error))) }
      })
    ))
  } catch (e) {
    console.warn('[cardPricesCache] persist failed (non-fatal):', e)
  }
}
