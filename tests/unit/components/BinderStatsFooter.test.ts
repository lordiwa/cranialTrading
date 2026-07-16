import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BinderStatsFooter from '../../../src/components/binders/BinderStatsFooter.vue'

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
    totalCards: 124,
    forSaleCount: 118,
    tradeCount: 6,
    totalValue: 21480,
    ...overrides,
  }
}

function mountFooter(overrides: Record<string, unknown> = {}) {
  return mount(BinderStatsFooter, {
    props: makeProps(overrides),
    global: {
      stubs: {
        Teleport: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('BinderStatsFooter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering', () => {
    it('renders the total card count', () => {
      const wrapper = mountFooter({ totalCards: 42 })
      expect(wrapper.text()).toContain('42')
    })

    it('renders the for-sale count', () => {
      const wrapper = mountFooter({ forSaleCount: 17 })
      expect(wrapper.text()).toContain('17')
    })

    it('renders the trade count', () => {
      const wrapper = mountFooter({ tradeCount: 9 })
      expect(wrapper.text()).toContain('9')
    })

    it('renders the total value with 2 decimals', () => {
      const wrapper = mountFooter({ totalValue: 100 })
      expect(wrapper.text()).toContain('$100.00')
    })
  })

  describe('mobile expand toggle', () => {
    it('reveals the mobile detail row (with the trade-count label) when toggled', async () => {
      const wrapper = mountFooter({ tradeCount: 6 })
      // jsdom doesn't honor `hidden md:flex`, so the desktop row's "trade" label is
      // always present in wrapper.text() — count goes from 1 (desktop only) to 2
      // (desktop + newly-rendered mobile detail row) once expanded.
      const beforeCount = (wrapper.text().match(/binders\.stats\.trade/g) ?? []).length
      expect(beforeCount).toBe(1)

      const toggleBtn = wrapper.findAll('button').find(b => b.html().includes('polyline'))
      expect(toggleBtn).toBeTruthy()
      await toggleBtn!.trigger('click')

      const afterCount = (wrapper.text().match(/binders\.stats\.trade/g) ?? []).length
      expect(afterCount).toBe(2)
    })
  })
})
