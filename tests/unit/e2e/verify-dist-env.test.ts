import { evaluateDistBundle, resolveExpectedMode, validateCandidateKeys, type ProjectCandidate } from '../../../e2e/helpers/verify-dist-env'

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

    // Reviewer HIGH-1, measured against a real bundle: evaluateDistBundle
    // itself is FAIL-OPEN if a candidate's apiKey is falsy. String.includes('')
    // is always true, and String.includes(undefined) matches the literal text
    // "undefined" — which appeared in 3 of 62 chunks of a real production
    // build. These two cases PIN that this function, on its own, is not safe
    // to call with an unvalidated candidate — that is exactly why
    // validateCandidateKeys below exists and MUST run first, in
    // verify-dist-env.global-setup.ts, before evaluateDistBundle is ever
    // called. Do not "fix" these by changing evaluateDistBundle's matching
    // logic; the fix is the caller never handing it a bad key.
    it('DANGER (documented, not a target to fix here): an empty apiKey matches everything, producing a false ok:true', () => {
        const badCandidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'DEV_KEY_ABC' },
            { mode: 'production', apiKey: '' },
        ]
        // Bundle text has nothing to do with production — yet '' matches it.
        const verdict = evaluateDistBundle('this text is not a firebase bundle at all', 'production', badCandidates)
        expect(verdict).toEqual({ ok: true, mode: 'production' })
    })

    it('DANGER (documented, not a target to fix here): an absent (undefined) apiKey matches the literal string "undefined"', () => {
        const badCandidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: undefined as unknown as string },
            { mode: 'production', apiKey: 'PROD_KEY_XYZ' },
        ]
        const verdict = evaluateDistBundle('some chunk text containing the word undefined in it', 'development', badCandidates)
        expect(verdict).toEqual({ ok: true, mode: 'development' })
    })
})

/**
 * Reviewer HIGH-1 fix. Must run BEFORE the bundle is even read, let alone
 * evaluated — a misconfigured .env (empty or missing VITE_FIREBASE_API_KEY)
 * is exactly the "cannot determine" case AC2 requires failing closed on, and
 * it is knowable from the .env files alone, with no dist/ involved.
 */
describe('validateCandidateKeys (TASK-254 reviewer HIGH-1)', () => {
    it('is ok when both candidate keys look like real Firebase API keys', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'AIzaSyBJvs6B_1Ox_NOAl2CxBhCVInc7JVxLAio' },
            { mode: 'production', apiKey: 'AIzaSyA55auntS2VA0YlwRt1oIFZD-xaBeBvuPI' },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: true, invalidModes: [] })
    })

    it('rejects an empty apiKey', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'AIzaSyBJvs6B_1Ox_NOAl2CxBhCVInc7JVxLAio' },
            { mode: 'production', apiKey: '' },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['production'] })
    })

    it('rejects an absent (undefined) apiKey', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: undefined as unknown as string },
            { mode: 'production', apiKey: 'AIzaSyA55auntS2VA0YlwRt1oIFZD-xaBeBvuPI' },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['development'] })
    })

    it('rejects an implausibly short apiKey (truncated/garbage value, not just empty)', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'short' },
            { mode: 'production', apiKey: 'AIzaSyA55auntS2VA0YlwRt1oIFZD-xaBeBvuPI' },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['development'] })
    })

    it('reports every invalid mode, not just the first', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: '' },
            { mode: 'production', apiKey: undefined as unknown as string },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['development', 'production'] })
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
