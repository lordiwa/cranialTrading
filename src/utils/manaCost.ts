/**
 * Mana cost parsing + color analysis helpers (SCRUM-42).
 *
 * `parseManaCost` turns a Scryfall `mana_cost` string into per-color symbol
 * counts. Hybrid pips count 1 to EACH color they can pay (per ticket decision)
 * — this inflates demand for hybrid cards but reflects the real flexibility
 * the user has at the casting moment.
 *
 * `calculateColorAnalysis` aggregates demand (mana symbols in non-land cards)
 * vs sources (produced_mana of lands), respecting allocatedQuantity.
 */

import type { HydratedDeckCard } from '@/types/deck'

export interface ColorBreakdown {
    W: number
    U: number
    B: number
    R: number
    G: number
    C: number
    generic: number
}

const EMPTY_BREAKDOWN = (): ColorBreakdown => ({
    W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0,
})

const COLOR_KEYS = new Set(['W', 'U', 'B', 'R', 'G'])
const TOKEN_RX = /\{([^}]+)\}/g

/**
 * Parse a Scryfall mana_cost string into per-color and generic symbol counts.
 *
 * Rules (locked in SCRUM-42 grooming):
 * - WUBRG pips → 1 to that color.
 * - Hybrid `{W/U}` → 1 to W AND 1 to U (max color flexibility).
 * - Phyrexian `{W/P}` → 1 to color (assume mana payment).
 * - 2-hybrid `{2/W}` → 1 to color (best path) + 2 to generic (alt path).
 * - Generic numbers `{2}`, `{12}` → add value to generic. `{0}` → nothing.
 * - `{X}`, `{Y}`, `{Z}` → ignored (variable demand).
 * - `{C}` → 1 to colorless. `{S}` → 1 to generic (snow ≈ generic).
 * - Unknown tokens → ignored silently.
 */
export function parseManaCost(manaCost: string): ColorBreakdown {
    const out = EMPTY_BREAKDOWN()
    if (!manaCost) return out

    const matches = manaCost.matchAll(TOKEN_RX)
    for (const match of matches) {
        const token = match[1]?.toUpperCase()
        if (!token) continue

        if (COLOR_KEYS.has(token)) {
            out[token as 'W' | 'U' | 'B' | 'R' | 'G']++
            continue
        }

        if (token === 'C') {
            out.C++
            continue
        }

        if (token === 'S') {
            out.generic++
            continue
        }

        if (token === 'X' || token === 'Y' || token === 'Z') {
            continue
        }

        // Pure integer → generic (handles {0}, {2}, {12}, etc.)
        if (/^\d+$/.test(token)) {
            out.generic += parseInt(token, 10)
            continue
        }

        // Hybrid forms: split on '/'
        if (token.includes('/')) {
            const parts = token.split('/')
            // Phyrexian: one part is 'P'
            if (parts.includes('P')) {
                for (const p of parts) {
                    if (COLOR_KEYS.has(p)) {
                        out[p as 'W' | 'U' | 'B' | 'R' | 'G']++
                    }
                }
                continue
            }
            // 2-hybrid: one part is a number (e.g. {2/W})
            const numericPart = parts.find(p => /^\d+$/.test(p))
            if (numericPart) {
                out.generic += parseInt(numericPart, 10)
                for (const p of parts) {
                    if (COLOR_KEYS.has(p)) {
                        out[p as 'W' | 'U' | 'B' | 'R' | 'G']++
                    }
                }
                continue
            }
            // Standard hybrid: {W/U}, {B/G}, etc. → 1 to each color
            for (const p of parts) {
                if (COLOR_KEYS.has(p)) {
                    out[p as 'W' | 'U' | 'B' | 'R' | 'G']++
                }
            }
            continue
        }

        // Anything else → ignore
    }

    return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Color analysis: demand vs sources per color
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorChannelAnalysis {
    demand: number
    sources: number
}

export interface ColorAnalysis {
    W: ColorChannelAnalysis
    U: ColorChannelAnalysis
    B: ColorChannelAnalysis
    R: ColorChannelAnalysis
    G: ColorChannelAnalysis
}

const EMPTY_ANALYSIS = (): ColorAnalysis => ({
    W: { demand: 0, sources: 0 },
    U: { demand: 0, sources: 0 },
    B: { demand: 0, sources: 0 },
    R: { demand: 0, sources: 0 },
    G: { demand: 0, sources: 0 },
})

const isLand = (typeLine?: string): boolean =>
    !!typeLine && /\bLand\b/i.test(typeLine)

/**
 * Aggregate per-color demand (mana symbols in non-land card costs) and sources
 * (produced_mana of lands) across a hydrated card list, multiplied by each
 * card's `allocatedQuantity`.
 *
 * - Lands NEVER contribute to `demand` (even Dryad Arbor's `{G}` cost).
 * - Non-land cards without `mana_cost` contribute 0 demand silently.
 * - Dual / triple lands contribute to every color in `produced_mana`.
 */
export function calculateColorAnalysis(cards: HydratedDeckCard[]): ColorAnalysis {
    const out = EMPTY_ANALYSIS()

    for (const card of cards) {
        const qty = card.allocatedQuantity || 0
        if (qty <= 0) continue

        const cardIsLand = isLand(card.type_line)

        // Sources: any card with produced_mana (typically lands) contributes.
        if (card.produced_mana && card.produced_mana.length > 0) {
            for (const c of card.produced_mana) {
                if (c === 'W' || c === 'U' || c === 'B' || c === 'R' || c === 'G') {
                    out[c].sources += qty
                }
            }
        }

        // Demand: non-land cards with mana_cost contribute. Lands skip even if they
        // have a casting cost (Dryad Arbor has {G} but should not count as demand).
        if (!cardIsLand && card.mana_cost) {
            const breakdown = parseManaCost(card.mana_cost)
            out.W.demand += breakdown.W * qty
            out.U.demand += breakdown.U * qty
            out.B.demand += breakdown.B * qty
            out.R.demand += breakdown.R * qty
            out.G.demand += breakdown.G * qty
        }
    }

    return out
}
