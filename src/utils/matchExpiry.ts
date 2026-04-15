/**
 * Match lifetime constants and helpers.
 * Single source of truth for MATCH_LIFETIME_DAYS — imported by:
 *   - src/stores/matches.ts
 *   - src/views/DashboardView.vue
 *   - src/composables/useGlobalSearch.ts
 *   - src/views/UserProfileView.vue
 *   - src/views/SavedMatchesView.vue
 *
 * Uses calendar-day arithmetic (Date.setDate) instead of +N*86_400_000 ms
 * so DST transitions never shift the wall-clock day.
 */
export const MATCH_LIFETIME_DAYS = 15

/**
 * Returns a Date exactly MATCH_LIFETIME_DAYS calendar days after `from`.
 * Defaults to `new Date()` when called with no argument.
 * Defensive: never mutates the input Date.
 */
export const getMatchExpirationDate = (from: Date = new Date()): Date => {
  const result = new Date(from.getTime())
  result.setDate(result.getDate() + MATCH_LIFETIME_DAYS)
  return result
}
