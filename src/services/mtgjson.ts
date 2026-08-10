/**
 * MTGJSON Service
 * Fetches card prices from MTGJSON (Card Kingdom, TCGPlayer, Cardmarket)
 * https://mtgjson.com/
 *
 * Uses IndexedDB for large price data storage (localStorage quota is too small)
 */

// Types for MTGJSON price data
export type MTGJSONPricePoint = Record<string, number>;

export interface MTGJSONPriceList {
  buylist?: {
    normal?: MTGJSONPricePoint
    foil?: MTGJSONPricePoint
  }
  retail?: {
    normal?: MTGJSONPricePoint
    foil?: MTGJSONPricePoint
  }
  currency: string
}

export interface MTGJSONPriceFormats {
  paper?: {
    cardkingdom?: MTGJSONPriceList
    cardmarket?: MTGJSONPriceList
    tcgplayer?: MTGJSONPriceList
    cardsphere?: MTGJSONPriceList
  }
  mtgo?: {
    cardhoarder?: MTGJSONPriceList
  }
}

export interface CardPrices {
  cardKingdom?: {
    retail: number | null
    retailFoil: number | null
    buylist: number | null
    buylistFoil: number | null
  }
  tcgplayer?: {
    retail: number | null
    retailFoil: number | null
  }
  cardmarket?: {
    retail: number | null
    retailFoil: number | null
  }
}

import { isKnownMtgjsonSet, parseSetListCodes } from './mtgjsonSetList'

// IndexedDB configuration
const DB_NAME = 'mtgjson_cache'
// v2 (TASK-137): adds RESOLVED_PRICES_STORE for the per-card resolved-price
// cache (scryfallId -> CardPrices). Additive migration — existing PRICE_STORE
// / MAPPING_STORE data is untouched.
const DB_VERSION = 2
const PRICE_STORE = 'prices'
const MAPPING_STORE = 'mappings'
// Resolved per-card CK/TCG/Cardmarket prices, keyed by scryfallId. Populated
// by services/cardPricesCache.ts — kept in this same physical database
// (rather than a second IndexedDB connection) since openDatabase() already
// owns the connection lifecycle.
export const RESOLVED_PRICES_STORE = 'resolvedPrices'

// SetList cache: how long before we refresh the list of valid MTGJSON set codes
const SET_LIST_REFRESH_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Cache keys for localStorage (small data only)
const SET_CACHE_PREFIX = 'mtgjson_set_'

// API base URL
const MTGJSON_API = 'https://mtgjson.com/api/v5'

// In-memory caches
let priceDataCache: Record<string, MTGJSONPriceFormats> | null = null
let scryfallToUuidMap = new Map<string, string>()
let dbInstance: IDBDatabase | null = null
const failedSets = new Set<string>()
const loadedSets = new Set<string>()

// TASK-174: in-flight-promise dedup, mirroring ensureSetListLoaded's
// setListLoadPromise pattern below. Without these, concurrent callers
// (e.g. several CollectionGridCard IntersectionObservers firing in the same
// tick) each see priceDataCache/loadedSets as not-yet-populated and kick off
// their own duplicate network fetch — measured as 5 concurrent 5.48MB
// AllPricesToday.json.gz downloads from a single /collection page load.
let priceDataLoadPromise: Promise<Record<string, MTGJSONPriceFormats>> | null = null
const setMappingLoadPromises = new Map<string, Promise<void>>()

// Set of UPPERCASE set codes that MTGJSON actually publishes a file for.
// Loaded lazily from MTGJSON's SetList and cached in IndexedDB. Empty until
// loaded; an empty set means "unknown" → no pre-filtering (legacy behavior).
let validSetCodes = new Set<string>()
// Promise guard so the SetList is only fetched once even under concurrency.
let setListLoadPromise: Promise<void> | null = null

// One-time cleanup of old/bloated localStorage keys (migrating to IndexedDB)
;(() => {
  try {
    localStorage.removeItem('mtgjson_prices')
    localStorage.removeItem('mtgjson_prices_date')
    localStorage.removeItem('mtgjson_scryfall_mapping')

    // Clean up accumulated set caches that can fill localStorage quota
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(SET_CACHE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => { localStorage.removeItem(key) })
  } catch {
    // Ignore errors during cleanup
  }
})()

// ========== IndexedDB Helpers ==========

/**
 * Open/create the IndexedDB database. Exported so services/cardPricesCache.ts
 * can reuse this connection/schema instead of opening a second IndexedDB
 * database for the resolved per-card price cache (TASK-137).
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.warn('IndexedDB not available, falling back to memory-only cache')
      reject(new Error(String(request.error)))
    }

    // TASK-137 review H1: a version bump (v1->v2) blocks indefinitely if
    // another tab still has an older-version connection open and never
    // closes it — without this handler the Promise never settles and every
    // caller (hydrate/getFromDB/saveToDB) hangs forever instead of falling
    // back to the existing no-cache behavior.
    request.onblocked = () => {
      console.warn('IndexedDB open blocked by another open connection (older tab?)')
      reject(new Error('IndexedDB open blocked'))
    }

    request.onsuccess = () => {
      dbInstance = request.result
      // If another tab/window later needs a newer version, this connection
      // must close itself (and drop the cached instance) instead of
      // blocking that upgrade forever — mirrors the onblocked handling above.
      dbInstance.onversionchange = () => {
        dbInstance?.close()
        dbInstance = null
      }
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Store for price data
      if (!db.objectStoreNames.contains(PRICE_STORE)) {
        db.createObjectStore(PRICE_STORE)
      }

      // Store for scryfall -> uuid mappings
      if (!db.objectStoreNames.contains(MAPPING_STORE)) {
        db.createObjectStore(MAPPING_STORE)
      }

      // Store for resolved per-card prices (TASK-137)
      if (!db.objectStoreNames.contains(RESOLVED_PRICES_STORE)) {
        db.createObjectStore(RESOLVED_PRICES_STORE)
      }
    }
  })
}

/**
 * Get data from IndexedDB
 */
async function getFromDB<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDatabase()
    return await new Promise<T | null>((resolve) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => { resolve((request.result as T) || null); }
      request.onerror = () => { resolve(null); }
    })
  } catch {
    return null
  }
}

/**
 * Save data to IndexedDB
 */
async function saveToDB(storeName: string, key: string, data: unknown): Promise<boolean> {
  try {
    const db = await openDatabase()
    return await new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(data, key)

      request.onsuccess = () => { resolve(true); }
      request.onerror = () => {
        console.warn('Error saving to IndexedDB:', request.error)
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

// ========== Price Data Functions ==========

/**
 * Get the latest price from a price point object (date -> price)
 */
function getLatestPrice(pricePoint?: MTGJSONPricePoint): number | null {
  if (!pricePoint) return null
  const dates = Object.keys(pricePoint).sort((a, b) => b.localeCompare(a))
  const latestDate = dates[0]
  if (!latestDate) return null
  // eslint-disable-next-line security/detect-object-injection
  return pricePoint[latestDate] ?? null
}

/**
 * Check if cached data is still valid (less than 24 hours old)
 */
function isCacheValid(timestamp: number | null): boolean {
  if (!timestamp) return false
  const now = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  return (now - timestamp) < oneDayMs
}

/**
 * Load price data from IndexedDB cache
 */
async function loadPriceDataFromCache(): Promise<Record<string, MTGJSONPriceFormats> | null> {
  const cached = await getFromDB<{ data: Record<string, MTGJSONPriceFormats>; timestamp: number }>(
    PRICE_STORE,
    'allPrices'
  )

  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data
  }

  return null
}

/**
 * Save price data to IndexedDB cache
 */
async function savePriceDataToCache(data: Record<string, MTGJSONPriceFormats>): Promise<void> {
  await saveToDB(PRICE_STORE, 'allPrices', {
    data,
    timestamp: Date.now()
  })
}

/**
 * Load scryfallId -> uuid mapping from IndexedDB
 */
async function loadMappingFromCache(): Promise<Map<string, string> | null> {
  const cached = await getFromDB<Record<string, string>>(MAPPING_STORE, 'scryfallToUuid')
  if (cached) {
    return new Map(Object.entries(cached))
  }
  return null
}

/**
 * Save scryfallId -> uuid mapping to IndexedDB
 * Limits cache to avoid excessive storage
 */
const MAX_MAPPING_ENTRIES = 100000

async function saveMappingToCache(map: Map<string, string>): Promise<void> {
  let mapToSave = map
  if (map.size > MAX_MAPPING_ENTRIES) {
    const entries = Array.from(map.entries())
    mapToSave = new Map(entries.slice(-MAX_MAPPING_ENTRIES))
  }

  const obj = Object.fromEntries(mapToSave)
  await saveToDB(MAPPING_STORE, 'scryfallToUuid', obj)
  await saveToDB(MAPPING_STORE, 'loadedSetCodes', Array.from(loadedSets))
}

/**
 * Fetch and decompress gzipped JSON from MTGJSON
 */
async function fetchGzippedJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  // Check if response is gzipped
  const contentType = response.headers.get('content-type')

  if (url.endsWith('.gz') || contentType?.includes('gzip')) {
    // Decompress gzipped response
    const blob = await response.blob()
    const ds = new DecompressionStream('gzip')
    const decompressedStream = blob.stream().pipeThrough(ds)
    const decompressedBlob = await new Response(decompressedStream).blob()
    const text = await decompressedBlob.text()
    return JSON.parse(text) as T
  }

  return response.json() as Promise<T>
}

/**
 * Fetch price data from MTGJSON (AllPricesToday). Exported for direct
 * TASK-174 dedup tests — internal callers (getCardPrices, preloadPriceData)
 * still call it the same way.
 */
export async function fetchPriceData(): Promise<Record<string, MTGJSONPriceFormats>> {
  // Check memory cache first
  if (priceDataCache) {
    return priceDataCache
  }

  // TASK-174: de-dupe concurrent callers onto a single in-flight load,
  // same pattern as ensureSetListLoaded's setListLoadPromise below.
  if (priceDataLoadPromise) {
    return priceDataLoadPromise
  }

  priceDataLoadPromise = (async () => {
    try {
      // Check IndexedDB cache
      const cachedData = await loadPriceDataFromCache()
      if (cachedData) {
        priceDataCache = cachedData
        return cachedData
      }

      console.info('Fetching MTGJSON price data...')

      const response = await fetchGzippedJson<{ data: Record<string, MTGJSONPriceFormats> }>(
        `${MTGJSON_API}/AllPricesToday.json.gz`
      )

      priceDataCache = response.data

      // Save to IndexedDB (async, don't await)
      savePriceDataToCache(response.data).then(() => {
        console.info('MTGJSON price data cached to IndexedDB')
      }).catch((e: unknown) => {
        console.warn('Failed to cache price data:', e)
      })

      console.info('MTGJSON price data loaded')
      return response.data
    } catch (error) {
      console.error('Error fetching MTGJSON price data:', error)
      throw error
    } finally {
      // Clear regardless of outcome: on success priceDataCache now short-
      // circuits future calls before this is even checked; on failure this
      // MUST clear so a later retry issues a fresh fetch instead of forever
      // returning/awaiting a promise that already rejected.
      priceDataLoadPromise = null
    }
  })()

  return priceDataLoadPromise
}

/**
 * Ensure the set of valid MTGJSON set codes is loaded into `validSetCodes`.
 *
 * MTGJSON does NOT publish a per-set file for every Scryfall set code (promos,
 * tokens, specialty codes like PLST / PTOKEN / TKHM …). Requesting those yields
 * a 404 + CORS console error that cannot be silenced from JS. By loading the
 * authoritative SetList once we can pre-filter and never make those requests.
 *
 * Caching: parsed codes are stored in IndexedDB under `setListCodes` together
 * with a timestamp, and refreshed after SET_LIST_REFRESH_MS.
 *
 * GRACEFUL DEGRADATION: if the SetList fetch/parse fails for any reason, we
 * leave `validSetCodes` empty. `isKnownMtgjsonSet` treats an empty set as
 * "unknown" and returns true, so callers fall back to the legacy
 * attempt-and-catch-404 behavior. Pricing is never blocked by this optimization.
 */
async function ensureSetListLoaded(): Promise<void> {
  // Already have it in memory for this session.
  if (validSetCodes.size > 0) return

  // De-dupe concurrent callers onto a single in-flight load.
  if (setListLoadPromise) return setListLoadPromise

  setListLoadPromise = (async () => {
    try {
      // 1. Try the IndexedDB cache first.
      const cached = await getFromDB<{ codes: string[]; timestamp: number }>(
        MAPPING_STORE,
        'setListCodes'
      )
      if (cached && Array.isArray(cached.codes) && cached.codes.length > 0) {
        const fresh = Date.now() - (cached.timestamp || 0) < SET_LIST_REFRESH_MS
        if (fresh) {
          validSetCodes = new Set(cached.codes)
          return
        }
      }

      // 2. Fetch + parse the authoritative SetList from MTGJSON.
      const response = await fetchGzippedJson<unknown>(`${MTGJSON_API}/SetList.json.gz`)
      const codes = parseSetListCodes(response)

      if (codes.size > 0) {
        validSetCodes = codes
        // Cache for next time (async, don't block).
        void saveToDB(MAPPING_STORE, 'setListCodes', {
          codes: Array.from(codes),
          timestamp: Date.now()
        })
        console.info(`MTGJSON SetList loaded: ${codes.size} valid set codes`)
      } else if (cached && Array.isArray(cached.codes) && cached.codes.length > 0) {
        // Parse produced nothing but we have a stale cache — use it rather than
        // degrade to no pre-filtering.
        validSetCodes = new Set(cached.codes)
      }
    } catch (error) {
      // Graceful degradation: leave validSetCodes empty → no pre-filtering.
      console.warn('[MTGJSON] SetList unavailable, set pre-filter disabled:', error)
    } finally {
      setListLoadPromise = null
    }
  })()

  return setListLoadPromise
}

/**
 * Fetch set data from MTGJSON and build scryfallId -> uuid mapping.
 * Exported for direct TASK-174 dedup tests.
 */
export async function fetchSetMapping(setCode: string): Promise<void> {
  const upper = setCode.toUpperCase()

  // Pre-filter: skip set codes MTGJSON does not publish a file for, to avoid
  // 404 + CORS console spam. When the SetList is unavailable (validSetCodes
  // empty), isKnownMtgjsonSet returns true and we fall back to fetching.
  if (!isKnownMtgjsonSet(setCode, validSetCodes)) {
    failedSets.add(upper)
    return
  }

  // Already fully loaded this session — a set's mapping doesn't change
  // mid-session, so a second call (e.g. a later card from the same set that
  // happens not to be in the map, or simply re-entering the same code) has
  // nothing new to fetch.
  if (loadedSets.has(upper)) {
    return
  }

  // TASK-174: de-dupe concurrent callers for the SAME set onto a single
  // in-flight load, same pattern as ensureSetListLoaded's setListLoadPromise
  // above — keyed per set since different sets are independent fetches.
  const existing = setMappingLoadPromises.get(upper)
  if (existing) {
    return existing
  }

  const loadPromise = (async () => {
    console.info(`Fetching MTGJSON set data for ${setCode}...`)

    try {
      const response = await fetchGzippedJson<{ data: { cards: { uuid: string; identifiers: { scryfallId?: string } }[] } }>(
        `${MTGJSON_API}/${upper}.json.gz`
      )

      let count = 0
      for (const card of response.data.cards || []) {
        if (card.uuid && card.identifiers?.scryfallId) {
          scryfallToUuidMap.set(card.identifiers.scryfallId, card.uuid)
          count++
        }
      }

      loadedSets.add(upper)
      console.info(`Loaded ${count} cards from ${setCode}`)
    } catch (error) {
      console.warn(`[MTGJSON] Set ${setCode} failed (will skip for this session):`, error)
      failedSets.add(upper)
    } finally {
      // Clear regardless of outcome — on success loadedSets now short-
      // circuits future calls above; on failure this MUST clear so a later
      // retry of the same set issues a fresh fetch instead of hanging on
      // (or silently no-op-ing against) an already-settled promise.
      setMappingLoadPromises.delete(upper)
    }
  })()

  setMappingLoadPromises.set(upper, loadPromise)
  return loadPromise
}

/**
 * Get Card Kingdom and other prices for a card by scryfallId
 */
export async function getCardPrices(scryfallId: string, setCode?: string): Promise<CardPrices | null> {
  try {
    // Load mapping from cache if not in memory
    if (scryfallToUuidMap.size === 0) {
      const cached = await loadMappingFromCache()
      if (cached) {
        scryfallToUuidMap = cached
      }
    }

    // If we don't have the mapping for this card, fetch the set data
    if (!scryfallToUuidMap.has(scryfallId) && setCode && !failedSets.has(setCode.toUpperCase())) {
      // Load the valid-set list once so fetchSetMapping can pre-filter 404s.
      await ensureSetListLoaded()
      await fetchSetMapping(setCode)
      // Save updated mapping (async)
      void saveMappingToCache(scryfallToUuidMap)
    }

    const uuid = scryfallToUuidMap.get(scryfallId)
    if (!uuid) {
      // Silent fail - many cards won't have MTGJSON UUIDs
      return null
    }

    // Fetch price data
    const priceData = await fetchPriceData()
    // eslint-disable-next-line security/detect-object-injection
    const cardPrices = priceData[uuid]

    if (!cardPrices?.paper) {
      return null
    }

    const result: CardPrices = {}

    // Card Kingdom prices
    if (cardPrices.paper.cardkingdom) {
      result.cardKingdom = {
        retail: getLatestPrice(cardPrices.paper.cardkingdom.retail?.normal),
        retailFoil: getLatestPrice(cardPrices.paper.cardkingdom.retail?.foil),
        buylist: getLatestPrice(cardPrices.paper.cardkingdom.buylist?.normal),
        buylistFoil: getLatestPrice(cardPrices.paper.cardkingdom.buylist?.foil),
      }
    }

    // TCGPlayer prices (from MTGJSON - may differ slightly from Scryfall)
    if (cardPrices.paper.tcgplayer) {
      result.tcgplayer = {
        retail: getLatestPrice(cardPrices.paper.tcgplayer.retail?.normal),
        retailFoil: getLatestPrice(cardPrices.paper.tcgplayer.retail?.foil),
      }
    }

    // Cardmarket prices
    if (cardPrices.paper.cardmarket) {
      result.cardmarket = {
        retail: getLatestPrice(cardPrices.paper.cardmarket.retail?.normal),
        retailFoil: getLatestPrice(cardPrices.paper.cardmarket.retail?.foil),
      }
    }

    return result
  } catch (error) {
    console.error('Error getting card prices:', error)
    return null
  }
}

/**
 * Preload set mappings in parallel batches.
 * Turns ~300 sequential set downloads into ~60 parallel batches of 5.
 */
export async function preloadSetMappings(setCodes: string[]): Promise<void> {
  // Filter out already-loaded and failed sets
  const needed = setCodes.filter(sc => {
    const upper = sc.toUpperCase()
    return !failedSets.has(upper) && !loadedSets.has(upper)
  })
  if (needed.length === 0) return

  // Load mapping from IndexedDB cache if not in memory
  if (scryfallToUuidMap.size === 0) {
    const cached = await loadMappingFromCache()
    if (cached) scryfallToUuidMap = cached

    // Restore which sets were previously cached so we don't re-fetch them
    const cachedSets = await getFromDB<string[]>(MAPPING_STORE, 'loadedSetCodes')
    if (cachedSets) {
      for (const sc of cachedSets) loadedSets.add(sc)
    }
  }

  // Filter again after loading cache — skip sets already in loadedSets
  const stillNeeded = needed.filter(sc => !loadedSets.has(sc.toUpperCase()))
  if (stillNeeded.length === 0) return

  // Load the valid-set list once so fetchSetMapping can pre-filter 404s.
  await ensureSetListLoaded()

  // Fetch in parallel batches of 5
  const CONCURRENCY = 5
  for (let i = 0; i < stillNeeded.length; i += CONCURRENCY) {
    const batch = stillNeeded.slice(i, i + CONCURRENCY)
    await Promise.allSettled(batch.map(sc => fetchSetMapping(sc)))
  }

  // Save updated mapping
  void saveMappingToCache(scryfallToUuidMap)
}

/**
 * Preload price data in the background
 * Call this on app startup to have prices ready
 */
export async function preloadPriceData(): Promise<void> {
  try {
    await fetchPriceData()
    console.info('MTGJSON price data preloaded')
  } catch (error) {
    console.warn('Failed to preload MTGJSON price data:', error)
  }
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return 'N/A'
  return `$${price.toFixed(2)}`
}
