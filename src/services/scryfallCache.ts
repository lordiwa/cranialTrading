/**
 * Scryfall Cache Layer — 2-tier: L1 (in-memory) → L2 (Firestore read-only) → L3 (Scryfall API)
 *
 * L2 (Firestore scryfall_cache) is now written ONLY by Cloud Functions.
 * Client-side reads from L2 but never writes to it.
 *
 * All other functions pass through to the raw scryfall service unchanged.
 */
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore'
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

// ── L2 Firestore helpers (read-only) ────────────────────────────────────────────

interface CacheMetadata {
  _cachedAt: { toMillis: () => number }
  _metadataUpdatedAt: { toMillis: () => number }
  _pricesUpdatedAt: { toMillis: () => number }
}

function isMetadataFresh(meta: CacheMetadata): boolean {
  return Date.now() - meta._metadataUpdatedAt.toMillis() < METADATA_TTL
}

function stripCacheMetadata(data: Record<string, unknown>): ScryfallCard {
  const { _cachedAt, _metadataUpdatedAt, _pricesUpdatedAt, ...card } = data
  return card as unknown as ScryfallCard
}

async function l2Get(id: string): Promise<{ card: ScryfallCard; metaFresh: boolean } | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null

  const data = snap.data() as ScryfallCard & CacheMetadata
  const card = stripCacheMetadata(data as unknown as Record<string, unknown>)
  return {
    card,
    metaFresh: isMetadataFresh(data),
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getCardById(id: string): Promise<ScryfallCard | null> {
  // L1
  const l1Hit = l1Get(id)
  if (l1Hit) return l1Hit

  // L2 (read-only)
  try {
    const l2Result = await l2Get(id)
    if (l2Result?.metaFresh) {
      l1Set(l2Result.card)
      return l2Result.card
    }
  } catch (err) {
    console.warn('[ScryfallCache] L2 read failed, falling through to Scryfall:', err)
  }

  // L3 — Scryfall API (no client-side write to L2 anymore)
  const card = await rawGetCardById(id)
  if (card) {
    l1Set(card)
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

  // L2 batch read for id-based misses — bulk query per chunk (read-only)
  const l2Misses: { id: string }[] = []
  if (l2Needed.length > 0) {
    const CHUNK_SIZE = 30  // Firestore 'in' operator limit
    const MISS_THRESHOLD = 3  // skip L2 after N consecutive all-miss chunks
    let l2Available = true
    let consecutiveMissChunks = 0

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
        let chunkHits = 0
        for (const snap of snapshot.docs) {
          returnedIds.add(snap.id)
          const data = snap.data() as ScryfallCard & CacheMetadata
          if (isMetadataFresh(data)) {
            const card = stripCacheMetadata(data as unknown as Record<string, unknown>)
            l1Set(card)
            results.push(card)
            chunkHits++
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

        // Miss-rate early exit: skip remaining L2 if cache appears empty
        if (chunkHits === 0) {
          consecutiveMissChunks++
          if (consecutiveMissChunks >= MISS_THRESHOLD) {
            for (let j = i + CHUNK_SIZE; j < l2Needed.length; j++) {
              l2Misses.push(l2Needed[j]!)
            }
            break
          }
        } else {
          consecutiveMissChunks = 0
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

  // Scryfall API for L2 misses + name identifiers (no client-side L2 write)
  const scryfallNeeded = [...l2Misses, ...nameIdentifiers]
  if (scryfallNeeded.length > 0) {
    const l3Offset = results.length
    const scryfallResults = await rawGetCardsByIds(scryfallNeeded, onProgress
      ? (cur, _tot) => { onProgress(l3Offset + cur, identifiers.length) }
      : undefined)
    for (const card of scryfallResults) {
      l1Set(card)
      results.push(card)
    }
  }

  return results
}

// ── Testing helper ─────────────────────────────────────────────────────────────

export function _resetCacheForTesting(): void {
  l1Cache = new Map()
}
