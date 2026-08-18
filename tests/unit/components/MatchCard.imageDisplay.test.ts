/**
 * Regression lock for the audit finding on TASK-241 (2026-08-18): MatchCard
 * used to gate its <img> with `giveCard?.image?.startsWith('http')` /
 * `receiveCard?.image?.startsWith('http')`. Once indexToCard/importHelpers
 * started writing `card.image` as OUR OWN relative proxy URL
 * (/img/thumb/front/<id>.webp, see src/utils/cardImageUrl.ts) instead of an
 * absolute https://cards.scryfall.io/... URL, that check went permanently
 * false for every match built from a post-TASK-241 card — the image did not
 * degrade, it disappeared entirely. Confirmed by reading the shipped code
 * (not reproduced in a browser) before this fix landed.
 *
 * Both CollectionGridCardCompact/Full and MatchCard now share ONE check
 * (isDisplayableImageUrl, src/utils/cardImageUrl.ts) instead of each
 * component growing its own ad hoc "looks like a URL" validation — that
 * duplication is exactly how this regression got in undetected.
 */

vi.mock('@/services/mtgjson', () => ({
  getCardPrices: vi.fn().mockResolvedValue(null),
  formatPrice: (n: number) => `$${n}`,
}))
vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/stores/contacts', () => ({
  useContactsStore: vi.fn(() => ({ contacts: [], isContact: () => false, addContact: vi.fn() })),
}))
vi.mock('@/stores/messages', () => ({
  useMessagesStore: vi.fn(() => ({ startConversation: vi.fn(), currentMessages: [] })),
}))
vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({ show: vi.fn() })),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MatchCard from '../../../src/components/matches/MatchCard.vue'
import type { MatchCard as MatchCardType, SimpleMatch } from '../../../src/stores/matches'

function makeMatchCard(overrides: Partial<MatchCardType> = {}): MatchCardType {
  return {
    scryfallId: 'a268697b-22b0-4e1b-a5b6-d9be95025e57',
    name: 'Test Card',
    edition: 'Test Set',
    quantity: 1,
    condition: 'NM',
    foil: false,
    price: 1,
    image: '',
    status: 'collection',
    ...overrides,
  }
}

function makeMatch(overrides: Partial<SimpleMatch> = {}): SimpleMatch {
  return {
    id: 'match-1',
    type: 'BIDIRECTIONAL',
    otherUserId: 'other-user',
    otherUsername: 'otheruser',
    createdAt: new Date(),
    ...overrides,
  }
}

function mountMatchCard(match: SimpleMatch) {
  return mount(MatchCard, { props: { match }, global: { stubs: { RouterLink: true } } })
}

describe('MatchCard image display (audit regression lock, TASK-241)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the <img> when the card image is OUR OWN relative proxy URL (/img/...)', () => {
    const match = makeMatch({
      myCards: [makeMatchCard({ image: '/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp' })],
      otherCards: [makeMatchCard({ image: '/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp' })],
    })
    const wrapper = mountMatchCard(match)

    const imgs = wrapper.findAll('img').filter(
      (img) => img.attributes('src') === '/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
    expect(imgs.length).toBe(2) // giveCard + receiveCard
  })

  it('still renders the <img> for a legacy absolute Scryfall URL (pre-TASK-241 saved data)', () => {
    const legacyUrl = 'https://cards.scryfall.io/normal/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.jpg'
    const match = makeMatch({
      myCards: [makeMatchCard({ image: legacyUrl })],
      otherCards: [makeMatchCard({ image: legacyUrl })],
    })
    const wrapper = mountMatchCard(match)

    const imgs = wrapper.findAll('img').filter((img) => img.attributes('src') === legacyUrl)
    expect(imgs.length).toBe(2)
  })

  it('does not render an <img> when there is no card at all', () => {
    const match = makeMatch({ myCards: [], otherCards: [] })
    const wrapper = mountMatchCard(match)
    // Only price/CK icons etc. may render <img>-less; the two card slots must not.
    expect(wrapper.findAll('img').length).toBe(0)
  })
})
