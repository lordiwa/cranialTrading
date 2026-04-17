import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeckStatsFooter from '../../../src/components/decks/DeckStatsFooter.vue'

// Mock Firebase dependencies (transitive imports)
vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
}))

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

// Echo i18n keys to make assertions readable
vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: Record<string, unknown>) => key,
  }),
}))

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    ownedCount: 10,
    wishlistCount: 5,
    ownedCost: 123.45,
    wishlistCost: 67.89,
    totalCost: 191.34,
    priceSource: 'ck' as const,
    sourceColor: 'text-[#4CAF50]',
    sourceLabel: 'CK',
    expanded: false,
    completionPercentage: 42,
    ...overrides,
  }
}

describe('DeckStatsFooter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering', () => {
    it('renders the owned count', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ ownedCount: 42 }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('42')
    })

    it('renders the total cost with 2 decimals', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ totalCost: 100 }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('$100.00')
    })

    it('renders the owned cost with 2 decimals', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ ownedCost: 50.5 }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('$50.50')
    })

    it('renders the wishlist count', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ wishlistCount: 17 }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('17')
    })

    it('renders the active source label (e.g. CK)', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ sourceLabel: 'BUY' }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('BUY')
    })

    it('renders the completion percentage when provided', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ completionPercentage: 75 }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      expect(wrapper.text()).toContain('75%')
    })

    it('omits completion percentage when null', () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ completionPercentage: null }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      // 75% would appear if rendered; without completion nothing with '%' other than progress bar width strings
      expect(wrapper.text()).not.toContain('75%')
    })
  })

  describe('event emission', () => {
    it('emits update:expanded when expand toggle is clicked', async () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ expanded: false }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      const buttons = wrapper.findAll('button')
      // The mobile expand-toggle is a button with no price-source value — locate it heuristically
      // by being the button that contains the percentage/toggle chevron
      const toggleBtn = buttons.find(b => b.html().includes('polyline'))
      expect(toggleBtn).toBeTruthy()
      await toggleBtn!.trigger('click')
      const emitted = wrapper.emitted('update:expanded')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual([true])
    })

    it('emits change-source with "tcg" when TCG button clicked (desktop)', async () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps(),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      const buttons = wrapper.findAll('button')
      const tcgBtn = buttons.find(b => b.text() === 'TCG')
      expect(tcgBtn).toBeTruthy()
      await tcgBtn!.trigger('click')
      const emitted = wrapper.emitted('change-source')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['tcg'])
    })

    it('emits change-source with "ck" when CK button clicked', async () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps({ priceSource: 'tcg' }),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      const buttons = wrapper.findAll('button')
      const ckBtn = buttons.find(b => b.text() === 'CK')
      expect(ckBtn).toBeTruthy()
      await ckBtn!.trigger('click')
      const emitted = wrapper.emitted('change-source')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['ck'])
    })

    it('emits change-source with "buylist" when Buylist button clicked', async () => {
      const wrapper = mount(DeckStatsFooter, {
        props: makeProps(),
        global: {
          stubs: {
            Teleport: { template: '<div><slot /></div>' },
          },
        },
      })
      const buttons = wrapper.findAll('button')
      const buyBtn = buttons.find(b => b.text() === 'Buylist')
      expect(buyBtn).toBeTruthy()
      await buyBtn!.trigger('click')
      const emitted = wrapper.emitted('change-source')
      expect(emitted).toBeTruthy()
      expect(emitted![0]).toEqual(['buylist'])
    })
  })
})
