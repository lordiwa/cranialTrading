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

// IndexedDB configuration
const DB_NAME = 'mtgjson_cache'
const DB_VERSION = 1
const PRICE_STORE = 'prices'
const MAPPING_STORE = 'mappings'

// Cache keys for localStorage (small data only)
const SET_CACHE_PREFIX = 'mtgjson_set_'

// API base URL
const MTGJSON_API = 'https://mtgjson.com/api/v5'

// In-memory caches
let priceDataCache: Record<string, MTGJSONPriceFormats> | null = null
let scryfallToUuidMap = new Map<string, string>()
let dbInstance: IDBDatabase | null = null
const failedSets = new Set<string>()

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
 * Open/create the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
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

    request.onsuccess = () => {
      dbInstance = request.result
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

/**
 * Clear all data from a store
 */
async function clearStore(storeName: string): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      store.clear()
      resolve()
    })
  } catch {
    // Ignore errors
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
const MAX_MAPPING_ENTRIES = 10000

async function saveMappingToCache(map: Map<string, string>): Promise<void> {
  let mapToSave = map
  if (map.size > MAX_MAPPING_ENTRIES) {
    const entries = Array.from(map.entries())
    mapToSave = new Map(entries.slice(-MAX_MAPPING_ENTRIES))
  }

  const obj = Object.fromEntries(mapToSave)
  await saveToDB(MAPPING_STORE, 'scryfallToUuid', obj)
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
    return JSON.parse(text)
  }

  return response.json()
}

/**
 * Fetch price data from MTGJSON (AllPricesToday)
 */
async function fetchPriceData(): Promise<Record<string, MTGJSONPriceFormats>> {
  // Check memory cache first
  if (priceDataCache) {
    return priceDataCache
  }

  // Check IndexedDB cache
  const cachedData = await loadPriceDataFromCache()
  if (cachedData) {
    priceDataCache = cachedData
    return cachedData
  }

  console.log('Fetching MTGJSON price data...')

  try {
    const response = await fetchGzippedJson<{ data: Record<string, MTGJSONPriceFormats> }>(
      `${MTGJSON_API}/AllPricesToday.json.gz`
    )

    priceDataCache = response.data

    // Save to IndexedDB (async, don't await)
    savePriceDataToCache(response.data).then(() => {
      console.log('MTGJSON price data cached to IndexedDB')
    }).catch((e: unknown) => {
      console.warn('Failed to cache price data:', e)
    })

    console.log('MTGJSON price data loaded')
    return response.data
  } catch (error) {
    console.error('Error fetching MTGJSON price data:', error)
    throw error
  }
}

/**
 * Fetch set data from MTGJSON and build scryfallId -> uuid mapping
 */
async function fetchSetMapping(setCode: string): Promise<void> {
  console.log(`Fetching MTGJSON set data for ${setCode}...`)

  try {
    const response = await fetchGzippedJson<{ data: { cards: { uuid: string; identifiers: { scryfallId?: string } }[] } }>(
      `${MTGJSON_API}/${setCode.toUpperCase()}.json.gz`
    )

    let count = 0
    for (const card of response.data.cards || []) {
      if (card.uuid && card.identifiers?.scryfallId) {
        scryfallToUuidMap.set(card.identifiers.scryfallId, card.uuid)
        count++
      }
    }

    console.log(`Loaded ${count} cards from ${setCode}`)
  } catch (error) {
    console.warn(`[MTGJSON] Set ${setCode} failed (will skip for this session):`, error)
    failedSets.add(setCode.toUpperCase())
  }
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
      await fetchSetMapping(setCode)
      // Save updated mapping (async)
      saveMappingToCache(scryfallToUuidMap)
    }

    const uuid = scryfallToUuidMap.get(scryfallId)
    if (!uuid) {
      // Silent fail - many cards won't have MTGJSON UUIDs
      return null
    }

    // Fetch price data
    const priceData = await fetchPriceData()
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
 * Preload price data in the background
 * Call this on app startup to have prices ready
 */
export async function preloadPriceData(): Promise<void> {
  try {
    await fetchPriceData()
    console.log('MTGJSON price data preloaded')
  } catch (error) {
    console.warn('Failed to preload MTGJSON price data:', error)
  }
}

/**
 * Clear all MTGJSON caches (IndexedDB + localStorage)
 */
export async function clearMTGJSONCache(): Promise<void> {
  priceDataCache = null
  scryfallToUuidMap.clear()
  failedSets.clear()

  // Clear IndexedDB
  await clearStore(PRICE_STORE)
  await clearStore(MAPPING_STORE)

  // Clear localStorage set caches
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(SET_CACHE_PREFIX)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => { localStorage.removeItem(key); })

  // Also remove old localStorage keys if they exist
  localStorage.removeItem('mtgjson_prices')
  localStorage.removeItem('mtgjson_prices_date')
  localStorage.removeItem('mtgjson_scryfall_mapping')

  console.log('MTGJSON cache cleared')
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return 'N/A'
  return `$${price.toFixed(2)}`
}
