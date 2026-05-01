/**
 * useDeckManaCosts — reactively hydrates `mana_cost` onto a list of hydrated
 * deck cards by fetching from Scryfall (with cache) on demand.
 *
 * The base hydration in `useDeckDisplayCards` does not include `mana_cost`
 * because it is not stored in `card_index` (omitted to keep the index small).
 * This composable enriches the existing `HydratedDeckCard[]` reactively as new
 * scryfallIds appear, without mutating the original objects.
 *
 * Failure mode: if hydration fails, cards remain with `mana_cost: undefined`
 * and downstream `calculateColorAnalysis` simply omits them from demand.
 */

import { computed, type ComputedRef, ref, type Ref, watch } from 'vue'
import { hydrateManaCosts } from '@/services/manaCostHydration'
import type { HydratedDeckCard } from '@/types/deck'

export interface UseDeckManaCostsResult {
    /** scryfallId -> mana_cost string (or '' for "fetched but unknown") */
    manaCostsMap: Ref<Map<string, string>>
    /** Same cards as input, but with `mana_cost` populated where available */
    cardsWithManaCost: ComputedRef<HydratedDeckCard[]>
}

export function useDeckManaCosts(
    cards: ComputedRef<HydratedDeckCard[]>
): UseDeckManaCostsResult {
    const manaCostsMap = ref<Map<string, string>>(new Map())

    // Watch the unique scryfallIds present in the input. Any new ID triggers a
    // single hydration fetch (cached upstream).
    watch(
        () => {
            const ids = new Set<string>()
            for (const c of cards.value) {
                if (c.scryfallId) ids.add(c.scryfallId)
            }
            return Array.from(ids).sort().join('|')
        },
        async (signature) => {
            if (!signature) return
            const ids = signature.split('|').filter(Boolean)
            if (ids.length === 0) return
            const fresh = await hydrateManaCosts(ids)
            // Merge into existing map (do not lose previously-cached entries
            // for cards that just left the deck).
            const next = new Map(manaCostsMap.value)
            for (const [k, v] of fresh) next.set(k, v)
            manaCostsMap.value = next
        },
        { immediate: true }
    )

    const cardsWithManaCost = computed<HydratedDeckCard[]>(() => {
        const map = manaCostsMap.value
        if (map.size === 0) return cards.value
        return cards.value.map(card => {
            const cost = map.get(card.scryfallId)
            if (cost === undefined) return card
            return { ...card, mana_cost: cost }
        })
    })

    return { manaCostsMap, cardsWithManaCost }
}
