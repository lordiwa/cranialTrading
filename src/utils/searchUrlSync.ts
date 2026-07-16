import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/**
 * Decides whether a locally-triggered search (FilterPanel's own name input,
 * search button, or suggestion pick on SearchView) should update the ?q= route
 * param so the URL and the collection/other-users sections react to the latest
 * term (TASK-111).
 *
 * Returns the new query object to pass to router.replace(), or null when no
 * update is needed: empty name, or the trimmed name already matches the
 * current ?q= (the search was itself driven by an externalName sync from the
 * header — updating again would be a redundant replace / re-trigger loop).
 */
export function buildSearchQueryUpdate(
  currentQuery: LocationQuery,
  name: string
): LocationQueryRaw | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (currentQuery.q === trimmed) return null
  return { ...currentQuery, q: trimmed }
}
