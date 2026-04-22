import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DiscoveryPanel from '../../../src/components/discovery/DiscoveryPanel.vue'
import type { ScryfallCard } from '../../../src/services/scryfall'

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

// Mock the scryfall service used by useDiscoveryPanel
vi.mock('../../../src/services/scryfall', () => ({
  searchCards: vi.fn(async (_q: string) => [
    { id: 'p1', name: 'Lightning Bolt', set: 'mh3', set_name: 'MH3', image_uris: { small: 's.png' } },
    { id: 'p2', name: 'Lightning Bolt', set: 'lea', set_name: 'Alpha', image_uris: { small: 's.png' } },
  ] as unknown as ScryfallCard[]),
  searchAdvanced: vi.fn(async () => [
    { id: 'd1', name: 'A', set: 'mh3', set_name: 'MH3', image_uris: { small: 's.png' } },
  ] as unknown as ScryfallCard[]),
}))

// Stub DiscoveryCard to keep tests focused
vi.mock('../../../src/components/discovery/DiscoveryCard.vue', () => ({
  default: {
    name: 'DiscoveryCard',
    template: '<div data-testid="dcard">{{ print.id }}</div>',
    props: [
      'print', 'scope', 'ownedCount', 'inDeckMainboardCount', 'inDeckSideboardCount',
      'inBinderCount', 'isWishlistedSomewhere', 'defaultCollectionStatus',
      'hasActiveDeck', 'hasActiveBinder',
    ],
  },
}))

// Stub the embedded FilterPanel — we only care about DiscoveryPanel's contract here
vi.mock('../../../src/components/search/FilterPanel.vue', () => ({
  default: {
    name: 'FilterPanel',
    template: '<div data-testid="filter-panel-stub"></div>',
    props: ['autoSearch', 'syncWithRouter', 'hideNameInput', 'externalName'],
    emits: ['search', 'clear'],
  },
}))

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders panel even when there are no filters', () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks' },
    })
    expect(wrapper.find('[data-testid="discovery-panel"]').exists()).toBe(true)
  })

  it('opens in version mode when versionTrigger fires and renders results', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', versionTrigger: null },
    })

    await wrapper.setProps({ versionTrigger: { name: 'Lightning Bolt', key: 1 } })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="discovery-panel"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="dcard"]').length).toBe(2)
  })

  it('has no close (×) button — panel cannot be closed, only collapsed', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', versionTrigger: { name: 'Bolt', key: 1 } },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(wrapper.find('[data-testid="close"]').exists()).toBe(false)
  })

  it('collapses body when toggle clicked', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', versionTrigger: { name: 'Bolt', key: 1 } },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.find('[data-testid="body"]').exists()).toBe(true)
    await wrapper.find('[data-testid="toggle-collapse"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="body"]').exists()).toBe(false)
  })

  it('forwards add-to-mainboard from DiscoveryCard', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: {
        scope: 'decks',
        selectedDeckId: 'deck-1',
        versionTrigger: { name: 'Bolt', key: 1 },
      },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    const cards = wrapper.findAllComponents({ name: 'DiscoveryCard' })
    expect(cards.length).toBeGreaterThan(0)
    const firstCard = cards[0]
    if (!firstCard) throw new Error('no card')
    firstCard.vm.$emit('add-to-mainboard', { id: 'p1' })
    await nextTick()

    expect(wrapper.emitted('add-to-mainboard')).toBeTruthy()
  })

  it('renders counter badge when results > 0', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', versionTrigger: { name: 'Bolt', key: 1 } },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.find('[data-testid="counter"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="counter"]').text()).toContain('2')
  })
})
