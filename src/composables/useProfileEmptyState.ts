/**
 * resolveProfileEmptyState — which empty/error/results state the public
 * profile is in right now. TASK-248 AC1/AC7.
 *
 * Extracted as a pure function (rather than left as inline template
 * conditionals) specifically so the defect below is directly unit-testable:
 * this codebase has no convention for mounting a Vue view in vitest (see
 * userProfilePrivacy.test.ts), so a template-conditional bug is otherwise
 * only catchable by hand or in E2E.
 *
 * THE BUG THIS CLOSES: `UserProfileView.vue` used to have ONE zero-cards
 * message, shown whether the seller genuinely had no public cards OR an
 * active filter/search simply matched none of their (thousands of) public
 * cards. A visitor filtering rafael's real profile (6,647 public cards) by
 * an ability none of them have (e.g. Banding) saw "This user has no public
 * cards in their collection" — false. TASK-247 tanda 4 fixed the same shape
 * of bug ("states indistinguishables") for index-building vs. truly-empty;
 * this is the same fix applied to filtered-empty vs. truly-empty.
 *
 * States, in PRIORITY order (each `if` below is a real precedence decision,
 * not an arbitrary listing):
 *   'error'          the query itself failed. Checked FIRST — falling
 *                     through to any empty message turns an outage into an
 *                     invisible one (nobody reports "empty shop").
 *   'building'       the seller's index has never been built (TASK-247
 *                     tanda 4). Distinct from an empty profile: every
 *                     profile is in this state until the backfill runs.
 *   'empty'          truly zero public cards, no filter or search active.
 *   'filtered-empty' zero cards WHILE a filter or search IS active — the
 *                     state this module exists to add. Previously
 *                     indistinguishable from 'empty'.
 *   'results'        at least one card loaded.
 */

export interface ProfileEmptyStateInput {
  cardsError: boolean
  indexBuilt: boolean
  loadingPublicCards: boolean
  cardsLength: number
  searching: boolean
  activeFilterCount: number
  filterQuery: string
}

export type ProfileEmptyState = 'error' | 'building' | 'empty' | 'filtered-empty' | 'results'

export function resolveProfileEmptyState(input: ProfileEmptyStateInput): ProfileEmptyState {
  if (input.cardsError) return 'error'
  if (!input.indexBuilt && !input.loadingPublicCards && input.cardsLength === 0) return 'building'
  if (input.cardsLength > 0) return 'results'
  const filterActive = input.searching || input.activeFilterCount > 0 || input.filterQuery.trim().length > 0
  return filterActive ? 'filtered-empty' : 'empty'
}
