/**
 * SCRUM-71.3 — Dedup semántico de matches.
 *
 * Un match "repetido" es la misma persona ofreciendo/buscando el mismo conjunto
 * de cartas. Dos matches de la misma persona con cartas distintas NO son
 * duplicados — son matches diferentes que la vista agrupa por persona (71.4).
 *
 * Pura: sin Vue, sin stores, sin Firestore.
 */
export interface DedupableMatch {
  otherUserId?: string
  myCards?: { scryfallId?: string }[]
  otherCards?: { scryfallId?: string }[]
}

/** Clave de identidad: persona + scryfallIds (de ambos lados) ordenados. */
export const matchIdentityKey = (m: DedupableMatch): string => {
  const ids = [...(m.myCards ?? []), ...(m.otherCards ?? [])]
    .map(c => c?.scryfallId ?? '')
    .filter(Boolean)
    .sort()
    .join(',')
  return `${m.otherUserId ?? ''}::${ids}`
}

/** Conserva el primer match por clave de identidad. No muta la entrada. */
export const dedupeMatchesByIdentity = <T extends DedupableMatch>(matches: T[]): T[] => {
  const seen = new Set<string>()
  const out: T[] = []
  for (const m of matches) {
    const key = matchIdentityKey(m)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}
