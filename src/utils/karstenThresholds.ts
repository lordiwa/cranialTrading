/**
 * Frank Karsten "How Many Sources Do You Need" thresholds.
 *
 * Source: Karsten 2022 update (TCGPlayer) for 60-card decks, Karsten 2018
 * Commander update for 99-card decks. Both target 90% confidence of casting
 * a spell on its earliest possible turn.
 *
 * Each table is indexed by `[pips][cmc]` (1-based for both axes — index 0 is
 * a sentinel for "no demand"). Out-of-range CMC clamps to the nearest edge.
 * Out-of-range pips (>=4) extrapolates using `+2 sources per extra pip`.
 *
 * Public API: `karstenSourcesNeeded(cmc, pips, deckSize)`.
 */

export type DeckSize = 60 | 99

// 60-card constructed (Karsten 2022). Rows = pips of the analyzed color.
// Cols = converted mana cost. -1 means "spell not playable on its expected turn"
// (CMC < pips, e.g. cmc 1 with 2 pips), which we treat as "fallback to next CMC".
const TABLE_60: Record<number, Record<number, number>> = {
    1: { 1: 14, 2: 13, 3: 12, 4: 11, 5: 10, 6: 9,  7: 9 },
    2: { 1: -1, 2: 21, 3: 19, 4: 18, 5: 16, 6: 15, 7: 14 },
    3: { 1: -1, 2: -1, 3: 23, 4: 22, 5: 20, 6: 19, 7: 18 },
}

// 99-card Commander (Karsten 2018 EDH). Higher variance → more sources required.
const TABLE_99: Record<number, Record<number, number>> = {
    1: { 1: 21, 2: 19, 3: 18, 4: 16, 5: 15, 6: 14, 7: 13 },
    2: { 1: -1, 2: 30, 3: 28, 4: 26, 5: 24, 6: 22, 7: 21 },
    3: { 1: -1, 2: -1, 3: 36, 4: 34, 5: 32, 6: 30, 7: 28 },
}

const MAX_CMC = 7
const MAX_PIPS_IN_TABLE = 3
const PIPS_OVERFLOW_PENALTY = 2 // each pip beyond 3 adds 2 sources (heuristic)

function lookup(table: Record<number, Record<number, number>>, cmc: number, pips: number): number {
    if (pips <= 0) return 0

    // Clamp CMC: 0/free spells use CMC 1 row; CMC > 7 uses CMC 7 row.
    const effectiveCmc = Math.max(1, Math.min(cmc, MAX_CMC))

    if (pips <= MAX_PIPS_IN_TABLE) {
        const row = table[pips]
        if (!row) return 0
        const value = row[effectiveCmc]
        // Spell with more pips than CMC (e.g. cmc 1 cost {U}{U}? impossible but defensive):
        // bump to the nearest playable CMC slot for that pip count.
        if (value === undefined || value < 0) {
            // Walk up CMC until a valid value appears.
            for (let c = effectiveCmc + 1; c <= MAX_CMC; c++) {
                const v = row[c]
                if (v !== undefined && v >= 0) return v
            }
            // Fallback: use the topmost valid row.
            const lastValid = Object.values(row).filter(v => v >= 0)
            return lastValid.length > 0 ? Math.max(...lastValid) : 0
        }
        return value
    }

    // Pips > 3: use pips=3 threshold + penalty per extra pip.
    const base = lookup(table, cmc, MAX_PIPS_IN_TABLE)
    const extraPips = pips - MAX_PIPS_IN_TABLE
    return base + extraPips * PIPS_OVERFLOW_PENALTY
}

/**
 * Returns the minimum number of color-producing lands a deck needs to cast a
 * spell with the given converted mana cost and number of pips of a single
 * color, with ~90% confidence on the spell's earliest possible turn.
 *
 * Examples:
 *   karstenSourcesNeeded(1, 1, 60) === 14   // {U} on T1
 *   karstenSourcesNeeded(2, 2, 60) === 21   // {U}{U} on T2
 *   karstenSourcesNeeded(2, 2, 99) === 30   // same in Commander
 *
 * Edge handling:
 *   - cmc <= 0 treated as cmc 1.
 *   - cmc > 7 clamped to cmc 7.
 *   - pips > 3 falls back to pips=3 + 2 sources per extra pip.
 *   - pips <= 0 returns 0.
 */
export function karstenSourcesNeeded(
    cmc: number,
    pips: number,
    deckSize: DeckSize
): number {
    const table = deckSize === 99 ? TABLE_99 : TABLE_60
    return lookup(table, cmc, pips)
}
