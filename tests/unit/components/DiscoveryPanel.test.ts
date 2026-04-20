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

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('does not render when mode is idle', () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', filters: {} },
    })
    expect(wrapper.find('[data-testid="discovery-panel"]').exists()).toBe(false)
  })

  it('opens in version mode when versionTrigger fires and renders results', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', filters: {}, versionTrigger: null },
    })

    await wrapper.setProps({ versionTrigger: { name: 'Lightning Bolt', key: 1 } })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="discovery-panel"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="dcard"]').length).toBe(2)
  })

  it('emits request-close and closes when ✕ clicked', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', filters: {}, versionTrigger: { name: 'Bolt', key: 1 } },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    await wrapper.find('[data-testid="close"]').trigger('click')
    expect(wrapper.emitted('request-close')).toBeTruthy()
    await nextTick()
    expect(wrapper.find('[data-testid="discovery-panel"]').exists()).toBe(false)
  })

  it('collapses body when toggle clicked', async () => {
    const wrapper = mount(DiscoveryPanel, {
      props: { scope: 'decks', filters: {}, versionTrigger: { name: 'Bolt', key: 1 } },
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
        filters: {},
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
      props: { scope: 'decks', filters: {}, versionTrigger: { name: 'Bolt', key: 1 } },
    })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.find('[data-testid="counter"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="counter"]').text()).toContain('2')
  })
})
