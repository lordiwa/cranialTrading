import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BulkSelectionActionBar from '../../../src/components/collection/BulkSelectionActionBar.vue'
import type { Binder } from '../../../src/types/binder'
import type { Deck } from '../../../src/types/deck'

// Mock Firebase dependencies (components may transitively reach firebase via imports)
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

// Mock the i18n composable — return the key itself so we can assert text presence.
// NOTE: The component applies .toUpperCase() to some status keys, so searches for
// those must be done case-insensitively (lowercase both sides).
vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: Record<string, unknown>) => key,
  }),
}))

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    format: 'modern',
    mainboard: [],
    sideboard: [],
    stats: {
      totalCards: 0,
      sideboardCount: 0,
      uniqueCards: 0,
      totalValue: 0,
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Deck
}

function makeBinder(overrides: Partial<Binder> = {}): Binder {
  return {
    id: 'binder-1',
    name: 'Test Binder',
    allocations: [],
    stats: {
      totalCards: 0,
      uniqueCards: 0,
      totalValue: 0,
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Binder
}

describe('BulkSelectionActionBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering', () => {
    it('renders the selected count', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 3,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      expect(wrapper.text()).toContain('collection.bulkDelete.selected')
    })

    it('renders all 4 status buttons (collection, trade, sale, wishlist)', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 1,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      // Status labels are uppercased via .toUpperCase() — check case-insensitively
      const text = wrapper.text().toLowerCase()
      expect(text).toContain('common.status.collection')
      expect(text).toContain('common.status.trade')
      expect(text).toContain('common.status.sale')
      expect(text).toContain('common.status.wishlist')
    })

    it('renders both visibility buttons (public/private)', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 1,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const text = wrapper.text()
      expect(text).toContain('collection.bulkEdit.setPublic')
      expect(text).toContain('collection.bulkEdit.setPrivate')
    })

    it('renders deck and binder picker triggers', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 1,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const text = wrapper.text()
      expect(text).toContain('collection.bulkEdit.deck')
      expect(text).toContain('collection.bulkEdit.binder')
    })

    it('shows the progress overlay when bulkActionLoading is true', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 5,
          bulkActionLoading: true,
          bulkActionProgress: 42,
          decks: [],
          binders: [],
        },
      })
      const text = wrapper.text()
      expect(text).toContain('42%')
    })

    it('disables action buttons when selectedCount is 0', () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 0,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const statusButton = buttons.find(b => b.text().toLowerCase().includes('common.status.collection'))
      expect(statusButton?.attributes('disabled')).toBeDefined()
    })
  })

  describe('event emission', () => {
    it('emits toggle-selection-mode when cancel is clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const cancelBtn = buttons.find(b => b.text().includes('common.actions.cancel'))
      await cancelBtn?.trigger('click')
      expect(wrapper.emitted('toggle-selection-mode')).toBeTruthy()
    })

    it('emits select-all when the "select all" link is clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const selectAllBtn = buttons.find(b => b.text().includes('collection.bulkDelete.selectAll'))
      await selectAllBtn?.trigger('click')
      expect(wrapper.emitted('select-all')).toBeTruthy()
    })

    it('emits clear-selection when the clear link is clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const clearBtn = buttons.find(b => b.text().includes('collection.bulkDelete.clearSelection'))
      await clearBtn?.trigger('click')
      expect(wrapper.emitted('clear-selection')).toBeTruthy()
    })

    it('emits change-status with "collection" when collection button clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().toLowerCase().includes('common.status.collection'))
      await btn?.trigger('click')
      expect(wrapper.emitted('change-status')).toBeTruthy()
      expect(wrapper.emitted('change-status')![0]).toEqual(['collection'])
    })

    it('emits change-status with "trade" when trade button clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().toLowerCase().includes('common.status.trade'))
      await btn?.trigger('click')
      expect(wrapper.emitted('change-status')![0]).toEqual(['trade'])
    })

    it('emits change-status with "sale" when sale button clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().toLowerCase().includes('common.status.sale'))
      await btn?.trigger('click')
      expect(wrapper.emitted('change-status')![0]).toEqual(['sale'])
    })

    it('emits change-status with "wishlist" when wishlist button clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().toLowerCase().includes('common.status.wishlist'))
      await btn?.trigger('click')
      expect(wrapper.emitted('change-status')![0]).toEqual(['wishlist'])
    })

    it('emits toggle-public with true when SET PUBLIC clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().includes('collection.bulkEdit.setPublic'))
      await btn?.trigger('click')
      expect(wrapper.emitted('toggle-public')![0]).toEqual([true])
    })

    it('emits toggle-public with false when SET PRIVATE clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const btn = buttons.find(b => b.text().includes('collection.bulkEdit.setPrivate'))
      await btn?.trigger('click')
      expect(wrapper.emitted('toggle-public')![0]).toEqual([false])
    })

    it('emits allocate-to-deck with deckId when a deck row is clicked', async () => {
      const deck = makeDeck({ id: 'deck-42', name: 'Atraxa' })
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [deck],
          binders: [],
        },
      })
      // Open deck picker
      const buttons = wrapper.findAll('button')
      const deckTrigger = buttons.find(b => b.text().includes('collection.bulkEdit.deck'))
      await deckTrigger?.trigger('click')
      // Now find the "Atraxa" row
      const deckRow = wrapper.findAll('button').find(b => b.text().includes('Atraxa'))
      await deckRow?.trigger('click')
      expect(wrapper.emitted('allocate-to-deck')![0]).toEqual(['deck-42'])
    })

    it('emits allocate-to-binder with binderId when a binder row is clicked', async () => {
      const binder = makeBinder({ id: 'binder-7', name: 'Trade Binder' })
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [binder],
        },
      })
      const buttons = wrapper.findAll('button')
      const binderTrigger = buttons.find(b => b.text().includes('collection.bulkEdit.binder'))
      await binderTrigger?.trigger('click')
      const binderRow = wrapper.findAll('button').find(b => b.text().includes('Trade Binder'))
      await binderRow?.trigger('click')
      expect(wrapper.emitted('allocate-to-binder')![0]).toEqual(['binder-7'])
    })

    it('emits create-deck when "+ new deck" clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const deckTrigger = buttons.find(b => b.text().includes('collection.bulkEdit.deck'))
      await deckTrigger?.trigger('click')
      const newDeckBtn = wrapper.findAll('button').find(b => b.text().includes('collection.bulkEdit.newDeck'))
      await newDeckBtn?.trigger('click')
      expect(wrapper.emitted('create-deck')).toBeTruthy()
    })

    it('emits create-binder when "+ new binder" clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 2,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const binderTrigger = buttons.find(b => b.text().includes('collection.bulkEdit.binder'))
      await binderTrigger?.trigger('click')
      const newBinderBtn = wrapper.findAll('button').find(b => b.text().includes('collection.bulkEdit.newBinder'))
      await newBinderBtn?.trigger('click')
      expect(wrapper.emitted('create-binder')).toBeTruthy()
    })

    it('emits delete when the danger delete button clicked', async () => {
      const wrapper = mount(BulkSelectionActionBar, {
        props: {
          selectedCount: 4,
          bulkActionLoading: false,
          bulkActionProgress: 0,
          decks: [],
          binders: [],
        },
      })
      const buttons = wrapper.findAll('button')
      const deleteBtn = buttons.find(b => b.text().includes('collection.bulkDelete.deleteSelected'))
      await deleteBtn?.trigger('click')
      expect(wrapper.emitted('delete')).toBeTruthy()
    })
  })
})
