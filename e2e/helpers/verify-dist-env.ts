/**
 * TASK-254 — pure decision logic behind the E2E "which Firebase project did
 * this dist/ get built for" guard. Kept side-effect free (no fs, no process)
 * so it is cheap to unit-test; the fs/process wiring lives in
 * verify-dist-env.global-setup.ts.
 *
 * WHY THIS EXISTS. A 3-day-old orphaned `vite preview` process let the local
 * E2E suite skip its own build step and serve dist/ straight from disk —
 * whatever bundle happened to be sitting there, production in the incident
 * that opened this ticket. 119 of 138 production users turned out to be E2E
 * test accounts created since 2026-03-05.
 */

export interface ProjectCandidate {
  mode: string
  apiKey: string
}

export type DistVerdict =
  | { ok: true; mode: string }
  | { ok: false; reason: 'mismatch'; foundMode: string; expectedMode: string }
  | { ok: false; reason: 'undetermined'; matchCount: number }

/**
 * Vite inlines `import.meta.env.VITE_FIREBASE_API_KEY` as a literal string at
 * build time, so the built bundle text contains exactly one of the known API
 * keys. Matching on the API key rather than the project id is deliberate:
 * the prod project id "cranial-trading" is a literal substring of the dev
 * project id "cranial-trading-dev", so a project-id substring match would
 * false-positive a dev bundle as prod.
 *
 * Fails closed (reason: 'undetermined') both when no known key is found and
 * when more than one is — a stale/mixed build is not trustworthy either.
 */
export function evaluateDistBundle(bundleText: string, expectedMode: string, candidates: ProjectCandidate[]): DistVerdict {
  const found = candidates.filter((c) => bundleText.includes(c.apiKey))
  if (found.length !== 1) {
    return { ok: false, reason: 'undetermined', matchCount: found.length }
  }
  if (found[0].mode !== expectedMode) {
    return { ok: false, reason: 'mismatch', foundMode: found[0].mode, expectedMode }
  }
  return { ok: true, mode: expectedMode }
}

/** Same VITE_MODE default the webServer command already uses ('development'). */
export function resolveExpectedMode(env: Record<string, string | undefined>): string {
  return env.VITE_MODE || 'development'
}

export interface CandidateKeyValidation {
  ok: boolean
  invalidModes: string[]
}

// Real Firebase Web API keys measure 39 characters (both of this project's
// known keys do). This is a floor, not an exact-length check, so it doesn't
// go brittle on a future key rotation — it only needs to catch what the
// degenerate inputs below actually look like: empty, undefined, or an
// obviously truncated/garbage value.
const MIN_PLAUSIBLE_API_KEY_LENGTH = 30

/**
 * TASK-254 reviewer HIGH-1. evaluateDistBundle() is fail-OPEN if handed a
 * candidate with a falsy apiKey: `bundleText.includes('')` is always true,
 * and `bundleText.includes(undefined)` matches the literal text "undefined"
 * — measured present in 3 of 62 chunks of a real production build. Either
 * one lets a misconfigured .env (a missing or blanked
 * VITE_FIREBASE_API_KEY) produce a false `ok: true` for a bundle that is
 * NOT the expected project — the exact "cannot determine, so it must abort"
 * case AC2 requires.
 *
 * This must run BEFORE evaluateDistBundle is ever called — a bad key is
 * knowable from the .env files alone, with no dist/ read required, so
 * failing here means never touching a bundle we can't trust the check
 * against.
 */
export function validateCandidateKeys(candidates: ProjectCandidate[]): CandidateKeyValidation {
  const invalidModes = candidates
    .filter((c) => !c.apiKey || c.apiKey.length < MIN_PLAUSIBLE_API_KEY_LENGTH)
    .map((c) => c.mode)
  return { ok: invalidModes.length === 0, invalidModes }
}
