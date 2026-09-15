/**
 * SCRUM-70 — buyRequests store: submit, fulfill (descontar de colección), delete.
 * Firebase y collection store completamente mockeados.
 */
import { createPinia, setActivePinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  // TASK-291 AC3: submitBuyRequest now targets doc(db, ..., id) with a
  // deterministic id (setDoc), not addDoc. Echo the path segments (incl. the
  // id) so tests can assert on the id without needing a real Firestore ref.
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'owner-id' } }),
}))

const deleteCard = vi.fn().mockResolvedValue(true)
const updateCard = vi.fn().mockResolvedValue(true)
const cards: Record<string, any> = {
  c1: { id: 'c1', quantity: 1 },
  c2: { id: 'c2', quantity: 10 },
}
vi.mock('@/stores/collection', () => ({
  useCollectionStore: () => ({
    getCardById: (id: string) => cards[id],
    deleteCard,
    updateCard,
  }),
}))

import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { useBuyRequestsStore } from '@/stores/buyRequests'

const item = (over: Partial<any> = {}) => ({
  scryfallId: 's', cardId: 'c1', name: 'N', edition: '', quantity: 1,
  maxQuantity: 9, condition: 'NM', foil: false, price: 2, image: '', status: 'sale',
  ...over,
})

describe('useBuyRequestsStore — submitBuyRequest (SCRUM-70.1)', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); (setDoc as any).mockResolvedValue(undefined) })

  it('escribe un doc con status pending, totalValue y contacto', async () => {
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'owner-id',
      { name: 'Rafa', phone: '099123', email: 'a@b.com' },
      [item({ price: 2, quantity: 3 })],
      1000,
    )
    expect(res.ok).toBe(true)
    const payload = (setDoc as any).mock.calls[0][1]
    expect(payload.status).toBe('pending')
    expect(payload.totalValue).toBe(6)
    expect(payload.buyerName).toBe('Rafa')
    expect(payload.buyerPhone).toBe('099123')
    expect(payload.buyerEmail).toBe('a@b.com')
  })

  it('usa "Guest" cuando el nombre viene vacío y rechaza carrito vacío', async () => {
    const store = useBuyRequestsStore()
    expect((await store.submitBuyRequest('owner-id', { name: '   ', phone: '1', email: 'a@b.com' }, [item()], 1000)).ok).toBe(true)
    expect((setDoc as any).mock.calls[0][1].buyerName).toBe('Guest')
    expect((await store.submitBuyRequest('owner-id', { name: 'x', phone: '1', email: 'a@b.com' }, [], 1000)).ok).toBe(false)
  })

  it('AC3: dos envios del MISMO carrito (mismo contacto+items+createdAt) escriben en el MISMO doc id', async () => {
    const store = useBuyRequestsStore()
    const contact = { name: 'Rafa', phone: '099123', email: 'a@b.com' }
    const items = [item({ price: 2, quantity: 3 })]

    await store.submitBuyRequest('owner-id', contact, items, 555)
    await store.submitBuyRequest('owner-id', contact, items, 555)

    expect(setDoc).toHaveBeenCalledTimes(2)
    const [ref1] = (setDoc as any).mock.calls[0]
    const [ref2] = (setDoc as any).mock.calls[1]
    expect(ref1.path).toBe(ref2.path)
    expect(doc).toHaveBeenCalledTimes(2)
  })

  it('AC3: un carrito con distinto createdAt (una sesion de carrito distinta) produce un id distinto', async () => {
    const store = useBuyRequestsStore()
    const contact = { name: 'Rafa', phone: '099123', email: 'a@b.com' }
    const items = [item({ price: 2, quantity: 3 })]

    await store.submitBuyRequest('owner-id', contact, items, 111)
    await store.submitBuyRequest('owner-id', contact, items, 222)

    const [ref1] = (setDoc as any).mock.calls[0]
    const [ref2] = (setDoc as any).mock.calls[1]
    expect(ref1.path).not.toBe(ref2.path)
  })
})

describe('useBuyRequestsStore — fulfillRequest (SCRUM-70.3)', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('descuenta de la colección (delete/update) y marca fulfilled', async () => {
    const store = useBuyRequestsStore()
    store.buyRequests.push({
      id: 'req-1', buyerName: 'Rafa', totalValue: 0, status: 'pending', createdAt: new Date(),
      items: [item({ cardId: 'c1', quantity: 1 }), item({ cardId: 'c2', quantity: 3 }), item({ cardId: 'gone', quantity: 1 })],
    })

    const res = await store.fulfillRequest('req-1')

    expect(res.ok).toBe(true)
    expect(deleteCard).toHaveBeenCalledWith('c1')           // c1: 1-1=0 → delete
    expect(updateCard).toHaveBeenCalledWith('c2', { quantity: 7 }) // c2: 10-3=7 → update
    expect(res.missing).toEqual(['gone'])                   // carta inexistente → fallback
    expect(updateDoc).toHaveBeenCalled()                    // marca status fulfilled
    expect(store.buyRequests[0].status).toBe('fulfilled')
  })
})
