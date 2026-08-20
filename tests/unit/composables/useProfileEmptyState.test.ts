/**
 * TASK-248 AC1/AC7 — regression lock for the public-profile empty-state bug.
 *
 * The defect: a keyword filter (or colour/type/search/etc.) that matches
 * NOTHING made the profile show "This user has no public cards in their
 * collection" — which is false when the seller has thousands of public
 * cards and simply none matching the active filter. TASK-247 tanda 4 fixed
 * the exact same class of bug ("states indistinguishables") for
 * index-building vs. truly-empty; this extracts the same decision as a pure,
 * directly-testable function instead of leaving it buried in
 * UserProfileView.vue's template conditionals, which this codebase has no
 * convention for mounting (see userProfilePrivacy.test.ts's own note: this
 * project locks Vue template/state bugs at the source level, not by
 * mounting the component).
 */
import { resolveProfileEmptyState } from '../../../src/composables/useProfileEmptyState'

const base = {
  cardsError: false,
  indexBuilt: true,
  loadingPublicCards: false,
  cardsLength: 0,
  searching: false,
  activeFilterCount: 0,
  filterQuery: '',
}

describe('resolveProfileEmptyState', () => {
  it('reports "error" above everything else — an outage must never read as an empty shop', () => {
    expect(resolveProfileEmptyState({ ...base, cardsError: true, activeFilterCount: 3 })).toBe('error')
  })

  it('reports "building" when the seller\'s index has never been built (TASK-247 tanda 4)', () => {
    expect(resolveProfileEmptyState({ ...base, indexBuilt: false })).toBe('building')
  })

  it('reports "empty" only when there is truly no active filter/search AND no cards', () => {
    expect(resolveProfileEmptyState({ ...base })).toBe('empty')
  })

  // THE BUG, reproduced directly: a real seller (thousands of cards) with an
  // active keyword filter (e.g. "Banding") matching zero of them must NOT
  // collapse into the same 'empty' state as a seller with no public cards
  // at all — those are different facts and need different messages.
  it('reports "filtered-empty" — NOT "empty" — when a filter matches nothing but a filter IS active', () => {
    expect(resolveProfileEmptyState({ ...base, activeFilterCount: 1 })).toBe('filtered-empty')
  })

  it('reports "filtered-empty" for a zero-hit text search too', () => {
    expect(resolveProfileEmptyState({ ...base, filterQuery: 'zzz-no-match' })).toBe('filtered-empty')
  })

  it('reports "filtered-empty" while a debounced search is still in flight', () => {
    expect(resolveProfileEmptyState({ ...base, searching: true })).toBe('filtered-empty')
  })

  it('reports "results" once there is at least one card, regardless of filters', () => {
    expect(resolveProfileEmptyState({ ...base, cardsLength: 5, activeFilterCount: 2 })).toBe('results')
  })

  it('"building" only applies while genuinely empty — cards already loaded win even if indexBuilt lags', () => {
    expect(resolveProfileEmptyState({ ...base, indexBuilt: false, cardsLength: 3 })).toBe('results')
  })
})
