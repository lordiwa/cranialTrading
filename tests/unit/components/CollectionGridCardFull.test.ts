import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { makeCard } from '../helpers/fixtures'

// Use vi.hoisted for refs that vi.mock factories can reference at hoist time.
// We cannot use Vue's ref() inside vi.hoisted (import not resolved yet),
// so we create plain reactive-like objects and replace them with real refs below.
const swipeMocks = vi.hoisted(() => {
  return {
    isSwiping: { value: false },
    swipeOffset: { value: 0 },
    useSwipeFn: vi.fn(),
  }
})

// Mock Firebase dependencies
vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  getFirestore: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
}))

// Mock useSwipe — returns the reactive refs we control from tests
vi.mock('../../../src/composables/useSwipe', () => ({
  useSwipe: swipeMocks.useSwipeFn,
}))

// Mock composables that need store/Firebase access
vi.mock('../../../src/composables/useCardAllocation', () => ({
  useCardAllocation: () => ({
    getTotalAllocated: vi.fn(() => 0),
    getAvailableQuantity: vi.fn(() => 4),
    getAllocationsForCard: vi.fn(() => []),
  }),
}))

vi.mock('../../../src/composables/useCardPrices', () => ({
  useCardPrices: () => ({
    cardKingdomRetail: ref(null),
    cardKingdomBuylist: ref(null),
    hasCardKingdomPrices: ref(false),
    fetchPrices: vi.fn(),
    formatPrice: vi.fn((p: number | null) => p ? `$${p.toFixed(2)}` : '-'),
  }),
}))

vi.mock('../../../src/composables/usePriceHistory', () => ({
  usePriceHistory: () => ({
    loadCardHistory: vi.fn(() => Promise.resolve([])),
  }),
}))

vi.mock('../../../src/composables/useContextMenu', () => ({
  useContextMenu: () => ({
    isVisible: ref(false),
    position: ref({ x: 0, y: 0 }),
    open: vi.fn(),
    close: vi.fn(),
  }),
}))

import CollectionGridCardFull from '../../../src/components/collection/CollectionGridCardFull.vue'

describe('CollectionGridCardFull', () => {
  // Real Vue refs used to control swipe state from test assertions
  let isSwipingRef: ReturnType<typeof ref<boolean>>
  let swipeOffsetRef: ReturnType<typeof ref<number>>

  beforeEach(() => {
    setActivePinia(createPinia())

    // Create real Vue refs and wire the mock to return them
    isSwipingRef = ref(false)
    swipeOffsetRef = ref(0)
    swipeMocks.useSwipeFn.mockImplementation(() => ({
      isSwiping: isSwipingRef,
      swipeOffset: swipeOffsetRef,
    }))
    swipeMocks.useSwipeFn.mockClear()
  })

  it('renders card name', () => {
    const card = makeCard({ name: 'Lightning Bolt' })
    const wrapper = mount(CollectionGridCardFull, { props: { card } })
    expect(wrapper.text()).toContain('Lightning Bolt')
  })

  it('renders card edition', () => {
    const card = makeCard({ edition: 'Magic 2021', condition: 'NM' })
    const wrapper = mount(CollectionGridCardFull, { props: { card } })
    expect(wrapper.text()).toContain('Magic 2021')
  })

  it('calls useSwipe with threshold: 80', () => {
    const card = makeCard()
    mount(CollectionGridCardFull, { props: { card } })
    expect(swipeMocks.useSwipeFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threshold: 80 })
    )
  })

  it('does not have inline ontouchstart/ontouchmove/ontouchend attributes', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card } })
    // useSwipe attaches via addEventListener in onMounted — no template @touch* bindings
    const html = wrapper.html()
    expect(html).not.toContain('ontouchstart')
    expect(html).not.toContain('ontouchmove')
    expect(html).not.toContain('ontouchend')
  })

  it('applies swipeStyle transform when isSwiping with positive offset', async () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card } })

    isSwipingRef.value = true
    swipeOffsetRef.value = 50
    await wrapper.vm.$nextTick()

    const imageContainer = wrapper.find('.aspect-\\[3\\/4\\]')
    const style = imageContainer.attributes('style') ?? ''
    expect(style).toContain('translateX(50px)')
  })

  it('clamps swipeOffset to +120px maximum', async () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card } })

    isSwipingRef.value = true
    swipeOffsetRef.value = 200
    await wrapper.vm.$nextTick()

    const imageContainer = wrapper.find('.aspect-\\[3\\/4\\]')
    const style = imageContainer.attributes('style') ?? ''
    expect(style).toContain('translateX(120px)')
  })

  it('clamps swipeOffset to -120px minimum', async () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card } })

    isSwipingRef.value = true
    swipeOffsetRef.value = -200
    await wrapper.vm.$nextTick()

    const imageContainer = wrapper.find('.aspect-\\[3\\/4\\]')
    const style = imageContainer.attributes('style') ?? ''
    expect(style).toContain('translateX(-120px)')
  })

  it('shows delete overlay when isBeingDeleted=true', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card, isBeingDeleted: true } })
    expect(wrapper.find('.text-rust').exists()).toBe(true)
  })

  it('hides delete button when readonly=true', () => {
    const card = makeCard()
    const wrapper = mount(CollectionGridCardFull, { props: { card, readonly: true } })
    // v-if="!readonly && !isBeingDeleted" on the delete button
    expect(wrapper.html()).not.toContain('cards.grid.delete')
  })

  // TASK-241 AC7: our own /img/ proxy is a NEW single point of failure that
  // did not exist before this ticket — if it fails, the grid must not go
  // blank. scryfallFallbackUrl itself is unit-tested in isolation
  // (tests/unit/utils/cardImageUrl.test.ts); this proves the component
  // actually WIRES it into the rendered <img>'s src on a real load failure.
  it('falls back to the direct Scryfall URL when our own proxy image fails to load (AC7)', async () => {
    const card = makeCard({ image: '/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp' })
    const wrapper = mount(CollectionGridCardFull, { props: { card } })

    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')

    await img.trigger('error')

    expect(wrapper.find('img').attributes('src')).toBe(
      'https://cards.scryfall.io/thumb/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })

  it('does not attempt a fallback (and keeps showing) a non-proxy image URL on error', async () => {
    const card = makeCard({ image: 'https://example.com/bolt.jpg' })
    const wrapper = mount(CollectionGridCardFull, { props: { card } })

    const img = wrapper.find('img')
    await img.trigger('error')

    // No proxy URL to rewrite — src is unchanged, the card just falls
    // through to the existing "failed to load" overlay path.
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/bolt.jpg')
  })
})
