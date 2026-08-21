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
