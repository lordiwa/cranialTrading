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
  | { ok: false; reason: 'invalid-key'; invalidModes: string[] }

export interface CandidateKeyValidation {
  ok: boolean
  invalidModes: string[]
}

// Real Firebase Web API keys measure 39 characters (both of this project's
// known keys do). This is a floor, not an exact-length check, so it doesn't
// go brittle on a future key rotation — it only needs to catch what the
// degenerate inputs actually look like: empty, undefined (which dotenv can
// turn into the truthy 9-character STRING "undefined" if a .env line reads
// literally `VITE_FIREBASE_API_KEY=undefined` — same family as "null",
// "true", or stray whitespace: all truthy, all short), or an obviously
// truncated/garbage value.
const MIN_PLAUSIBLE_API_KEY_LENGTH = 30

/**
 * TASK-254 reviewer HIGH-1. A candidate with a falsy or implausibly short
 * apiKey can never be trusted to decide a project match — see
 * evaluateDistBundle's doc comment for exactly how it goes wrong
 * (`String.includes('')` / `.includes('undefined')`) if this isn't checked
 * first. A missing or garbled VITE_FIREBASE_API_KEY in either .env file is
 * exactly the "cannot determine" case AC2 requires failing closed on.
 *
 * Exported separately (not folded away as a private helper) because
 * verify-dist-env.global-setup.ts calls this FIRST, before dist/ is even
 * read from disk — a bad key is knowable from the .env files alone — so it
 * can name which mode's key is bad without having read a single bundle
 * chunk. evaluateDistBundle below also calls it, as defense in depth for any
 * future caller that skips the early check; the two are complementary
 * layers, not a duplicate of the same check.
 */
export function validateCandidateKeys(candidates: ProjectCandidate[]): CandidateKeyValidation {
  const invalidModes = candidates
    .filter((c) => !c.apiKey || c.apiKey.length < MIN_PLAUSIBLE_API_KEY_LENGTH)
    .map((c) => c.mode)
  return { ok: invalidModes.length === 0, invalidModes }
}

/**
 * Vite inlines `import.meta.env.VITE_FIREBASE_API_KEY` as a literal string at
 * build time, so the built bundle text contains exactly one of the known API
 * keys. Matching on the API key rather than the project id is deliberate:
 * the prod project id "cranial-trading" is a literal substring of the dev
 * project id "cranial-trading-dev", so a project-id substring match would
 * false-positive a dev bundle as prod.
 *
 * TASK-254 reviewer HIGH-1: this function used to be fail-OPEN for a
 * candidate with a falsy apiKey — `bundleText.includes('')` is always true,
 * and `bundleText.includes(undefined)` matches the literal text "undefined",
 * measured present in 3 of 62 chunks of a real production build. It now
 * refuses to even attempt the match (reason: 'invalid-key') when any
 * candidate's key fails validateCandidateKeys — a dangerous primitive
 * exported from a shared helper module must defend itself, not rely on every
 * present and future caller remembering to validate first.
 *
 * Fails closed (reason: 'undetermined') both when no known key is found and
 * when more than one is — a stale/mixed build is not trustworthy either.
 */
export function evaluateDistBundle(bundleText: string, expectedMode: string, candidates: ProjectCandidate[]): DistVerdict {
  const keyValidation = validateCandidateKeys(candidates)
  if (!keyValidation.ok) {
    return { ok: false, reason: 'invalid-key', invalidModes: keyValidation.invalidModes }
  }
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
