import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { evaluateDistBundle, resolveExpectedMode, validateCandidateKeys, type ProjectCandidate } from './helpers/verify-dist-env'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

/**
 * TASK-254 AC2 — Playwright globalSetup, runs ONCE, after webServer is up
 * (or skipped) and before any spec file. This is the earliest point where
 * dist/ actually reflects what will be served, and the last point before a
 * spec can touch a real backend.
 *
 * Aborts the whole run (throws) rather than warning: a warning is exactly
 * what let 119 E2E test accounts land in production over 5 months (measured
 * 2026-08-20) — nobody reads webServer stdout on every local run.
 *
 * WHAT "expected mode" MEANS. resolveExpectedMode() reads `VITE_MODE`, same
 * as the local webServer command already does (`vite build --mode
 * ${VITE_MODE || 'development'}`) — there is deliberately one source of
 * truth for "which project should this dist/ be" instead of two that could
 * drift apart. `VITE_MODE=production` is a legitimate, explicit opt-in
 * (locally, to deliberately test the prod bundle; in CI, on `main`, where
 * testing the production-configured bundle is the intended job — see
 * .github/workflows/test.yml, which sets VITE_MODE to match the same
 * github.ref branch it already uses to decide whether `build` compiles with
 * or without --mode). The default with VITE_MODE unset is "development",
 * because that is what a bare local `npm run e2e` means. There is NO
 * `process.env.CI` exception anywhere in this file — CI on `main` gets its
 * "production" expectation from an explicit VITE_MODE, the same as anyone
 * else, not from being CI. A blanket CI exception would defeat the guard
 * exactly where it matters most: CI on `develop` is the push-to-develop gate
 * this ticket protects.
 *
 * AC6: E2E_BASE_URL (the nightly cron's path) targets an already-deployed
 * environment. playwright.config.ts skips the local webServer entirely in
 * that case, so there is no dist/ to inspect — that is a valid, expected
 * state, not a failure, and this guard must not block it. Skip silently,
 * and only in that one case.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) {
    return
  }

  const expectedMode = resolveExpectedMode(process.env)

  const devEnvPath = path.join(ROOT, '.env.development')
  const prodEnvPath = path.join(ROOT, '.env.production')
  if (!existsSync(devEnvPath) || !existsSync(prodEnvPath)) {
    throw new Error(
      `[TASK-254 guard] Cannot read .env.development and/or .env.production — both are required to know which Firebase project keys to look for in dist/. Failing closed instead of assuming it is safe. Expected mode: "${expectedMode}".`,
    )
  }
  const devEnv = dotenv.parse(readFileSync(devEnvPath))
  const prodEnv = dotenv.parse(readFileSync(prodEnvPath))
  const candidates: ProjectCandidate[] = [
    { mode: 'development', apiKey: devEnv.VITE_FIREBASE_API_KEY },
    { mode: 'production', apiKey: prodEnv.VITE_FIREBASE_API_KEY },
  ]

  // Reviewer HIGH-1. Validate the keys themselves BEFORE touching dist/ at
  // all — evaluateDistBundle() is fail-OPEN if handed a falsy apiKey
  // (empty string matches everything via String.includes(''); undefined
  // matches the literal text "undefined", measured present in a real
  // production bundle), so an unvalidated candidate must never reach it.
  // A missing/blanked VITE_FIREBASE_API_KEY in either .env file is exactly
  // the "cannot determine" case AC2 requires failing closed on.
  const keyValidation = validateCandidateKeys(candidates)
  if (!keyValidation.ok) {
    throw new Error(
      `[TASK-254 guard] VITE_FIREBASE_API_KEY is missing or implausibly short for mode(s): ${keyValidation.invalidModes.join(', ')}. Cannot trust a dist/ project match without a real key to look for. Failing closed instead of assuming it is safe. Check .env.development and .env.production. Expected mode: "${expectedMode}".`,
    )
  }

  const assetsDir = path.join(ROOT, 'dist', 'assets')
  if (!existsSync(assetsDir)) {
    throw new Error(
      `[TASK-254 guard] dist/assets not found — cannot determine which Firebase project the E2E bundle targets. Failing closed instead of assuming it is safe. Expected mode: "${expectedMode}".`,
    )
  }

  const bundleText = readdirSync(assetsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(path.join(assetsDir, f), 'utf-8'))
    .join('\n')

  const verdict = evaluateDistBundle(bundleText, expectedMode, candidates)

  // Exhaustive over DistVerdict's failure reasons, not an if-chain that
  // silently no-ops on a reason nobody added a branch for yet — see
  // reviewer HIGH-1: a guard that fails open on an unhandled case is worse
  // than no guard, because it also gives false confidence.
  if (!verdict.ok) {
    if (verdict.reason === 'mismatch') {
      throw new Error(
        `[TASK-254 guard] dist/ was built for Firebase project mode "${verdict.foundMode}" but this E2E run expects "${verdict.expectedMode}". Aborting — this is the exact incident that put 119 E2E test accounts into production (TASK-254). Delete dist/ and let webServer rebuild it, or rerun with VITE_MODE=${verdict.expectedMode}.`,
      )
    }
    if (verdict.reason === 'undetermined') {
      throw new Error(
        `[TASK-254 guard] Could not determine which Firebase project dist/ was built for (matched ${verdict.matchCount} of 2 known API keys). Failing closed — aborting rather than assuming it is safe. Expected mode: "${expectedMode}".`,
      )
    }
    if (verdict.reason === 'invalid-key') {
      // Belt-and-suspenders: the validateCandidateKeys() call above already
      // aborts before this point is ever reached in this file. This branch
      // only fires if a future refactor removes that early check.
      throw new Error(
        `[TASK-254 guard] dist/ check aborted: apiKey invalid for mode(s): ${verdict.invalidModes.join(', ')}. Failing closed. Expected mode: "${expectedMode}".`,
      )
    }
    const unhandledReason: never = verdict
    throw new Error(`[TASK-254 guard] Unknown verdict shape, aborting rather than assuming it is safe: ${JSON.stringify(unhandledReason)}`)
  }
}
