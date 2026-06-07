/**
 * MTGJSON SetList helpers
 *
 * MTGJSON publishes an authoritative list of every set it knows about at
 * `https://mtgjson.com/api/v5/SetList.json.gz`. Scryfall, however, has set
 * codes (promos, tokens, specialty printings such as PLST / PTOKEN / TKHM …)
 * that MTGJSON does NOT publish a per-set file for. Requesting
 * `{SETCODE}.json.gz` for those codes returns a 404, and because Cloudflare
 * omits CORS headers on 404 responses the browser logs both a 404 AND a CORS
 * error — neither of which can be silenced from JS.
 *
 * These pure helpers let the price service pre-filter set-mapping fetches so we
 * only ever request files that actually exist, eliminating the console spam.
 *
 * Both functions are intentionally side-effect free and network-free so they
 * are trivially unit-testable.
 */

interface SetListEntry {
  code?: unknown
}

interface SetListJson {
  data?: unknown
}

/**
 * Extract the set of valid (UPPERCASE) MTGJSON set codes from a parsed
 * SetList.json payload.
 *
 * Shape: `{ meta: {...}, data: [ { code: "10E", ... }, ... ] }`.
 * MTGJSON codes are uppercase; we normalize defensively anyway.
 *
 * Degrades gracefully: any malformed / missing input yields an empty Set.
 */
export function parseSetListCodes(setListJson: unknown): Set<string> {
  const codes = new Set<string>()

  if (!setListJson || typeof setListJson !== 'object') {
    return codes
  }

  const data = (setListJson as SetListJson).data
  if (!Array.isArray(data)) {
    return codes
  }

  for (const entry of data as SetListEntry[]) {
    const code = entry?.code
    if (typeof code === 'string' && code.length > 0) {
      codes.add(code.toUpperCase())
    }
  }

  return codes
}

/**
 * Decide whether a set code is one MTGJSON actually publishes a file for.
 *
 * Case-insensitive: Scryfall codes may be lowercase, MTGJSON codes are upper.
 *
 * GRACEFUL DEGRADATION: when `validCodes` is unavailable (null / undefined) or
 * empty — i.e. the SetList never loaded — we return `true` so the caller does
 * NOT pre-filter and instead falls back to the legacy attempt-and-catch-404
 * behavior. The pre-filter is an optimization, never a hard dependency.
 */
export function isKnownMtgjsonSet(
  setCode: string,
  validCodes: Set<string> | null | undefined
): boolean {
  // No valid-code set available → don't block anything (legacy behavior).
  if (!validCodes || validCodes.size === 0) {
    return true
  }
  if (!setCode) {
    return false
  }
  return validCodes.has(setCode.toUpperCase())
}
