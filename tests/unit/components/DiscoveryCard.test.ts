import { mount } from '@vue/test-utils'
import DiscoveryCard from '../../../src/components/discovery/DiscoveryCard.vue'
import type { ScryfallCard } from '../../../src/services/scryfall'

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

function makePrint(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 'scry-1',
    name: 'Lightning Bolt',
    set: 'mh3',
    set_name: 'Modern Horizons 3',
    collector_number: '128',
    image_uris: { small: 'small.png', normal: 'normal.png' },
    prices: { usd: '0.50' },
    cmc: 1,
    ...overrides,
  } as unknown as ScryfallCard
}

describe('DiscoveryCard', () => {
  describe('scope: decks', () => {
    it('renders + MB and + SB buttons', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', hasActiveDeck: true },
      })
      expect(wrapper.find('[data-testid="btn-mb"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="btn-sb"]').exists()).toBe(true)
    })

    it('emits add-to-mainboard when + MB clicked', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, {
        props: { print, scope: 'decks', hasActiveDeck: true },
      })
      await wrapper.find('[data-testid="btn-mb"]').trigger('click')
      expect(wrapper.emitted('add-to-mainboard')).toBeTruthy()
      expect(wrapper.emitted('add-to-mainboard')![0]).toEqual([print])
    })

    it('emits add-to-sideboard when + SB clicked', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, {
        props: { print, scope: 'decks', hasActiveDeck: true },
      })
      await wrapper.find('[data-testid="btn-sb"]').trigger('click')
      expect(wrapper.emitted('add-to-sideboard')).toBeTruthy()
    })

    it('disables buttons when no active deck', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', hasActiveDeck: false },
      })
      expect(wrapper.find('[data-testid="btn-mb"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="btn-sb"]').attributes('disabled')).toBeDefined()
    })

    it('shows IN MB badge when inDeckMainboardCount > 0', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', inDeckMainboardCount: 3 },
      })
      expect(wrapper.find('[data-testid="badge-mb"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="badge-mb"]').text()).toContain('3')
    })

    it('shows IN SB badge when inDeckSideboardCount > 0', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', inDeckSideboardCount: 2 },
      })
      expect(wrapper.find('[data-testid="badge-sb"]').exists()).toBe(true)
    })

    it('does NOT show binder badge in decks scope', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', inBinderCount: 5 },
      })
      expect(wrapper.find('[data-testid="badge-binder"]').exists()).toBe(false)
    })
  })

  describe('scope: binders', () => {
    it('renders + ADD button', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'binders', hasActiveBinder: true },
      })
      expect(wrapper.find('[data-testid="btn-binder"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="btn-mb"]').exists()).toBe(false)
    })

    it('emits add-to-binder when clicked', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, {
        props: { print, scope: 'binders', hasActiveBinder: true },
      })
      await wrapper.find('[data-testid="btn-binder"]').trigger('click')
      expect(wrapper.emitted('add-to-binder')).toBeTruthy()
    })

    it('shows IN BINDER badge when inBinderCount > 0', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'binders', inBinderCount: 4 },
      })
      expect(wrapper.find('[data-testid="badge-binder"]').exists()).toBe(true)
    })

    it('disables button when no active binder', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'binders', hasActiveBinder: false },
      })
      expect(wrapper.find('[data-testid="btn-binder"]').attributes('disabled')).toBeDefined()
    })
  })

  describe('scope: collection', () => {
    it('renders status dropdown and + button', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'collection' },
      })
      expect(wrapper.find('[data-testid="status-select"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="btn-collection"]').exists()).toBe(true)
    })

    it('emits add-to-collection with selected status', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, {
        props: { print, scope: 'collection', defaultCollectionStatus: 'sale' },
      })
      await wrapper.find('[data-testid="btn-collection"]').trigger('click')
      const emitted = wrapper.emitted('add-to-collection')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([print, 'sale'])
    })
  })

  describe('common UI', () => {
    it('shows Owned badge when ownedCount > 0', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', ownedCount: 7 },
      })
      expect(wrapper.find('[data-testid="badge-owned"]').exists()).toBe(true)
    })

    it('hides Owned badge when ownedCount = 0', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', ownedCount: 0 },
      })
      expect(wrapper.find('[data-testid="badge-owned"]').exists()).toBe(false)
    })

    it('shows wishlist star when isWishlistedSomewhere=true', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks', isWishlistedSomewhere: true },
      })
      expect(wrapper.find('[data-testid="badge-wishlist"]').exists()).toBe(true)
    })

    it('emits click-image when image area clicked', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, { props: { print, scope: 'decks' } })
      const imageBtn = wrapper.find('button[aria-label="Lightning Bolt"]')
      await imageBtn.trigger('click')
      expect(wrapper.emitted('click-image')).toBeTruthy()
    })

    it('emits open-add-modal when ⋮ clicked', async () => {
      const print = makePrint()
      const wrapper = mount(DiscoveryCard, {
        props: { print, scope: 'decks' },
      })
      await wrapper.find('[data-testid="btn-more"]').trigger('click')
      expect(wrapper.emitted('open-add-modal')).toBeTruthy()
    })

    it('renders image with loading=lazy', () => {
      const wrapper = mount(DiscoveryCard, {
        props: { print: makePrint(), scope: 'decks' },
      })
      const img = wrapper.find('img')
      expect(img.exists()).toBe(true)
      expect(img.attributes('loading')).toBe('lazy')
      expect(img.attributes('src')).toBe('small.png')
    })
  })
})
