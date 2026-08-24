/**
 * TASK-280. Production incident (2026-08-24, prod account
 * Rt5DOfZXBtPZkEpK4N5pW6a5FXs1): editing Grand Abolisher's quantity in
 * CardDetailModal left the SAVE button stuck on "GUARDANDO" forever and
 * created a DUPLICATE card doc — a live `sale` doc that was never touched
 * plus a new `collection` doc — because the save decided create-vs-update
 * from `collectionStore.cards` (an in-memory list that did not contain the
 * `sale` doc at save time) with no verification against Firestore.
 *
 * AC1: applyStatusOperations must not create when the identity already
 * exists on the server, even if it's missing from memory.
 * AC2: initializeForm's statusDistribution must reflect server reality,
 * not just what happens to be in memory.
 * AC3: a hung await anywhere in the chain must still release the SAVE
 * button (isLoading -> false) instead of leaving it stuck forever.
 *
 * BaseModal renders its content via <Teleport to="body">, so assertions
 * query document.body directly (mount with attachTo: document.body) —
 * mirrors the existing pattern in tests/unit/components/BottomSheet.test.ts.
 */

vi.mock('@/services/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn().mockResolvedValue({ cards: [], total: 0, page: 0, pageSize: 50, hasMore: false }),
  buildCardIndex: vi.fn(),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
  isPublicCard: vi.fn(() => false),
  scheduleIndexReconcile: vi.fn(),
  batchSyncCardsToPublic: vi.fn().mockResolvedValue(undefined),
  removeCardFromPublic: vi.fn().mockResolvedValue(undefined),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
  getCardById: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/services/scryfall', () => ({
  searchCards: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
}))

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDocs = vi.fn().mockResolvedValue({ empty: true, docs: [] })
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn((...args: unknown[]) => args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  deleteField: vi.fn(() => '__DELETE__'),
  doc: vi.fn((...args: unknown[]) => (
    args.length === 1 ? { id: 'new-card-id', path: 'users/test-user-id/cards/new-card-id' } : { path: args.join('/') }
  )),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
  getDoc: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  where: vi.fn((...args: unknown[]) => args),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com', username: 'testuser' },
  })),
}))

import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import CardDetailModal from '@/components/collection/CardDetailModal.vue'
import { useCollectionStore } from '@/stores/collection'
import { makeCard } from '../helpers/fixtures'

const fakeTimestamp = (ms: number) => ({ toDate: () => new Date(ms) })

function docWith(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

async function clickInRow(testId: string, buttonIndex: number, times: number) {
  for (let i = 0; i < times; i++) {
    const btn = document.querySelectorAll(`[data-testid="${testId}"] button`)[buttonIndex] as HTMLButtonElement
    btn.click()
    await nextTick()
  }
}

function qtyText(testId: string): string {
  return document.querySelector(`[data-testid="${testId}"] span.w-7`)?.textContent?.trim() ?? ''
}

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mockUpdateDoc.mockResolvedValue(undefined)
  mockDeleteDoc.mockResolvedValue(undefined)
  mockSetDoc.mockResolvedValue(undefined)
  mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
})

describe('CardDetailModal — TASK-280 save must check Firestore before creating a duplicate', () => {
  it('AC2: statusDistribution reflects the server doc even when memory (collectionStore.cards) is empty', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        docWith('sale-1', {
          scryfallId: 'sf-1', name: 'Grand Abolisher', edition: 'Commander Masters', setCode: 'CMM',
          quantity: 5, condition: 'NM', foil: false, price: 1, image: '', status: 'sale', public: false,
          createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(1000),
        }),
      ],
    })

    const collectionStore = useCollectionStore()
    collectionStore.cards = [] as any // memory does NOT have the doc — exactly the measured production gap

    const card = makeCard({
      id: 'sale-1', scryfallId: 'sf-1', edition: 'Commander Masters', setCode: 'CMM',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()

    expect(qtyText('qty-row-sale')).toBe('5')
    expect(qtyText('qty-row-collection')).toBe('0')

    wrapper.unmount()
  })

  it('AC1 regression: memory empty, server has the sale doc — reducing its quantity produces an update, never a create', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        docWith('sale-1', {
          scryfallId: 'sf-1', name: 'Grand Abolisher', edition: 'Commander Masters', setCode: 'CMM',
          quantity: 5, condition: 'NM', foil: false, price: 1, image: '', status: 'sale', public: false,
          createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(1000),
        }),
      ],
    })

    const collectionStore = useCollectionStore()
    collectionStore.cards = [] as any

    const card = makeCard({
      id: 'sale-1', scryfallId: 'sf-1', edition: 'Commander Masters', setCode: 'CMM',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('5')

    // Reduce sale 5 -> 2 (mirrors the production repro: 5 -> 2), same status.
    await clickInRow('qty-row-sale', 0, 3)
    expect(qtyText('qty-row-sale')).toBe('2')

    const saveButton = findButtonByText('common.actions.save')
    expect(saveButton).toBeTruthy()
    saveButton!.click()
    await flushPromises()

    // NO create: addCard writes via setDoc (TASK-255), never addDoc.
    expect(mockSetDoc).not.toHaveBeenCalled()
    // YES update: the existing server doc gets updated in place.
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    const [ref, payload] = mockUpdateDoc.mock.calls[0]!
    expect(ref.path).toContain('users/test-user-id/cards/sale-1')
    expect(payload.quantity).toBe(2)

    wrapper.unmount()
  })

  it('AC3: a hung Firestore read during save still releases the SAVE button (isLoading -> false)', async () => {
    vi.useFakeTimers()
    try {
      const card = makeCard({
        id: 'card-1', scryfallId: 'sf-2', edition: 'Modern Horizons 2', setCode: 'MH2',
        condition: 'NM', foil: false, status: 'collection', quantity: 4,
      })

      const collectionStore = useCollectionStore()
      collectionStore.cards = [card] as any

      const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
      await vi.advanceTimersByTimeAsync(0)

      // Hang the NEXT getDocs call — the one handleSave's own
      // fetchServerCardsByPrint issues (initializeForm's call above already
      // resolved via the default mockResolvedValue).
      mockGetDocs.mockImplementationOnce(() => new Promise(() => {}))

      const saveButton = findButtonByText('common.actions.save')
      expect(saveButton).toBeTruthy()
      saveButton!.click()
      await vi.advanceTimersByTimeAsync(0)

      // Still "saving" — the hang is real before the timeout fires.
      expect(findButtonByText('common.actions.saving')).toBeTruthy()

      await vi.advanceTimersByTimeAsync(20000)
      await vi.advanceTimersByTimeAsync(0)

      // Released — the button must never stay stuck on "GUARDANDO" forever.
      expect(findButtonByText('common.actions.saving')).toBeFalsy()
      expect(findButtonByText('common.actions.save')).toBeTruthy()

      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('HIGH-1 regression: memory empty, server sale doc moved to collection — the server-only sale doc is actually DELETED (not silently kept)', async () => {
    // The exact production repro: sale 5 -> collection 2, cross-status.
    // computeStatusOperations emits delete(sale) + create(collection).
    // Before HIGH-1, deleteCard('server-sale') could not find the id in
    // memory (memory is empty) and returned false WITHOUT calling
    // deleteDoc — the sale doc survived as a live duplicate.
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [
        docWith('server-sale', {
          scryfallId: 'sf-3', name: 'Grand Abolisher', edition: 'Commander Masters', setCode: 'CMM',
          quantity: 5, condition: 'NM', foil: false, price: 1, image: '', status: 'sale', public: false,
          createdAt: fakeTimestamp(1000), updatedAt: fakeTimestamp(1000),
        }),
      ],
    })

    const collectionStore = useCollectionStore()
    collectionStore.cards = [] as any

    const card = makeCard({
      id: 'server-sale', scryfallId: 'sf-3', edition: 'Commander Masters', setCode: 'CMM',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('5')

    // sale 5 -> 0
    await clickInRow('qty-row-sale', 0, 5)
    expect(qtyText('qty-row-sale')).toBe('0')
    // collection 0 -> 2
    await clickInRow('qty-row-collection', 1, 2)
    expect(qtyText('qty-row-collection')).toBe('2')

    const saveButton = findButtonByText('common.actions.save')
    expect(saveButton).toBeTruthy()
    saveButton!.click()
    await flushPromises()
    // deleteCard internally does `await import('../services/cloudFunctions')`
    // (dynamic import, kept lazy on purpose — see the comment on that
    // wrapper in collection.ts). The FIRST dynamic import of a module in
    // this test environment takes real wall-clock time to compile, more
    // than flushPromises' microtask-only drain covers — this delay is a
    // test-harness artifact of that first-use compile, not app behavior
    // (verified: the awaited call resolves correctly once given time, see
    // the isolated collection.deleteCardFallback.test.ts which needs no
    // such wait because it doesn't share a module graph with this mount).
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The server-only sale doc must actually be deleted from Firestore.
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
    const [deleteRef] = mockDeleteDoc.mock.calls[0]!
    expect(deleteRef.path).toContain('server-sale')
    // collection never existed anywhere (memory or server) -> legitimate create.
    expect(mockSetDoc).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('HIGH-2 regression: opening a new card never shows the previous card\'s statusDistribution while the server read is still in flight', async () => {
    const cardA = makeCard({
      id: 'card-a', scryfallId: 'sf-a', edition: 'Edition A', setCode: 'AAA',
      condition: 'NM', foil: false, status: 'collection', quantity: 3,
    })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [cardA] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: cardA }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-collection')).toBe('3')

    // Card B: a DIFFERENT identity, memory already has it at qty 7. Stall
    // the server read this new open triggers so we can inspect the state
    // in the gap BEFORE it resolves.
    const cardB = makeCard({
      id: 'card-b', scryfallId: 'sf-b', edition: 'Edition B', setCode: 'BBB',
      condition: 'NM', foil: false, status: 'collection', quantity: 7,
    })
    collectionStore.cards = [cardB] as any
    mockGetDocs.mockImplementationOnce(() => new Promise(() => {})) // never resolves in this test

    // Mirrors how CollectionView actually opens a different card: close then reopen.
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true, card: cardB })

    // The server read for B is still pending — but the DOM must already
    // reflect B's OWN memory-known state, never A's leftover numbers.
    expect(qtyText('qty-row-collection')).toBe('7')

    wrapper.unmount()
  })
})
