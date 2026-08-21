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
 *
 * Fake keys throughout this file, never the real ones: these values are
 * asserted on byte-for-byte, so a real key here would make the test keep
 * asserting a value that is silently wrong (not failing) the moment either
 * key is rotated — LOW noted by the reviewer on TASK-254 eb5fe94.
 */
describe('evaluateDistBundle (E2E dist-vs-project guard)', () => {
    const FAKE_DEV_KEY = 'AIzaSyFAKE_DEV_KEY_FOR_UNIT_TESTS_00001' // 39 chars, same length as a real Firebase Web API key
    const FAKE_PROD_KEY = 'AIzaSyFAKE_PROD_KEY_FOR_UNIT_TESTS_0001' // 39 chars

    const candidates: ProjectCandidate[] = [
        { mode: 'development', apiKey: FAKE_DEV_KEY },
        { mode: 'production', apiKey: FAKE_PROD_KEY },
    ]

    it('is ok when the expected mode is development and only the dev key is present', () => {
        const verdict = evaluateDistBundle(`...${FAKE_DEV_KEY}...`, 'development', candidates)
        expect(verdict).toEqual({ ok: true, mode: 'development' })
    })

    it('is ok when the expected mode is production and only the prod key is present', () => {
        const verdict = evaluateDistBundle(`...${FAKE_PROD_KEY}...`, 'production', candidates)
        expect(verdict).toEqual({ ok: true, mode: 'production' })
    })

    // THE INCIDENT. Expected dev, bundle is actually prod — must abort, not warn.
    it('is a mismatch when the expected mode is development but the bundle is production', () => {
        const verdict = evaluateDistBundle(`...${FAKE_PROD_KEY}...`, 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'mismatch', foundMode: 'production', expectedMode: 'development' })
    })

    it('is a mismatch when the expected mode is production but the bundle is development', () => {
        const verdict = evaluateDistBundle(`...${FAKE_DEV_KEY}...`, 'production', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'mismatch', foundMode: 'development', expectedMode: 'production' })
    })

    // Fail closed: neither key found (unrelated build, corrupted dist, key rotated).
    it('is undetermined when neither known key is present', () => {
        const verdict = evaluateDistBundle('...NEITHER_KEY...', 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'undetermined', matchCount: 0 })
    })

    // Fail closed: both keys present (e.g. a stale mixed/incremental build) — cannot trust it either.
    it('is undetermined when both known keys are present', () => {
        const verdict = evaluateDistBundle(`...${FAKE_DEV_KEY}...${FAKE_PROD_KEY}...`, 'development', candidates)
        expect(verdict).toEqual({ ok: false, reason: 'undetermined', matchCount: 2 })
    })

    // Reviewer HIGH-1, round 2. evaluateDistBundle used to be FAIL-OPEN if a
    // candidate's apiKey was falsy: String.includes('') is always true, and
    // String.includes(undefined) matches the literal text "undefined" —
    // measured present in 3 of 62 chunks of a real production build. It is
    // now self-defending: any candidate with an invalid key makes the whole
    // call refuse to match at all, regardless of what the bundle text says.
    it('SAFE (was DANGER before the reviewer second pass): an empty apiKey no longer matches everything', () => {
        const badCandidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: FAKE_DEV_KEY },
            { mode: 'production', apiKey: '' },
        ]
        const verdict = evaluateDistBundle('this text is not a firebase bundle at all', 'production', badCandidates)
        expect(verdict).toEqual({ ok: false, reason: 'invalid-key', invalidModes: ['production'] })
    })

    it('SAFE (was DANGER before the reviewer second pass): an absent (undefined) apiKey no longer matches the literal string "undefined"', () => {
        const badCandidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: undefined as unknown as string },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
        ]
        const verdict = evaluateDistBundle('some chunk text containing the word undefined in it', 'development', badCandidates)
        expect(verdict).toEqual({ ok: false, reason: 'invalid-key', invalidModes: ['development'] })
    })

    it('reports invalid-key even when the bundle text would otherwise have matched the good candidate', () => {
        // The good candidate (prod) DOES appear in the bundle — this proves
        // invalid-key wins over a would-be match, not just over a miss.
        const badCandidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: '' },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
        ]
        const verdict = evaluateDistBundle(`...${FAKE_PROD_KEY}...`, 'production', badCandidates)
        expect(verdict).toEqual({ ok: false, reason: 'invalid-key', invalidModes: ['development'] })
    })
})

/**
 * Reviewer HIGH-1. Must run BEFORE the bundle is even read, let alone
 * evaluated — a misconfigured .env (empty or missing VITE_FIREBASE_API_KEY)
 * is exactly the "cannot determine" case AC2 requires failing closed on, and
 * it is knowable from the .env files alone, with no dist/ involved.
 * evaluateDistBundle above calls this too now (defense in depth); this
 * describe block tests the function directly for the rich per-mode message
 * it enables in verify-dist-env.global-setup.ts's early check.
 */
describe('validateCandidateKeys (TASK-254 reviewer HIGH-1)', () => {
    const FAKE_DEV_KEY = 'AIzaSyFAKE_DEV_KEY_FOR_UNIT_TESTS_00001' // 39 chars
    const FAKE_PROD_KEY = 'AIzaSyFAKE_PROD_KEY_FOR_UNIT_TESTS_0001' // 39 chars

    it('is ok when both candidate keys look like real Firebase API keys', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: FAKE_DEV_KEY },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: true, invalidModes: [] })
    })

    it('rejects an empty apiKey', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: FAKE_DEV_KEY },
            { mode: 'production', apiKey: '' },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['production'] })
    })

    it('rejects an absent (undefined) apiKey', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: undefined as unknown as string },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['development'] })
    })

    // A .env line that reads literally `VITE_FIREBASE_API_KEY=undefined`
    // makes dotenv return the truthy STRING "undefined" — the falsy check
    // alone does not catch this. Same family as "null", "true", stray
    // whitespace: all truthy, all short. The length floor catches all of them.
    it('rejects the truthy string "undefined" (a literal env value, not the JS primitive)', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'undefined' },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
        ]
        expect(validateCandidateKeys(candidates)).toEqual({ ok: false, invalidModes: ['development'] })
    })

    it('rejects an implausibly short apiKey (truncated/garbage value, not just empty)', () => {
        const candidates: ProjectCandidate[] = [
            { mode: 'development', apiKey: 'short' },
            { mode: 'production', apiKey: FAKE_PROD_KEY },
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
