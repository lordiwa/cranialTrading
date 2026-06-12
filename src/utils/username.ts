/**
 * Canonical username normalization (D-04, D-05).
 * The stored `username` field is ALWAYS this normalized value everywhere.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Username format validation (D-04).
 * Mirrors the existing changeUsername regex (auth.ts:400): /^\w{3,20}$/.
 * \w === [A-Za-z0-9_]; 3-20 chars inclusive. Tested against the trimmed value.
 */
export function isValidUsername(raw: string): boolean {
  return /^\w{3,20}$/.test(raw.trim());
}
