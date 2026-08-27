/**
 * TASK-288 AC4: the client's type filter (useCardFilter.passesTypeFilter,
 * used by CollectionView.vue's local grid filtering and by useCardFilter's
 * own passesChipFilters) and the server's type filter
 * (src/functions/queryCardIndexHelpers.ts filterIndexCards "Type filter"
 * section, used by CollectionView.vue's server-side pagination via
 * buildPaginationFilters) must agree on the same card for the same filter.
 *
 * They are two independently-written substring checks over the same
 * type_line data, so nothing stops them from silently diverging again — this
 * test runs the SAME fixtures through both and reds out the moment they
 * disagree.
 */

import { filterIndexCards, type IndexCard } from '@/functions/queryCardIndexHelpers'
import { getCardTypeCategories, passesTypeFilter, typeOrder } from '@/composables/useCardFilter'
import { typeToServerMap } from '@/utils/collectionFilters'

function makeIndexCard(typeLine: string): IndexCard {
  return {
    i: 'card-1', s: 'scryfall-1', n: 'Test Card', st: 'collection', q: 1, p: 0,
    cm: 0, co: [], r: 'c', t: typeLine, f: false, sc: 'M21',
    pw: '', to: '', fa: false, pm: [], kw: [], lg: [], ca: 0, cn: 'NM', pb: true, df: false,
  }
}

// The same fixtures TASK-288 measured in production, plus a couple of
// "clean" single-type cards as controls.
const TYPE_LINES = [
  'Artifact Land',
  'Instant // Land',
  'Creature — Eldrazi // Land',
  "Enchantment Land — Urza's Saga",
  'Land Creature — Forest Dryad',
  'Land — Town // Sorcery — Adventure',
  'Land',
  'Basic Land — Plains',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Legendary Planeswalker — Jace',
  'Creature — Human Wizard',
  'Tribal',
]

describe('client/server type filter parity', () => {
  it.each(TYPE_LINES)('agree on every single-category filter for "%s"', (typeLine) => {
    const card = makeIndexCard(typeLine)
    for (const displayCategory of typeOrder) {
      if (displayCategory === 'Other') continue // server has no 'Other' term to filter by
      // eslint-disable-next-line security/detect-object-injection
      const serverTerm = typeToServerMap[displayCategory]
      const clientResult = passesTypeFilter({ name: '', edition: '', type_line: typeLine }, new Set([displayCategory]))
      const serverResult = filterIndexCards([card], { type: [serverTerm] }).length === 1

      expect(serverResult, `type_line="${typeLine}" category="${displayCategory}"`).toBe(clientResult)
    }
  })

  it('client getCardTypeCategories membership matches which server terms the type_line contains', () => {
    for (const typeLine of TYPE_LINES) {
      const clientCategories = getCardTypeCategories({ name: '', edition: '', type_line: typeLine })
      for (const displayCategory of typeOrder) {
        if (displayCategory === 'Other') continue
        // eslint-disable-next-line security/detect-object-injection
        const serverTerm = typeToServerMap[displayCategory]
        const expectedMembership = typeLine.toLowerCase().includes(serverTerm)
        expect(clientCategories.includes(displayCategory), `type_line="${typeLine}" category="${displayCategory}"`).toBe(expectedMembership)
      }
    }
  })
})
