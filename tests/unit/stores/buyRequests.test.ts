/**
 * SCRUM-70 — buyRequests store: submit, fulfill (descontar de colección), delete.
 * Firebase y collection store completamente mockeados.
 */
import { createPinia, setActivePinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn().mockResolvedValue({ id: 'req-1' }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(() => ({})),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
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

import { addDoc, updateDoc } from 'firebase/firestore'
import { useBuyRequestsStore } from '@/stores/buyRequests'

const item = (over: Partial<any> = {}) => ({
  scryfallId: 's', cardId: 'c1', name: 'N', edition: '', quantity: 1,
  maxQuantity: 9, condition: 'NM', foil: false, price: 2, image: '', status: 'sale',
  ...over,
})

describe('useBuyRequestsStore — submitBuyRequest (SCRUM-70.1)', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); (addDoc as any).mockResolvedValue({ id: 'req-1' }) })

  it('escribe un doc con status pending, totalValue y contacto', async () => {
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'owner-id',
      { name: 'Rafa', phone: '099123', email: 'a@b.com' },
      [item({ price: 2, quantity: 3 })],
    )
    expect(res.ok).toBe(true)
    const payload = (addDoc as any).mock.calls[0][1]
    expect(payload.status).toBe('pending')
    expect(payload.totalValue).toBe(6)
    expect(payload.buyerName).toBe('Rafa')
    expect(payload.buyerPhone).toBe('099123')
    expect(payload.buyerEmail).toBe('a@b.com')
  })

  it('usa "Guest" cuando el nombre viene vacío y rechaza carrito vacío', async () => {
    const store = useBuyRequestsStore()
    expect((await store.submitBuyRequest('owner-id', { name: '   ', phone: '1', email: 'a@b.com' }, [item()])).ok).toBe(true)
    expect((addDoc as any).mock.calls[0][1].buyerName).toBe('Guest')
    expect((await store.submitBuyRequest('owner-id', { name: 'x', phone: '1', email: 'a@b.com' }, [])).ok).toBe(false)
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
