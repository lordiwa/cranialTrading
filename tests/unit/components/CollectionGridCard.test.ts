import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CollectionGridCard from '../../../src/components/collection/CollectionGridCard.vue'
import { makeCard } from '../helpers/fixtures'

// Mock the child components so the routing shell test is isolated
vi.mock('../../../src/components/collection/CollectionGridCardCompact.vue', () => ({
  default: {
    name: 'CollectionGridCardCompact',
    template: '<div data-testid="compact-card">compact</div>',
    props: ['card', 'compact', 'readonly', 'showInterest', 'isInterested', 'showCart', 'isInCart', 'isBeingDeleted', 'selectionMode', 'isSelected'],
    emits: ['cardClick', 'delete', 'interest', 'addToCart', 'toggleSelect'],
  },
}))

vi.mock('../../../src/components/collection/CollectionGridCardFull.vue', () => ({
  default: {
    name: 'CollectionGridCardFull',
    template: '<div data-testid="full-card">full</div>',
    props: ['card', 'compact', 'readonly', 'showInterest', 'isInterested', 'showCart', 'isInCart', 'isBeingDeleted', 'selectionMode', 'isSelected'],
    emits: ['cardClick', 'delete', 'interest', 'addToCart', 'toggleSelect'],
  },
}))

describe('CollectionGridCard (routing shell)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders CollectionGridCardCompact when compact=true', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: { card, compact: true },
    })
    expect(wrapper.find('[data-testid="compact-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="full-card"]').exists()).toBe(false)
  })

  it('renders CollectionGridCardFull when compact=false', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: { card, compact: false },
    })
    expect(wrapper.find('[data-testid="full-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="compact-card"]').exists()).toBe(false)
  })

  it('renders CollectionGridCardFull by default when compact not provided', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: { card },
    })
    expect(wrapper.find('[data-testid="full-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="compact-card"]').exists()).toBe(false)
  })

  it('re-emits cardClick event from child', async () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: { card, compact: false },
    })
    const fullCard = wrapper.findComponent({ name: 'CollectionGridCardFull' })
    fullCard.vm.$emit('cardClick', card)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cardClick')).toBeTruthy()
  })

  it('re-emits delete event from child', async () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: { card, compact: false },
    })
    const fullCard = wrapper.findComponent({ name: 'CollectionGridCardFull' })
    fullCard.vm.$emit('delete', card)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('delete')).toBeTruthy()
  })

  it('passes props through to compact child', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCard, {
      props: {
        card,
        compact: true,
        readonly: true,
        isBeingDeleted: false,
        selectionMode: true,
        isSelected: false,
      },
    })
    const compactCard = wrapper.findComponent({ name: 'CollectionGridCardCompact' })
    expect(compactCard.props('readonly')).toBe(true)
    expect(compactCard.props('selectionMode')).toBe(true)
  })
})
