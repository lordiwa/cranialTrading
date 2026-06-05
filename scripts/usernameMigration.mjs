/**
 * Pure, side-effect-free heuristics for the username dedup/backfill migration (UNIQ-05).
 * normalizeUsername MUST stay byte-equivalent to src/utils/username.ts (D-04).
 * Imported by audit-usernames.mjs and dedup-backfill-usernames.mjs.
 */

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/**
 * Choose the canonical member of a duplicate group.
 * @param {{ uid: string, username: string, cardCount: number, createdAt: number|Date }[]} group
 * @returns winning member — most cards; ties broken by oldest createdAt.
 */
export function pickCanonical(group) {
  return [...group].sort((a, b) => {
    if (b.cardCount !== a.cardCount) return b.cardCount - a.cardCount; // most cards first
    return Number(a.createdAt) - Number(b.createdAt);                  // tie → oldest
  })[0];
}

/**
 * Build the migration plan.
 * @param groups Map<norm, member[]> (or array of { norm, members })
 * @returns {{ renames: {uid,from,to}[], indexWrites: {norm,uid}[] }}
 *   - renames: non-canonical members → `${norm}_old{N}` (N = 1,2,... in iteration order)
 *   - indexWrites: exactly one per normalized username → canonical uid (full backfill)
 */
export function buildPlan(groups) {
  const renames = [];
  const indexWrites = [];
  for (const { norm, members } of normalizeGroups(groups)) {
    const canonical = pickCanonical(members);
    indexWrites.push({ norm, uid: canonical.uid });
    let n = 0;
    for (const m of members) {
      if (m.uid === canonical.uid) continue;
      n += 1;
      renames.push({ uid: m.uid, from: m.username, to: `${norm}_old${n}` });
    }
  }
  return { renames, indexWrites };
}

function normalizeGroups(groups) {
  if (Array.isArray(groups)) return groups;
  return [...groups.entries()].map(([norm, members]) => ({ norm, members }));
}
