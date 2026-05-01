/**
 * mana_cost hydration via Scryfall (cached).
 *
 * SCRUM-42 needs the full `mana_cost` string (e.g. `{W}{W}{U}`) on hydrated
 * deck cards to compute color demand. `mana_cost` is intentionally NOT in
 * `card_index` (would add ~1.7MB per user with no search benefit), so we fetch
 * it on-demand via `scryfallCache.getCardsByIds` which already provides L1
 * in-memory + L2 Firestore caching.
 *
 * Failure mode: any fetch error resolves to an empty map (no rethrow), and
 * UI consumers should degrade gracefully (color analysis becomes unavailable
 * or shows zero demand for missing cards).
 *
 * Modeled after `manaCurveLands.ts`.
 */

import { getCardsByIds, type ScryfallCard } from './scryfallCache'

// scryfallId -> mana_cost string (or empty string for "fetched but unknown")
const sessionCache = new Map<string, string>()

/** Test-only helper. Resets the module-level cache between test cases. */
export function __resetManaCostCache(): void {
    sessionCache.clear()
}

/**
 * Given a list of scryfallIds, returns a Map<scryfallId, mana_cost>. IDs that
 * cannot be resolved get an empty string entry to prevent re-fetching forever.
 *
 * - Deduplicates input.
 * - Consults the module-level session cache first; only fetches unknown IDs.
 * - Batches via `getCardsByIds` (rate-limited + chunked in scryfall).
 * - On ANY error or rejection, resolves to an empty Map and logs a warning.
 */
export async function hydrateManaCosts(
    scryfallIds: string[]
): Promise<Map<string, string>> {
    if (!scryfallIds || scryfallIds.length === 0) {
        return new Map()
    }

    const uniqueIds = Array.from(new Set(scryfallIds.filter(Boolean)))
    if (uniqueIds.length === 0) {
        return new Map()
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

            // Build a quick id -> mana_cost map (Scryfall may return cards out of order).
            // For MDFCs (modal_dfc / transform / etc.), top-level `mana_cost` is empty;
            // the actual front-face cost lives in `card_faces[0].mana_cost`.
            const byId = new Map<string, string>()
            for (const card of cards) {
                if (!card?.id) continue
                const topLevel = card.mana_cost ?? ''
                if (topLevel) {
                    byId.set(card.id, topLevel)
                    continue
                }
                const faces = (card as ScryfallCard & { card_faces?: { mana_cost?: string }[] }).card_faces
                const frontFaceCost = faces?.[0]?.mana_cost ?? ''
                byId.set(card.id, frontFaceCost)
            }

            // Seed cache for every unknownId — even if Scryfall didn't return it
            // (missing IDs get '' so we don't re-fetch them forever).
            for (const id of unknownIds) {
                sessionCache.set(id, byId.get(id) ?? '')
            }
        } catch (error) {
            console.warn('[manaCostHydration] Scryfall fetch failed, returning empty map:', error)
            return new Map()
        }
    }

    // Aggregate results from cache (only requested IDs, not the whole cache)
    const result = new Map<string, string>()
    for (const id of uniqueIds) {
        const value = sessionCache.get(id)
        if (value !== undefined) result.set(id, value)
    }

    return result
}
