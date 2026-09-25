const idh = vi.hoisted(() => ({ n: 0 }))
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
  // TASK-318 4th review round: a single hardcoded 'new-card-id' collided
  // when a save creates MORE THAN ONE new row (e.g. a status split — sale
  // AND trade both need a new doc). The second create silently overwrote
  // the first in cardsById, so a later step's allocateCardToDeck resolved
  // the WRONG card's quantity and produced a wishlist-overflow artifact
  // that had nothing to do with the behavior under test. Unique per call.
  doc: vi.fn((...args: unknown[]) => (
    args.length === 1
      ? (() => { const id = 'new-' + (++idh.n); return { id, path: 'users/test-user-id/cards/' + id } })()
      : { path: args.join('/') }
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
import { useBindersStore } from '@/stores/binders'
import { useCollectionStore } from '@/stores/collection'
import { useDecksStore } from '@/stores/decks'
import { useToastStore } from '@/stores/toast'
import { makeCard } from '../helpers/fixtures'
import type { Card } from '@/types/card'

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
  idh.n = 0
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

// ────────────────────────────────────────────────────────────────────────────
// TASK-318 review findings (M2, M3, and — 3rd review round — H3/H4/H5/H6):
// the pure-function tests in cardSaveDiff.test.ts / deckSlotDiff.test.ts /
// binderSlotDiff.test.ts only ever exercise a single clean save — a merge
// into an ALREADY-EXISTING destination row that itself carries allocations
// (M2), an old-identity row the modal never displayed (M3), and a
// create/update failure's effect on the delete/migration steps that follow
// it (H3-H6) all live in how handleSave WIRES its inputs together, not
// reachable from those pure calls alone. These need the real component +
// real decks/collection store wiring.
//
// 3rd round design (Mato's decision, "nunca borrar despues de un fallo"):
// there is no more in-modal retry — ANY failure closes the modal with an
// honest toast. The tests that used to click SAVE twice to exercise a retry
// (H1, "case 4 + retry", "NEW-HIGH-1(b)", MEDIUM-2) are gone; that behavior
// no longer exists to test. In its place: H3 (a create/update failure never
// deletes anything, so the pre-existing row and its allocations survive
// intact), H4/H5 (a create/update failure blocks EVERY delete globally, not
// just the one for its own status — a status whose own create succeeded
// still keeps its old row, a visible duplicate, rather than risk losing
// data elsewhere), and the delete-only-failure case (every create/update
// succeeded, only a delete failed — the "acceptable" outcome: a visible
// duplicate, honest toast, nothing lost). H6 (double migration across
// retries) is structurally impossible now — there is no second attempt for
// a row to be counted twice by.
// ────────────────────────────────────────────────────────────────────────────

async function setCondition(value: string) {
  const select = document.querySelector('#detail-condition') as HTMLSelectElement
  select.value = value
  select.dispatchEvent(new Event('change'))
  await nextTick()
}

function toastMessages(): string[] {
  return (useToastStore().toasts as unknown as { message: string }[]).map(t => t.message)
}

describe('CardDetailModal — TASK-318 identity-change failure handling (never delete after a failure)', () => {
  it('H3 regression: a failed create never deletes the old row — NM x5 and its deck allocation survive intact, modal closes with an honest error', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nm-row', scryfallId: 'sf-h3', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmCard] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nm-row', quantity: 3, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 3, ownedCards: 3, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('5')

    await setCondition('LP')

    // The only op this save needs is a create (no existing LP row). It fails.
    mockSetDoc.mockRejectedValueOnce(new Error('simulated create failure'))

    const saveButton = findButtonByText('common.actions.save')
    expect(saveButton).toBeTruthy()
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression this locks: before this round, the delete of nm-row
    // (queued right after the failed create) still ran regardless, and
    // STEP 3 still deallocated the deck — the create's failure meant NO
    // replacement row ever existed, so the cards and the allocation were
    // both just gone.
    const finalRows = (collectionStore.cards as unknown as Card[]).filter(c => c.scryfallId === 'sf-h3')
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0]).toMatchObject({ id: 'nm-row', condition: 'NM', quantity: 5 })

    const deck = decksStore.decks.find(d => d.id === 'D1')
    expect(deck?.allocations).toHaveLength(1)
    expect(deck?.allocations[0]).toMatchObject({ cardId: 'nm-row', quantity: 3 })

    // L1: assert the toast and the close, not just the rows. TASK-318 M-T
    // (4th round): a create/update failure ALWAYS shows saveIncompleteError,
    // never the more definite saveError — addCard/updateCard's own
    // CARD_WRITE_TIMEOUT_MS wrapping means the write can still land LATE
    // after this call already resolved null/false, so "nothing was saved"
    // could be false even though anySucceeded reads false right now.
    expect(toastMessages()).toContain('cards.detailModal.saveIncompleteError')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('H4/H5 regression: one status\' create failing blocks EVERY delete globally — a status whose own create succeeded still keeps its old row rather than risk data loss', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nm-sale', scryfallId: 'sf-h4', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 3,
    })
    const nmTrade = makeCard({
      id: 'nm-trade', scryfallId: 'sf-h4', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'trade', quantity: 2,
    })
    collectionStore.cards = [nmSale, nmTrade] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('3')

    await setCondition('LP')

    // computeStatusOperations' global M1 order creates 'sale' before
    // 'trade' (STATUS_ORDER). Let the first create (sale) succeed, the
    // second (trade) fail.
    mockSetDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('trade create fails'))

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression: nm-sale's OWN create succeeded, but because
    // nm-trade's create failed, NO delete anywhere is allowed to run — not
    // even nm-sale's, which "could have" safely gone. That's the accepted
    // cost of a single global gate (point 1 of Mato's decision): a status
    // whose own create succeeded still keeps its old row, a visible
        // duplicate, rather than risk deleting a row whose replacement never
    // landed. Nothing is EVER lost: nm-sale, nm-trade, and the new LP sale
    // row all still exist; no LP trade row was created.
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalSale = finalCards.filter(c => c.scryfallId === 'sf-h4' && c.status === 'sale')
    const finalTrade = finalCards.filter(c => c.scryfallId === 'sf-h4' && c.status === 'trade')
    expect(finalSale.map(c => `${c.condition}:${c.quantity}`).sort()).toEqual(['LP:3', 'NM:3'])
    expect(finalTrade).toHaveLength(1)
    expect(finalTrade[0]).toMatchObject({ id: 'nm-trade', condition: 'NM', quantity: 2 })

    // L1/L3: something DID succeed (the sale create), so the honest message
    // is "incomplete", not the bare "nothing was saved" saveError.
    expect(toastMessages()).toContain('cards.detailModal.saveIncompleteError')
    expect(toastMessages()).not.toContain('cards.detailModal.saveError')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('delete-only failure (point 4, acceptable outcome): every create/update succeeds, only the delete fails — visible duplicate, deck fully migrated, nothing lost', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nm-row', scryfallId: 'sf-c4d', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    const existingLpCard = makeCard({
      id: 'existing-lp', scryfallId: 'sf-c4d', edition: 'Set', setCode: 'SET',
      condition: 'LP', foil: false, status: 'sale', quantity: 2,
    })
    collectionStore.cards = [nmCard, existingLpCard] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nm-row', quantity: 5, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('5')

    await setCondition('LP')

    // The merge-into-existing-row update succeeds; only the delete of the
    // now-folded NM row fails.
    mockDeleteDoc.mockRejectedValueOnce(new Error('simulated delete failure'))

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // Point 4: this is the ONE acceptable failure shape — every
    // create/update landed (existing-lp correctly merged to 7), so STEP 3
    // still ran and fully migrated the deck allocation. nm-row survives as
    // a visible duplicate (its own delete failed) instead of being lost.
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalForPrint = finalCards.filter(c => c.scryfallId === 'sf-c4d')
    expect(finalForPrint.map(c => `${c.id}:${c.condition}:${c.quantity}`).sort()).toEqual([
      'existing-lp:LP:7',
      'nm-row:NM:5',
    ])

    const deck = decksStore.decks.find(d => d.id === 'D1')
    expect(deck?.allocations).toHaveLength(1)
    expect(deck?.allocations[0]).toMatchObject({ cardId: 'existing-lp', quantity: 5, isInSideboard: false })

    expect(toastMessages()).toContain('cards.detailModal.saveIncompleteError')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('M3 regression: an old-identity row the modal never displayed at open (server-only) is MIGRATED, not deleted with its stock lost', async () => {
    // The modal's own OPEN read only ever sees nm-sale (mockGetDocs at open
    // time). nm-trade is added to collectionStore.cards AFTER open — the
    // exact TASK-280-shaped gap: a row the modal's own load never found.
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nm-sale', scryfallId: 'sf-m3', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmSale] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('5')

    // A row the modal's open never saw appears in memory before SAVE.
    const nmTrade = makeCard({
      id: 'nm-trade', scryfallId: 'sf-m3', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'trade', quantity: 2,
    })
    collectionStore.cards = [nmSale, nmTrade] as any

    await setCondition('LP')

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression: before this fix, nm-trade was folded into the delete
    // set (its quantity never in the target distribution) and its 2 units
    // vanished — no LP trade row was ever created.
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalTrade = finalCards.filter(c => c.scryfallId === 'sf-m3' && c.status === 'trade')
    expect(finalTrade).toHaveLength(1)
    expect(finalTrade[0]).toMatchObject({ condition: 'LP', quantity: 2 })
    const finalSale = finalCards.filter(c => c.scryfallId === 'sf-m3' && c.status === 'sale')
    expect(finalSale).toHaveLength(1)
    expect(finalSale[0]).toMatchObject({ condition: 'LP', quantity: 5 })

    // LOW (4th review round): assert toast + close for a clean save too, not just rows.
    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('STEP 3 (deck allocation) failure after STEP 2 fully succeeds: the card migration lands, the modal closes honestly, no retry loop', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nm-row', scryfallId: 'sf-s3', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmCard] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nm-row', quantity: 3, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 3, ownedCards: 3, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()

    await setCondition('LP')

    // STEP 2 (status diff: create LP, delete NM) succeeds entirely — the
    // "never delete after a failure" gate only applies to STEP 2's OWN
    // create/update ops, so a STEP 3 failure afterward doesn't stop STEP 2
    // from having already landed. STEP 3 (deck allocation, a deck write)
    // fails once.
    mockUpdateDoc.mockRejectedValueOnce(new Error('simulated deck write failure'))

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The card itself migrated correctly (STEP 2 unaffected by STEP 3's
    // failure) — this is NOT a lost-cards case, only the deck allocation
    // write failed. No retry: the modal closes with the honest
    // "incomplete" toast (some things — STEP 2 — did succeed) instead of
    // staying open, and there is no second SAVE click to make.
    expect(findButtonByText('common.actions.saving')).toBeFalsy()
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalRows = finalCards.filter(c => c.scryfallId === 'sf-s3')
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0]).toMatchObject({ condition: 'LP', quantity: 5 })

    expect(toastMessages()).toContain('cards.detailModal.saveIncompleteError')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('M2 regression: merging into an existing destination row preserves that row\'s OWN deck allocation instead of wiping it', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nm-row', scryfallId: 'sf-m2', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 3,
    })
    const existingLpCard = makeCard({
      id: 'existing-lp', scryfallId: 'sf-m2', edition: 'Set', setCode: 'SET',
      condition: 'LP', foil: false, status: 'sale', quantity: 2,
    })
    collectionStore.cards = [nmCard, existingLpCard] as any

    // Both rows are independently allocated to the SAME deck slot — this is
    // the exact shared-deck scenario the review flagged: NM x3 + LP x2 both
    // in the mainboard of Deck1, total 5, before any save.
    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [
        { cardId: 'nm-row', quantity: 3, isInSideboard: false, addedAt: new Date() },
        { cardId: 'existing-lp', quantity: 2, isInSideboard: false, addedAt: new Date() },
      ],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('3')

    await setCondition('LP')

    const saveButton = findButtonByText('common.actions.save')
    expect(saveButton).toBeTruthy()
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression this test locks: before the M2 fix, the modal's own
    // deckAllocations state only ever knew about the NM row's 3 (loaded at
    // open, filtered by the OLD identity) — merging into the pre-existing
    // LP row deallocated BOTH rows and reallocated only that 3, dropping
    // the LP row's own 2. The deck must end at the FULL merged total, 5.
    const deck = decksStore.decks.find(d => d.id === 'D1')
    expect(deck?.allocations).toHaveLength(1)
    expect(deck?.allocations[0]).toMatchObject({ cardId: 'existing-lp', quantity: 5, isInSideboard: false })

    // LOW (4th review round): assert toast + close, not just the deck state.
    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  // ──────────────────────────────────────────────────────────────────────
  // TASK-318 4th review round (H7/H8): computeDeckSlotOps/computeBinderSlotOps
  // aggregate ALL related rows' allocations into one total, then reallocate
  // it onto a SINGLE ownedCardId. That's wrong whenever more than one status
  // row shares an allocation — the combined total gets dumped onto whichever
  // row happens to be "owned" first, overflowing into a wishlist row for
  // whatever that row's own quantity can't hold, instead of landing on the
  // OTHER status' own destination row.
  // ──────────────────────────────────────────────────────────────────────

  it('H7 regression (deck, rev4 probe R1): NM sale x3 + NM trade x2, both allocated to the same deck, migrate to LP sale x3 + LP trade x2 — no wishlist overflow', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-h7d', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 3,
    })
    const nmTrade = makeCard({
      id: 'nmt', scryfallId: 'sf-h7d', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'trade', quantity: 2,
    })
    collectionStore.cards = [nmSale, nmTrade] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [
        { cardId: 'nms', quantity: 3, isInSideboard: false, addedAt: new Date() },
        { cardId: 'nmt', quantity: 2, isInSideboard: false, addedAt: new Date() },
      ],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    await setCondition('LP')

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const finalCards = collectionStore.cards as unknown as Card[]
    const finalRows = finalCards.filter(c => c.scryfallId === 'sf-h7d')
    // The regression this locks: before the fix, the combined total (5) was
    // reallocated onto ONE row — the sale row's own quantity (3) capped the
    // allocate call, and the leftover 2 overflowed into a NEW wishlist row
    // (visible as an extra 'wishlist' row here) instead of landing on trade.
    expect(finalRows.map(c => `${c.condition}:${c.status}:${c.quantity}`).sort()).toEqual([
      'LP:sale:3', 'LP:trade:2',
    ])

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const deckAllocs = (deck?.allocations ?? []).map(a => {
      const c = finalCards.find(fc => fc.id === a.cardId)
      return `${c?.status}:${a.quantity}`
    }).sort()
    expect(deckAllocs).toEqual(['sale:3', 'trade:2'])

    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('H7 regression (binder, rev4 probe R2): NM sale x3 + NM trade x2, both allocated to the same binder, migrate to LP sale x3 + LP trade x2', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-h7b', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 3,
    })
    const nmTrade = makeCard({
      id: 'nmt', scryfallId: 'sf-h7b', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'trade', quantity: 2,
    })
    collectionStore.cards = [nmSale, nmTrade] as any

    const bindersStore = useBindersStore()
    bindersStore.binders = [{
      id: 'B1', userId: 'test-user-id', name: 'Binder1', description: '', thumbnail: '',
      allocations: [
        { cardId: 'nms', quantity: 3, addedAt: new Date() },
        { cardId: 'nmt', quantity: 2, addedAt: new Date() },
      ],
      stats: { totalCards: 5, totalPrice: 0 },
      isPublic: false, forSale: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    await setCondition('LP')

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const finalCards = collectionStore.cards as unknown as Card[]
    const finalRows = finalCards.filter(c => c.scryfallId === 'sf-h7b')
    expect(finalRows.map(c => `${c.condition}:${c.status}:${c.quantity}`).sort()).toEqual([
      'LP:sale:3', 'LP:trade:2',
    ])

    const binder = bindersStore.binders.find(b => b.id === 'B1')
    const binderAllocs = (binder?.allocations ?? []).map(a => {
      const c = finalCards.find(fc => fc.id === a.cardId)
      return `${c?.status}:${a.quantity}`
    }).sort()
    expect(binderAllocs).toEqual(['sale:3', 'trade:2'])

    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('H7 regression (deck, rev4 probe R6): collection x2 + sale x2, both allocated to the same deck, migrate to LP collection x2 + LP sale x2 — no wishlist overflow', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCollection = makeCard({
      id: 'nmc', scryfallId: 'sf-h7r6', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'collection', quantity: 2,
    })
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-h7r6', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 2,
    })
    collectionStore.cards = [nmCollection, nmSale] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [
        { cardId: 'nmc', quantity: 2, isInSideboard: false, addedAt: new Date() },
        { cardId: 'nms', quantity: 2, isInSideboard: false, addedAt: new Date() },
      ],
      wishlist: [],
      stats: { totalCards: 4, ownedCards: 4, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCollection }, attachTo: document.body })
    await flushPromises()
    await setCondition('LP')

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const finalCards = collectionStore.cards as unknown as Card[]
    const finalRows = finalCards.filter(c => c.scryfallId === 'sf-h7r6')
    expect(finalRows.map(c => `${c.condition}:${c.status}:${c.quantity}`).sort()).toEqual([
      'LP:collection:2', 'LP:sale:2',
    ])

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const deckAllocs = (deck?.allocations ?? []).map(a => {
      const c = finalCards.find(fc => fc.id === a.cardId)
      return `${c?.status}:${a.quantity}`
    }).sort()
    expect(deckAllocs).toEqual(['collection:2', 'sale:2'])

    wrapper.unmount()
  })

  it('H8 regression (rev4 probe R12, case 5+7): reducing owned qty below what\'s allocated (STEP 1) during an identity change ends with ONLY LP rows — no old-identity leftover, deck total preserved', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nms', scryfallId: 'sf-h8', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmCard] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nms', quantity: 5, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()
    await setCondition('LP')
    // Reduce sale 5 -> 3: newOwnedQty(3) < savedTotalAllocated(5) triggers
    // STEP 1, which creates a NEW NM-identity wishlist row (for the excess
    // 2) with its own deck allocation — BEFORE this fix, that row was
    // created AFTER the identity-diff snapshot, so it was left behind as a
    // stray NM row and its allocation got double-counted into the migration.
    await clickInRow('qty-row-sale', 0, 2)

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const finalCards = collectionStore.cards as unknown as Card[]
    const finalForPrint = finalCards.filter(c => c.scryfallId === 'sf-h8')
    // No old-identity (NM) row survives, whatever its status.
    expect(finalForPrint.every(c => c.condition === 'LP')).toBe(true)
    expect(finalForPrint.map(c => `${c.status}:${c.quantity}`).sort()).toEqual(['sale:3', 'wishlist:2'])

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const totalDeckQty = (deck?.allocations ?? []).reduce((sum, a) => sum + a.quantity, 0)
    // Reference (rev4 probe R12b, no-identity-change equivalent): the deck
    // total must stay at 5 — the reduced sale row (3) plus the wishlist
    // overflow (2) it displaced, not 7 (double-counted) and not missing the
    // wishlist row's allocation entirely.
    expect(totalDeckQty).toBe(5)
    expect(deck?.allocations.every(a => {
      const c = finalCards.find(fc => fc.id === a.cardId)
      return c?.condition === 'LP'
    })).toBe(true)

    wrapper.unmount()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// TASK-318 5th review round (H9, LOW-1, LOW-3): a card + an EXISTING wishlist
// row of the same identity, reduced below what's allocated. STEP 1's own
// mechanics (ensureCollectionWishlistCard INCREMENTS that existing row) were
// invisible to distributionForDiff (H9's fix), and STEP 1 failing didn't gate
// deletes/migration the way a STEP 2 failure does (LOW-1's fix).
// ────────────────────────────────────────────────────────────────────────────
describe('CardDetailModal — TASK-318 H9/LOW-1/LOW-3 (STEP 1 + existing wishlist row)', () => {
  it('N1 regression: NO identity change, reducing owned below what\'s allocated increments an EXISTING wishlist row correctly (card quantity matches deck allocation)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-n1', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    const nmWishlist = makeCard({
      id: 'nmw', scryfallId: 'sf-n1', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'wishlist', quantity: 1,
    })
    collectionStore.cards = [nmSale, nmWishlist] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nms', quantity: 5, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()

    // sale 5 -> 3: newOwnedQty(3) < savedTotalAllocated(5) triggers STEP 1,
    // which increments the EXISTING nmw row (1 -> 1+2=3... but only 2
    // actually needs to move: 5-3=2 excess) by ensureCollectionWishlistCard.
    await clickInRow('qty-row-sale', 0, 2)

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression this locks: before the H9 fix, distributionForDiff.wishlist
    // still carried the PRE-STEP-1 snapshot (1), so STEP 2's diff wrote nmw's
    // quantity back down to 1 even though STEP 1 had already bumped it to 3
    // (1 original + 2 converted from the deck's excess) — silently discarding
    // the 2 STEP 1 had just added.
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalWishlist = finalCards.filter(c => c.scryfallId === 'sf-n1' && c.status === 'wishlist')
    expect(finalWishlist).toHaveLength(1)
    expect(finalWishlist[0]).toMatchObject({ id: 'nmw', quantity: 3 })
    const finalSale = finalCards.filter(c => c.scryfallId === 'sf-n1' && c.status === 'sale')
    expect(finalSale).toHaveLength(1)
    expect(finalSale[0]).toMatchObject({ quantity: 3 })

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const deckByCard = new Map((deck?.allocations ?? []).map(a => [a.cardId, a.quantity]))
    expect(deckByCard.get('nms')).toBe(3)
    // nmw's deck allocation is the CONVERTED portion (2, moved off nms by
    // STEP 1), not nmw's full card quantity (3) — nmw already held 1 unit of
    // free (non-deck) wishlist stock before this save, untouched by STEP 1.
    expect(deckByCard.get('nmw')).toBe(2)

    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('N1b regression: SAME as N1 but WITH an identity change (NM -> LP) — the migrated wishlist row still matches its deck allocation', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-n1b', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    const nmWishlist = makeCard({
      id: 'nmw', scryfallId: 'sf-n1b', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'wishlist', quantity: 1,
    })
    collectionStore.cards = [nmSale, nmWishlist] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nms', quantity: 5, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    await setCondition('LP')
    await clickInRow('qty-row-sale', 0, 2)

    const saveButton = findButtonByText('common.actions.save')
    saveButton!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // No old-identity (NM) row survives, and the migrated LP wishlist row's
    // own quantity correctly includes STEP 1's contribution (not just the
    // stale pre-STEP-1 snapshot).
    const finalCards = collectionStore.cards as unknown as Card[]
    const finalForPrint = finalCards.filter(c => c.scryfallId === 'sf-n1b')
    expect(finalForPrint.every(c => c.condition === 'LP')).toBe(true)
    const finalWishlist = finalForPrint.filter(c => c.status === 'wishlist')
    expect(finalWishlist).toHaveLength(1)
    expect(finalWishlist[0].quantity).toBe(3)
    const finalSale = finalForPrint.filter(c => c.status === 'sale')
    expect(finalSale).toHaveLength(1)
    expect(finalSale[0].quantity).toBe(3)

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const deckByCard = new Map((deck?.allocations ?? []).map(a => [a.cardId, a.quantity]))
    expect(deckByCard.get(finalSale[0]!.id)).toBe(3)
    // The wishlist row's deck allocation is the CONVERTED portion (2, moved
    // off the sale row by STEP 1), not its full migrated card quantity (3) —
    // it already held 1 unit of free (non-deck) wishlist stock beforehand.
    expect(deckByCard.get(finalWishlist[0]!.id)).toBe(2)
    expect(deck?.allocations.every(a => {
      const c = finalCards.find(fc => fc.id === a.cardId)
      return c?.condition === 'LP'
    })).toBe(true)

    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('N1d regression: two successive reductions across separate opens keep the wishlist row\'s quantity in sync with its deck allocation', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })

    const collectionStore = useCollectionStore()
    const nmSale = makeCard({
      id: 'nms', scryfallId: 'sf-n1d', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmSale] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nms', quantity: 5, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 5, ownedCards: 5, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    // First open: sale 5 -> 3 (no existing wishlist row yet; STEP 1 creates one).
    let wrapper = mount(CardDetailModal, { props: { show: true, card: nmSale }, attachTo: document.body })
    await flushPromises()
    await clickInRow('qty-row-sale', 0, 2)
    findButtonByText('common.actions.save')!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()
    wrapper.unmount()
    document.body.innerHTML = ''

    let finalCards = collectionStore.cards as unknown as Card[]
    const afterFirst = finalCards.find(c => c.scryfallId === 'sf-n1d' && c.status === 'sale')!
    expect(afterFirst.quantity).toBe(3)

    // Second open (fresh mount, fresh initializeForm snapshot — no in-modal
    // retry involved): sale 3 -> 2. STEP 1 fires AGAIN and increments the
    // EXISTING wishlist row created by the first save.
    wrapper = mount(CardDetailModal, { props: { show: true, card: afterFirst }, attachTo: document.body })
    await flushPromises()
    expect(qtyText('qty-row-sale')).toBe('3')
    expect(qtyText('qty-row-wishlist')).toBe('2')
    await clickInRow('qty-row-sale', 0, 1)

    findButtonByText('common.actions.save')!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    // The regression this locks: before the H9 fix, the second save's diff
    // wrote the wishlist row's quantity back down to its pre-STEP-1 value (2)
    // even though STEP 1 had already bumped it to 3 — leaving the deck
    // allocated for one more copy of the wishlist row than the card had.
    finalCards = collectionStore.cards as unknown as Card[]
    const finalSale = finalCards.find(c => c.scryfallId === 'sf-n1d' && c.status === 'sale')!
    const finalWishlist = finalCards.find(c => c.scryfallId === 'sf-n1d' && c.status === 'wishlist')!
    expect(finalSale.quantity).toBe(2)
    expect(finalWishlist.quantity).toBe(3)

    const deck = decksStore.decks.find(d => d.id === 'D1')
    const deckByCard = new Map((deck?.allocations ?? []).map(a => [a.cardId, a.quantity]))
    expect(deckByCard.get(finalSale.id)).toBe(2)
    expect(deckByCard.get(finalWishlist.id)).toBe(3)

    wrapper.unmount()
  })

  it('N9 regression (case 3, print/edition change): confirmed editable via the print selector — one row at the NEW print, deck follows', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] })
    const { searchCards } = await import('@/services/scryfall')
    ;(searchCards as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      { id: 'sf-n9-old', name: 'X', set_name: 'Set', set: 'set', prices: { usd: '1' }, image_uris: { normal: 'a' } },
      { id: 'sf-n9-new', name: 'X', set_name: 'Other Set', set: 'oth', prices: { usd: '2' }, image_uris: { normal: 'b' } },
    ])

    const collectionStore = useCollectionStore()
    const nmCard = makeCard({
      id: 'nms', scryfallId: 'sf-n9-old', edition: 'Set', setCode: 'SET',
      condition: 'NM', foil: false, status: 'sale', quantity: 5,
    })
    collectionStore.cards = [nmCard] as any

    const decksStore = useDecksStore()
    decksStore.decks = [{
      id: 'D1', userId: 'test-user-id', name: 'Deck1', format: 'standard',
      description: '', colors: [], thumbnail: '',
      allocations: [{ cardId: 'nms', quantity: 3, isInSideboard: false, addedAt: new Date() }],
      wishlist: [],
      stats: { totalCards: 3, ownedCards: 3, totalPrice: 0, avgPrice: 0, sideboardCards: 0, wishlistCards: 0, completionPercentage: 100 },
      isPublic: false, createdAt: new Date(), updatedAt: new Date(),
    }] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card: nmCard }, attachTo: document.body })
    await flushPromises()

    // LOW-3: confirmed editable in this build — the print selector renders
    // whenever a card has more than one available printing.
    const printSelect = document.querySelector('#detail-print-select') as HTMLSelectElement | null
    expect(printSelect).toBeTruthy()
    printSelect!.value = 'sf-n9-new'
    printSelect!.dispatchEvent(new Event('change'))
    await nextTick()

    findButtonByText('common.actions.save')!.click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    const finalCards = collectionStore.cards as unknown as Card[]
    const oldPrintRows = finalCards.filter(c => c.scryfallId === 'sf-n9-old')
    const newPrintRows = finalCards.filter(c => c.scryfallId === 'sf-n9-new')
    expect(oldPrintRows).toHaveLength(0)
    expect(newPrintRows).toHaveLength(1)
    expect(newPrintRows[0]).toMatchObject({ edition: 'Other Set', quantity: 5 })

    const deck = decksStore.decks.find(d => d.id === 'D1')
    expect(deck?.allocations).toHaveLength(1)
    expect(deck?.allocations[0]).toMatchObject({ cardId: newPrintRows[0]!.id, quantity: 3 })

    expect(toastMessages()).toContain('cards.detailModal.updated')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })
})
