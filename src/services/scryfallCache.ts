/**
 * Scryfall Cache Layer — 3-tier: L1 (in-memory) → L2 (Firestore) → L3 (Scryfall API)
 *
 * Transparently caches individual card lookups by scryfallId.
 * All other functions pass through to the raw scryfall service unchanged.
 */
import { Timestamp, collection, doc, documentId, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore' // eslint-disable-line sort-imports
import { db } from './firebase'
import {
  getCardById as rawGetCardById,
  getCardsByIds as rawGetCardsByIds,
  type ScryfallCard,
} from './scryfall'

// Re-export everything unchanged
export {
  searchCards,
  searchAdvanced,
  searchByMultipleCriteria,
  getCardSuggestions,
  getCardsByColor,
  getCardsByType,
  getCardsBySet,
  getCardsByPrice,
  getCardsByKeyword,
  getCardsByManaValue,
  getCardsByRarity,
  getCardsByFormat,
  getFoilCards,
  getFullArtCards,
  getCardsByPowerToughness,
  getAllSets,
} from './scryfall'

export type { ScryfallCard, ScryfallSet } from './scryfall'

// ── Constants ──────────────────────────────────────────────────────────────────

const COLLECTION = 'scryfall_cache'
const L1_MAX_SIZE = 500
const METADATA_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days
const PRICES_TTL = 24 * 60 * 60 * 1000         // 24 hours

// ── L1 in-memory cache ─────────────────────────────────────────────────────────

interface L1Entry {
  card: ScryfallCard
  insertedAt: number
}

let l1Cache = new Map<string, L1Entry>()

function l1Get(id: string): ScryfallCard | undefined {
  return l1Cache.get(id)?.card
}

function l1Set(card: ScryfallCard): void {
  if (l1Cache.size >= L1_MAX_SIZE && !l1Cache.has(card.id)) {
    // Evict oldest entry
    const oldestKey = l1Cache.keys().next().value
    if (oldestKey) l1Cache.delete(oldestKey)
  }
  l1Cache.set(card.id, { card, insertedAt: Date.now() })
}

// ── L2 Firestore helpers ───────────────────────────────────────────────────────

interface CacheMetadata {
  _cachedAt: { toMillis: () => number }
  _metadataUpdatedAt: { toMillis: () => number }
  _pricesUpdatedAt: { toMillis: () => number }
}

function isMetadataFresh(meta: CacheMetadata): boolean {
  return Date.now() - meta._metadataUpdatedAt.toMillis() < METADATA_TTL
}

function arePricesFresh(meta: CacheMetadata): boolean {
  return Date.now() - meta._pricesUpdatedAt.toMillis() < PRICES_TTL
}

function stripCacheMetadata(data: Record<string, unknown>): ScryfallCard {
  const { _cachedAt, _metadataUpdatedAt, _pricesUpdatedAt, ...card } = data
  return card as unknown as ScryfallCard
}

async function l2Get(id: string): Promise<{ card: ScryfallCard; metaFresh: boolean; pricesFresh: boolean } | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null

  const data = snap.data() as ScryfallCard & CacheMetadata
  const card = stripCacheMetadata(data as unknown as Record<string, unknown>)
  return {
    card,
    metaFresh: isMetadataFresh(data),
    pricesFresh: arePricesFresh(data),
  }
}

function l2Write(card: ScryfallCard): void {
  const now = Timestamp.now()
  const ref = doc(db, COLLECTION, card.id)
  setDoc(ref, {
    ...card,
    _cachedAt: now,
    _metadataUpdatedAt: now,
    _pricesUpdatedAt: now,
  }).catch((err: unknown) => { console.warn('[ScryfallCache] L2 write failed:', err) })
}

function l2RefreshPrices(id: string, prices: ScryfallCard['prices']): void {
  const ref = doc(db, COLLECTION, id)
  updateDoc(ref, {
    prices,
    _pricesUpdatedAt: Timestamp.now(),
  }).catch((err: unknown) => { console.warn('[ScryfallCache] price refresh failed:', err) })
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getCardById(id: string): Promise<ScryfallCard | null> {
  // L1
  const l1Hit = l1Get(id)
  if (l1Hit) return l1Hit

  // L2
  try {
    const l2Result = await l2Get(id)
    if (l2Result) {
      if (l2Result.metaFresh) {
        l1Set(l2Result.card)

        // Background price refresh if stale
        if (!l2Result.pricesFresh) {
          rawGetCardById(id).then(fresh => {
            if (fresh) {
              l1Set(fresh)
              l2RefreshPrices(id, fresh.prices)
            }
          }).catch(() => {})
        }

        return l2Result.card
      }
      // Stale metadata → treat as miss, fall through to Scryfall
    }
  } catch (err) {
    console.warn('[ScryfallCache] L2 read failed, falling through to Scryfall:', err)
  }

  // L3 — Scryfall
  const card = await rawGetCardById(id)
  if (card) {
    l1Set(card)
    l2Write(card)
  }
  return card
}

export async function getCardsByIds(
  identifiers: ({ id: string } | { name: string })[],
  onProgress?: (current: number, total: number) => void
): Promise<ScryfallCard[]> {
  if (identifiers.length === 0) return []

  const results: ScryfallCard[] = []
  const nameIdentifiers: { name: string }[] = []
  const l2Needed: { id: string }[] = []

  // Partition: L1 hits, name-based (→ Scryfall), id-based L1 misses (→ L2)
  for (const ident of identifiers) {
    if ('name' in ident) {
      nameIdentifiers.push(ident)
      continue
    }
    const l1Hit = l1Get(ident.id)
    if (l1Hit) {
      results.push(l1Hit)
    } else {
      l2Needed.push(ident)
    }
  }

  onProgress?.(results.length, identifiers.length)

  // L2 batch read for id-based misses — bulk query per chunk
  const l2Misses: { id: string }[] = []
  if (l2Needed.length > 0) {
    const CHUNK_SIZE = 10
    let l2Available = true

    for (let i = 0; i < l2Needed.length; i += CHUNK_SIZE) {
      const chunk = l2Needed.slice(i, i + CHUNK_SIZE)
      const chunkIds = chunk.map(ident => ident.id)

      if (!l2Available) {
        for (const ident of chunk) {
          l2Misses.push(ident)
        }
        onProgress?.(results.length, identifiers.length)
        continue
      }

      try {
        const snapshot = await getDocs(query(
          collection(db, COLLECTION),
          where(documentId(), 'in', chunkIds)
        ))

        const returnedIds = new Set<string>()
        for (const snap of snapshot.docs) {
          returnedIds.add(snap.id)
          const data = snap.data() as ScryfallCard & CacheMetadata
          if (isMetadataFresh(data)) {
            const card = stripCacheMetadata(data as unknown as Record<string, unknown>)
            l1Set(card)
            results.push(card)
          } else {
            l2Misses.push({ id: snap.id })
          }
        }

        // IDs not in snapshot = cache misses
        for (const id of chunkIds) {
          if (!returnedIds.has(id)) {
            l2Misses.push({ id })
          }
        }
      } catch {
        l2Available = false
        for (const ident of chunk) {
          l2Misses.push(ident)
        }
      }

      onProgress?.(results.length, identifiers.length)
    }
  }

  // Scryfall for L2 misses + name identifiers
  const scryfallNeeded = [...l2Misses, ...nameIdentifiers]
  if (scryfallNeeded.length > 0) {
    const l3Offset = results.length
    const scryfallResults = await rawGetCardsByIds(scryfallNeeded, onProgress
      ? (cur, _tot) => { onProgress(l3Offset + cur, identifiers.length) }
      : undefined)
    for (const card of scryfallResults) {
      l1Set(card)
      l2Write(card)
      results.push(card)
    }
  }

  return results
}

// ── Testing helper ─────────────────────────────────────────────────────────────

export function _resetCacheForTesting(): void {
  l1Cache = new Map()
}
