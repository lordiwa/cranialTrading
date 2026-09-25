/**
 * TASK-281. handleSave (and its helper applyStatusOperations) ignored the
 * return value of every write operation it calls. Several of them fail by
 * returning false/null rather than throwing:
 *
 *   collectionStore.deleteCard    -> Promise<boolean>
 *   collectionStore.updateCard    -> Promise<boolean>
 *   collectionStore.addCard       -> Promise<string | null>
 *   decksStore.allocateCardToDeck -> Promise<{ allocated; wishlisted }>
 *   decksStore.deallocateCard     -> Promise<boolean>
 *   bindersStore.allocateCardToBinder -> Promise<number>
 *   bindersStore.deallocateCard   -> Promise<boolean>
 *
 * Because none of these reject, handleSave's catch never fires and the
 * flow always reached the success toast + emit('saved') + emit('close'),
 * even though nothing was actually written. This especially matters after
 * TASK-280's write timeouts: a hung write now resolves to a normal failure
 * value instead of hanging the SAVE button — and this bug turned that
 * failure into a silent, invisible false-success.
 *
 * AC1/AC2: any op returning failure must produce the ERROR toast, not the
 * success one — one test per surface named in the ticket.
 * AC3: on a failed save, isLoading must still return to false (SAVE button
 * re-enabled) even though — TASK-318, 3rd review round, Mato's decision
 * ("nunca borrar despues de un fallo") — the modal now ALWAYS closes on any
 * failure, with no in-modal retry: emit('close') is expected TRUE on every
 * failure path below, the opposite of this ticket's original AC3 ("must
 * NOT close"). See CardDetailModal.saveIdentity.test.ts for the H3-H6
 * tests covering WHY (never deleting after a failed create/update).
 * AC5: a partial failure (some ops wrote before another failed) must show
 * a distinct "incomplete" message (saveIncompleteError, not the original
 * savePartialError — TASK-318 3rd round: that wording invited a retry that
 * no longer exists), not the generic error.
 *
 * Mirrors the mount/mock scaffolding of CardDetailModal.saveIdentity.test.ts
 * (TASK-280) but overrides individual store action functions directly
 * (assignable on a Pinia store instance, same pattern already used there
 * for collectionStore.cards / getCardById) instead of driving every
 * surface through full Firestore mocks — the ticket asks for coverage per
 * surface, not a Firestore integration test per surface.
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
import CardDetailModal from '@/components/collection/CardDetailModal.vue'
import { useCollectionStore } from '@/stores/collection'
import { useDecksStore } from '@/stores/decks'
import { useBindersStore } from '@/stores/binders'
import { useToastStore } from '@/stores/toast'
import { makeCard } from '../helpers/fixtures'

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined
}

function panelButtons(headingKey: string): HTMLButtonElement[] {
  const heading = Array.from(document.querySelectorAll('p')).find(p => p.textContent === headingKey)
  const panel = heading!.closest('div.bg-surface-1')!
  return Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[]
}

async function clickQty(testId: string, buttonIndex: number, times: number) {
  const { nextTick } = await import('vue')
  for (let i = 0; i < times; i++) {
    const btn = document.querySelectorAll(`[data-testid="${testId}"] button`)[buttonIndex] as HTMLButtonElement
    btn.click()
    await nextTick()
  }
}

async function save() {
  const saveButton = findButtonByText('common.actions.save')
  saveButton!.click()
  await flushPromises()
}

function seedDeck(store: ReturnType<typeof useDecksStore>, allocations: Array<{ cardId: string; quantity: number; isInSideboard: boolean }>) {
  store.decks.push({
    id: 'deck-1', userId: 'test-user-id', name: 'Test Deck', format: 'modern', description: '',
    colors: [], commander: '', allocations: allocations.map(a => ({ ...a, addedAt: new Date() })),
    wishlist: [], thumbnail: '', createdAt: new Date(), updatedAt: new Date(), isPublic: false,
    stats: { totalCards: 0, sideboardCards: 0, ownedCards: 0, wishlistCards: 0, avgPrice: 0, totalPrice: 0, completionPercentage: 100 },
  } as any)
}

function seedBinder(store: ReturnType<typeof useBindersStore>, allocations: Array<{ cardId: string; quantity: number }>) {
  store.binders.push({
    id: 'binder-1', userId: 'test-user-id', name: 'Test Binder', description: '',
    allocations: allocations.map(a => ({ ...a, addedAt: new Date() })), thumbnail: '',
    createdAt: new Date(), updatedAt: new Date(), stats: { totalCards: 0, totalPrice: 0 },
    isPublic: true, forSale: false,
  } as any)
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

describe('CardDetailModal.handleSave — TASK-281 must not show success when a write failed', () => {
  it('baseline: an all-success save still shows the success toast and closes (regression guard)', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()

    await clickQty('qty-row-collection', 1, 1) // 4 -> 5, triggers an update op
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(true)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(false)
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC1/AC2 surface updateCard: a false result shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    collectionStore.updateCard = vi.fn().mockResolvedValue(false)

    await clickQty('qty-row-collection', 1, 1) // 4 -> 5, triggers an update op
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    expect(wrapper.emitted('saved')).toBeFalsy()
    // TASK-318 3rd round: the modal now closes on ANY failure (no in-modal
    // retry) — 'saved' still never fires (nothing to report success on),
    // but 'close' now does.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC1/AC2 surface deleteCard: a false result shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    collectionStore.deleteCard = vi.fn().mockResolvedValue(false)

    // collection 4 -> 0 (delete op) + sale 0 -> 2 (create op, kept > 0 total
    // so canSave stays true and handleSave doesn't bail out early on the
    // "at least 1 copy" guard before ever calling deleteCard).
    await clickQty('qty-row-collection', 0, 4)
    await clickQty('qty-row-sale', 1, 2)
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: create succeeded, only the delete failed —
    // point 4's "acceptable" outcome (visible duplicate, no loss). The
    // modal closes with the honest incomplete-save toast, no retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC1/AC2 surface addCard: a null result shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    collectionStore.addCard = vi.fn().mockResolvedValue(null)

    // collection 4 -> 2, sale 0 -> 2: sale row has no existing doc -> create op
    await clickQty('qty-row-collection', 0, 2)
    await clickQty('qty-row-sale', 1, 2)
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: the failed create means no delete anywhere runs
    // (never delete after a failure) and the modal closes with the honest
    // incomplete-save toast, no retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC2 surface allocateCardToDeck: {allocated:0, wishlisted:0} shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const decksStore = useDecksStore()
    seedDeck(decksStore, [])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    decksStore.allocateCardToDeck = vi.fn().mockResolvedValue({ allocated: 0, wishlisted: 0 })

    const buttons = panelButtons('cards.detailModal.assignToDecks')
    buttons[1]!.click() // MB plus: 0 -> 1
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: the modal now closes on ANY failure, including a
    // STEP 3 (deck allocation) failure — no in-modal retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC2 surface decksStore.deallocateCard: false shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const decksStore = useDecksStore()
    seedDeck(decksStore, [{ cardId: 'card-1', quantity: 2, isInSideboard: false }])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    decksStore.deallocateCard = vi.fn().mockResolvedValue(false)

    const buttons = panelButtons('cards.detailModal.assignToDecks')
    buttons[0]!.click() // MB minus: 2 -> 1
    buttons[0]!.click() // MB minus: 1 -> 0, triggers deallocate op
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: the modal now closes on ANY failure — no in-modal retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC2 surface allocateCardToBinder: a real write failure ({allocated:0, failed:true}) shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const bindersStore = useBindersStore()
    seedBinder(bindersStore, [])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    bindersStore.allocateCardToBinder = vi.fn().mockResolvedValue({ allocated: 0, failed: true })

    const buttons = panelButtons('cards.detailModal.assignToBinders')
    buttons[1]!.click() // plus: 0 -> 1
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: the modal now closes on ANY failure — no in-modal retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('HIGH-1 regression: allocateCardToBinder hitting the availability cap ({allocated:0, failed:false}) is NOT a save failure — no error toast, modal still closes', async () => {
    // Reviewer finding on the first cut of this ticket: a bare 0 from
    // allocateCardToBinder is ambiguous between a real write failure and
    // the BY-DESIGN availability cap (binders.ts: `if (toAllocate <= 0)
    // return ...`). The binder "+" button has no upper bound in the UI, so
    // a user can genuinely ask for more than is available — that must not
    // produce an error toast the user can never clear by retrying (the
    // target/original slots would stay stuck at the same over-cap values
    // forever, since nothing about them changes on retry).
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const bindersStore = useBindersStore()
    seedBinder(bindersStore, [])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    bindersStore.allocateCardToBinder = vi.fn().mockResolvedValue({ allocated: 0, failed: false })

    const buttons = panelButtons('cards.detailModal.assignToBinders')
    buttons[1]!.click() // plus: 0 -> 1
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(true)
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC2 surface bindersStore.deallocateCard: false shows the error toast, not success', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const bindersStore = useBindersStore()
    seedBinder(bindersStore, [{ cardId: 'card-1', quantity: 1 }])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    bindersStore.deallocateCard = vi.fn().mockResolvedValue(false)

    const buttons = panelButtons('cards.detailModal.assignToBinders')
    buttons[0]!.click() // minus: 1 -> 0, triggers deallocate op
    await save()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    // TASK-318 3rd round: the modal now closes on ANY failure — no in-modal retry.
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC3: a failed save leaves isLoading false (SAVE button re-enabled, not stuck on GUARDANDO)', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    collectionStore.updateCard = vi.fn().mockResolvedValue(false)

    await clickQty('qty-row-collection', 1, 1)
    await save()

    expect(findButtonByText('common.actions.saving')).toBeFalsy()
    expect(findButtonByText('common.actions.save')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC5: a partial failure (one op succeeded, another failed) shows the incomplete-save message, not the generic error', async () => {
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()

    // collection 4 -> 2 (update, succeeds), sale 0 -> 2 (create, fails)
    collectionStore.addCard = vi.fn().mockResolvedValue(null)
    await clickQty('qty-row-collection', 0, 2)
    await clickQty('qty-row-sale', 1, 2)
    await save()

    const toastStore = useToastStore()
    const errorToast = toastStore.toasts.find(t => t.type === 'error')
    expect(errorToast).toBeTruthy()
    // TASK-318 3rd round: savePartialError's old wording ("please check and
    // try again") invited an in-modal retry that no longer exists —
    // replaced by saveIncompleteError.
    expect(errorToast!.message).toBe('cards.detailModal.saveIncompleteError')
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('AC5: a total failure with NO STEP 2 write involved (a pure STEP 3 deck-allocation failure) shows the generic save-error message, not the partial one', async () => {
    // TASK-318 M-T (4th round): the original version of this test drove the
    // failure through updateCard (a STEP 2 create/update) — but that write
    // is wrapped in CARD_WRITE_TIMEOUT_MS and can land LATE, so it now
    // always shows saveIncompleteError (see the new test right below), never
    // this plain saveError. To keep real coverage of the "genuinely nothing
    // succeeded" saveError path, this drives the ONLY failure through STEP 3
    // (deck allocation) instead, with no status/quantity change at all, so
    // no STEP 2 op runs and nonDestructiveFailed stays false.
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const decksStore = useDecksStore()
    seedDeck(decksStore, [])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    decksStore.allocateCardToDeck = vi.fn().mockResolvedValue({ allocated: 0, wishlisted: 0 })

    const buttons = panelButtons('cards.detailModal.assignToDecks')
    buttons[1]!.click() // MB plus: 0 -> 1 (STEP 3 only, no STEP 2 op)
    await save()

    const toastStore = useToastStore()
    const errorToast = toastStore.toasts.find(t => t.type === 'error')
    expect(errorToast).toBeTruthy()
    expect(errorToast!.message).toBe('cards.detailModal.saveError')

    wrapper.unmount()
  })

  it('M-T regression: a STEP 2 update failure shows saveIncompleteError, not saveError, even when NOTHING else succeeded', async () => {
    // The write addCard/updateCard wrap in CARD_WRITE_TIMEOUT_MS can still
    // land after this call resolves false — "nothing was saved" (saveError)
    // would be a claim we cannot actually back up in that case, so a STEP 2
    // create/update failure always gets the softer "may not have been
    // saved" wording, regardless of anySucceeded.
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    collectionStore.updateCard = vi.fn().mockResolvedValue(false)

    await clickQty('qty-row-collection', 1, 1)
    await save()

    const toastStore = useToastStore()
    const errorToast = toastStore.toasts.find(t => t.type === 'error')
    expect(errorToast).toBeTruthy()
    expect(errorToast!.message).toBe('cards.detailModal.saveIncompleteError')

    wrapper.unmount()
  })

  it('MEDIUM-2 (AC4): reduceAllocationsForCard returning false (STEP 1) shows the error toast, not success, and the modal closes (TASK-318 3rd round: no in-modal retry)', async () => {
    // AC4 implemented reduceAllocationsForCard: Promise<boolean> but nothing
    // exercised handleSave's STEP 1 branch actually consuming that boolean —
    // reviewer finding. STEP 1 only runs when owned qty drops below what's
    // already allocated to a deck, so seed a deck allocation for this card
    // first, then reduce collection below it.
    const card = makeCard({ id: 'card-1', status: 'collection', quantity: 4 })
    const collectionStore = useCollectionStore()
    collectionStore.cards = [card] as any
    const decksStore = useDecksStore()
    seedDeck(decksStore, [{ cardId: 'card-1', quantity: 3, isInSideboard: false }])

    const wrapper = mount(CardDetailModal, { props: { show: true, card }, attachTo: document.body })
    await flushPromises()
    decksStore.reduceAllocationsForCard = vi.fn().mockResolvedValue(false)

    // collection 4 -> 2: newOwnedQty(2) < totalAllocated(3) triggers STEP 1.
    await clickQty('qty-row-collection', 0, 2)
    await save()

    expect(decksStore.reduceAllocationsForCard).toHaveBeenCalled()
    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'success')).toBe(false)
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })
})
