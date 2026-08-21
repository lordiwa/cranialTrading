import { evaluateDistBundle, resolveExpectedMode, type ProjectCandidate } from '../../../e2e/helpers/verify-dist-env'

/**
 * TASK-254. Incident: a 3-day-old orphaned `vite preview` process let the
 * local E2E suite skip its own build step entirely and serve dist/ straight
 * from disk — whatever bundle happened to be sitting there, production in
 * the incident that opened this ticket. 119 of 138 production users turned
 * out to be E2E test accounts.
 *
 * These cases pin the pure decision at the heart of the AC2 guard: given the
 * built bundle's text and the expected mode, is this the bundle we think it
 * is? Vite inlines import.meta.env.VITE_FIREBASE_API_KEY as a literal string
 * at build time, so the bundle text contains exactly one of the two known
 * API keys — never the project id, because "cranial-trading" (prod) is a
 * literal substring of "cranial-trading-dev" (dev) and would false-positive
 * a dev bundle as prod.
 */
describe('evaluateDistBundle (E2E dist-vs-project guard)', () => {
    const candidates: ProjectCandidate[] = [
        { mode: 'development', apiKey: 'DEV_KEY_ABC' },
        { mode: 'production', apiKey: 'PROD_KEY_XYZ' },
    ]

    it('is ok when the expected mode is development and only the dev key is present', () => {
        const verdict = evaluateDistBundle('...DEV_KEY_ABC...', 'development', candidates)
        expect(verdict).toEqual({ ok: true, mode: 'development' })
    })

    it('is ok when the expected mode is production and only the prod key is present', () => {
        const verdict = evaluateDistBundle('...PROD_KEY_XYZ...', 'production', candidates)
        expect(verdict).toEqual({ ok: true, mode: 'production' })
    })

    // THE INCIDENT. Expected dev, bundle is actually prod — must abort, not warn.
    it('is a mismatch when the expected mode is development but the bundle is production', () => {
        const verdict = evaluateDistBundle('...PROD_KEY_XYZ...', 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'mismatch', foundMode: 'production', expectedMode: 'development' })
    })

    it('is a mismatch when the expected mode is production but the bundle is development', () => {
        const verdict = evaluateDistBundle('...DEV_KEY_ABC...', 'production', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'mismatch', foundMode: 'development', expectedMode: 'production' })
    })

    // Fail closed: neither key found (unrelated build, corrupted dist, key rotated).
    it('is undetermined when neither known key is present', () => {
        const verdict = evaluateDistBundle('...NEITHER_KEY...', 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'undetermined', matchCount: 0 })
    })

    // Fail closed: both keys present (e.g. a stale mixed/incremental build) — cannot trust it either.
    it('is undetermined when both known keys are present', () => {
        const verdict = evaluateDistBundle('...DEV_KEY_ABC...PROD_KEY_XYZ...', 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'undetermined', matchCount: 2 })
    })
})

describe('resolveExpectedMode', () => {
    it('defaults to development when VITE_MODE is unset', () => {
        expect(resolveExpectedMode({})).toBe('development')
    })

    it('honors an explicit VITE_MODE override', () => {
        expect(resolveExpectedMode({ VITE_MODE: 'production' })).toBe('production')
    })
})
