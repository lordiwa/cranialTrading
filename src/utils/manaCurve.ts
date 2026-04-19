/**
 * Pure hypergeometric math + mana-curve builder.
 *
 * No Vue, no Firebase, no network. Safe to use in unit tests.
 *
 * Terminology:
 *   - N: deck size (population)
 *   - L: number of lands in the deck (successes in population)
 *   - n: cards seen (sample size)
 *   - k: minimum lands needed (threshold)
 *   - hypergeomAtLeast returns P(X >= k) where X ~ Hypergeometric(N, L, n)
 *
 * On-play turn k: the player has drawn 7 + (k - 1) cards (opening hand + k - 1 draws).
 * On-draw turn k: the player has drawn 7 + k cards (opening hand + k draws).
 */

// ---------------------------------------------------------------------------
// logFactorial — module-level memoization, safe up to n >= 260.
// ---------------------------------------------------------------------------

const logFactCache: number[] = [0] // log(0!) = 0, log(1!) = 0

export function logFactorial(n: number): number {
    if (n <= 1) return 0
    const cached = logFactCache[n]
    if (cached !== undefined) return cached
    // Fill incrementally from last cached value
    for (let i = logFactCache.length; i <= n; i++) {
        const prev = logFactCache[i - 1] ?? 0
        logFactCache[i] = prev + Math.log(i)
    }
    return logFactCache[n] ?? 0
}

// log(C(n, k)) = log(n!) - log(k!) - log((n-k)!)
function logBinomial(n: number, k: number): number {
    if (k < 0 || k > n) return -Infinity
    return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

/**
 * P(X >= k) where X ~ Hypergeometric(N, L, n).
 *
 * Guards:
 *   - k <= 0  → 1 (trivially true)
 *   - k > min(n, L) → 0 (impossible)
 *   - L <= 0 with k > 0 → 0
 *   - N <= 0 → 0
 *
 * Uses logC to avoid factorial overflow on large decks.
 * Clamps result into [0, 1].
 */
export function hypergeomAtLeast(N: number, L: number, n: number, k: number): number {
    if (k <= 0) return 1
    if (N <= 0) return 0
    if (L <= 0) return 0
    const maxHits = Math.min(n, L)
    if (k > maxHits) return 0

    const logDenom = logBinomial(N, n)
    if (!Number.isFinite(logDenom)) return 0

    let p = 0
    for (let i = k; i <= maxHits; i++) {
        const logTerm = logBinomial(L, i) + logBinomial(N - L, n - i) - logDenom
        if (Number.isFinite(logTerm)) {
            p += Math.exp(logTerm)
        }
    }

    // Clamp tiny floating-point overshoot
    if (p < 0) return 0
    if (p > 1) return 1
    return p
}

// ---------------------------------------------------------------------------
// buildManaCurve — bucket cards by CMC and compute per-bucket probabilities.
// ---------------------------------------------------------------------------

export interface ManaCurveCardInput {
    cmc: number | undefined
    type_line: string
    allocatedQuantity: number
}

export interface ManaCurveBucket {
    cmc: number
    count: number
    pOnPlay: number
    pOnDraw: number
}

export interface ManaCurveResult {
    buckets: ManaCurveBucket[]
    totalCards: number
    landCount: number
    maxCmc: number
}

export interface BuildManaCurveOptions {
    deckSize: number
    landCount: number
    handSize?: number // default 7 — opening hand
}

function isLandTypeLine(typeLine: string | undefined): boolean {
    if (!typeLine) return false
    return /\bland\b/i.test(typeLine)
}

export function buildManaCurve(
    cards: ManaCurveCardInput[],
    opts: BuildManaCurveOptions
): ManaCurveResult {
    const handSize = opts.handSize ?? 7
    const { deckSize, landCount } = opts

    // Aggregate counts per CMC bucket + compute total + max CMC
    const countsByCmc = new Map<number, number>()
    let totalCards = 0
    let maxCmc = 0

    for (const card of cards) {
        const cmc = Number.isFinite(card.cmc) && card.cmc !== undefined ? Math.max(0, Math.floor(card.cmc)) : 0
        const qty = card.allocatedQuantity ?? 0
        if (qty <= 0) continue
        countsByCmc.set(cmc, (countsByCmc.get(cmc) ?? 0) + qty)
        totalCards += qty
        if (cmc > maxCmc) maxCmc = cmc
    }

    // Build buckets for every integer CMC from 0..maxCmc (no gaps)
    const buckets: ManaCurveBucket[] = []
    for (let k = 0; k <= maxCmc; k++) {
        const count = countsByCmc.get(k) ?? 0
        // On-play turn k: 7 + (k - 1) cards seen (but k = 0 short-circuits to P = 1 via hypergeom guard)
        const seenOnPlay = handSize + Math.max(0, k - 1)
        const seenOnDraw = handSize + k
        const pOnPlay = hypergeomAtLeast(deckSize, landCount, seenOnPlay, k)
        const pOnDraw = hypergeomAtLeast(deckSize, landCount, seenOnDraw, k)
        buckets.push({ cmc: k, count, pOnPlay, pOnDraw })
    }

    return {
        buckets,
        totalCards,
        landCount,
        maxCmc,
    }
}

// isLandTypeLine is exposed indirectly via the curve builder; callers who need to
// detect lands themselves (e.g. DeckManaCurve.vue) can use the same /\bland\b/i
// regex directly — we deliberately keep it inline there to avoid a micro-util.
export { isLandTypeLine }
