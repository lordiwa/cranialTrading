/**
 * ETB-tapped land detection powered by Scryfall.
 *
 * Public surface:
 *   - isEtbTappedOracle(oracleText?): pure regex heuristic (synchronous).
 *   - detectEtbTappedLands(scryfallIds): batched Scryfall fetch with session cache.
 *
 * The service is intentionally tolerant of failures: any fetch error resolves to
 * a zero-state (`{ tappedCount: 0, tappedNames: [] }`) and logs a warning — the
 * UI is expected to degrade gracefully (no banner) rather than crash.
 */

import { getCardsByIds, type ScryfallCard } from './scryfall'

// ---------------------------------------------------------------------------
// Pure regex helper
// ---------------------------------------------------------------------------

// Match "enters tapped" or "enters the battlefield tapped" (word boundary after tapped).
const ETB_TAPPED_RX = /enters (the battlefield )?tapped\b/i

// How far after the "tapped" match we scan for an "unless" clause that disqualifies.
const UNLESS_WINDOW_CHARS = 60

/**
 * Returns true when the oracle text describes a land that enters the battlefield
 * tapped UNCONDITIONALLY. A following "unless …" clause (within ~60 chars of the
 * tapped phrase) disqualifies the match — that's the Glacial Fortress / checkland
 * heuristic.
 */
export function isEtbTappedOracle(oracleText?: string): boolean {
    if (!oracleText) return false
    const match = ETB_TAPPED_RX.exec(oracleText)
    if (!match) return false

    const end = (match.index ?? 0) + match[0].length
    const window = oracleText.slice(end, end + UNLESS_WINDOW_CHARS)
    if (/\bunless\b/i.test(window)) return false

    return true
}

// ---------------------------------------------------------------------------
// Session cache + async detection
// ---------------------------------------------------------------------------

// scryfallId -> whether the card is ETB-tapped (unconditionally)
// Also stores the display name for each tapped card (name is useful to the UI).
interface CacheEntry {
    tapped: boolean
    name: string
}

const sessionCache = new Map<string, CacheEntry>()

/** Test-only helper. Resets the module-level cache between test cases. */
export function __resetTappedLandsCache(): void {
    sessionCache.clear()
}

export interface DetectEtbTappedLandsResult {
    tappedCount: number
    tappedNames: string[]
}

/**
 * Given a list of scryfallIds (lands only — callers are expected to filter by
 * type_line upstream), returns how many are ETB-tapped and their display names.
 *
 * - Deduplicates input.
 * - Consults the module-level session cache first; only fetches unknown IDs.
 * - Batches via `getCardsByIds` (already rate-limited + 75/batch inside scryfall).
 * - On ANY error or rejection, resolves to `{ tappedCount: 0, tappedNames: [] }`.
 */
export async function detectEtbTappedLands(
    scryfallIds: string[]
): Promise<DetectEtbTappedLandsResult> {
    if (!scryfallIds || scryfallIds.length === 0) {
        return { tappedCount: 0, tappedNames: [] }
    }

    const uniqueIds = Array.from(new Set(scryfallIds.filter(Boolean)))
    if (uniqueIds.length === 0) {
        return { tappedCount: 0, tappedNames: [] }
    }

    // Partition into cached vs unknown
    const unknownIds: string[] = []
    for (const id of uniqueIds) {
        if (!sessionCache.has(id)) unknownIds.push(id)
    }

    // Fetch only the unknown subset
    if (unknownIds.length > 0) {
        try {
            const identifiers = unknownIds.map(id => ({ id }))
            const cards: ScryfallCard[] = await getCardsByIds(identifiers)

            // Build a quick id -> card map (Scryfall may return cards out of order)
            const byId = new Map<string, ScryfallCard>()
            for (const card of cards) {
                if (card?.id) byId.set(card.id, card)
            }

            // Seed cache for every unknownId — even if Scryfall didn't return it
            // (missing IDs get `tapped: false` so we don't re-fetch them forever).
            for (const id of unknownIds) {
                const card = byId.get(id)
                if (!card) {
                    sessionCache.set(id, { tapped: false, name: '' })
                    continue
                }
                const tapped = isEtbTappedOracle(card.oracle_text)
                sessionCache.set(id, { tapped, name: card.name })
            }
        } catch (error) {
            console.warn('[manaCurveLands] Scryfall fetch failed, degrading to zero-state:', error)
            return { tappedCount: 0, tappedNames: [] }
        }
    }

    // Aggregate results from cache
    const tappedNames: string[] = []
    const seenNames = new Set<string>()
    for (const id of uniqueIds) {
        const entry = sessionCache.get(id)
        if (entry?.tapped && entry.name && !seenNames.has(entry.name)) {
            tappedNames.push(entry.name)
            seenNames.add(entry.name)
        }
    }

    return {
        tappedCount: tappedNames.length,
        tappedNames,
    }
}
