/**
 * TASK-306 — hallazgo WG4-O3A-02 del wargaming adversarial corrida #4
 * (2026-09-19). Medido en vivo contra dev: el vendedor publicó "Angel of
 * the Ruins" a $2.40; se sembró un carrito con price: 0.01 para esa misma
 * carta y se envió el pedido por la interfaz normal — el documento
 * persistido quedó con items[0].price = 0.01 y totalValue = 0.01 (AC1,
 * control negativo ya medido, no se repite el ataque en vivo, solo se
 * reproduce el escenario contra el store).
 *
 * submitBuyRequest debía re-resolver el precio contra `public_cards`
 * (fuente publicada del vendedor) en el momento del envío, y nunca confiar
 * en el `price` que llega desde el carrito del comprador.
 */
import { createPinia, setActivePinia } from 'pinia'

// vi.hoisted: el lookup de "lo publicado" tiene que ser visible tanto para
// el factory de vi.mock (que corre hoisted, antes de cualquier `let`/`const`
// de este archivo) como para el cuerpo de los tests, que lo siembran.
const { setPublishedPrice, resetPublishedPrices, mockDoc, mockGetDoc } = vi.hoisted(() => {
  const publishedPrices: Record<string, { price: number; status: string } | undefined> = {}
  return {
    setPublishedPrice: (docPath: string, price: number, status = 'sale') => {
      publishedPrices[docPath] = { price, status }
    },
    resetPublishedPrices: () => {
      for (const key of Object.keys(publishedPrices)) delete publishedPrices[key]
    },
    mockDoc: (...args: unknown[]) => ({ path: args.slice(1).join('/') }),
    mockGetDoc: async (ref: { path: string }) => {
      const published = publishedPrices[ref.path]
      return { exists: () => !!published, data: () => published ?? {} }
    },
  }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(mockGetDoc),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(mockDoc),
}))

vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }))

import { setDoc } from 'firebase/firestore'
import { useBuyRequestsStore } from '@/stores/buyRequests'
import type { ExchangeCartItem } from '@/types/exchangeCart'

const mockSetDoc = vi.mocked(setDoc)

const cartItem = (over: Partial<ExchangeCartItem> = {}): ExchangeCartItem => ({
  scryfallId: 'scry-angel-of-the-ruins',
  cardId: 'card-angel',
  name: 'Angel of the Ruins',
  edition: 'BRO',
  quantity: 1,
  maxQuantity: 4,
  condition: 'NM',
  foil: false,
  price: 4,
  image: '',
  status: 'sale',
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockSetDoc.mockResolvedValue(undefined)
  resetPublishedPrices()
})

describe('TASK-306 (WG4-O3A-02) — el precio persistido es el del vendedor, nunca el que trae el carrito del comprador', () => {
  it('AC2/AC3/AC6/AC7: carrito manipulado a $0.01 contra un publicado de $2.40 persiste $2.40, no $0.01 — previene que el comprador fije el precio de su propio pedido', async () => {
    setPublishedPrice('public_cards/seller-uid_card-angel', 2.4)

    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'seller-uid',
      { name: 'Visitante', phone: '099000111', email: 'buyer@example.com' },
      [cartItem({ price: 0.01, quantity: 1 })],
      1700000000000,
    )

    expect(res.ok).toBe(true)
    const payload = mockSetDoc.mock.calls[0][1] as { items: ExchangeCartItem[]; totalValue: number }
    expect(payload.items[0].price).toBe(2.4)
    expect(payload.totalValue).toBe(2.4)
  })

  it('AC5: una carta ya no publicada (removida o vendida) rechaza el pedido ENTERO en vez de persistir un precio inventado para esa linea', async () => {
    // Nunca se llama setPublishedPrice: getDoc responde exists()=false para
    // 'card-angel', igual que un doc de public_cards que ya no existe.
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'seller-uid',
      { name: 'Visitante', phone: '099000111', email: 'buyer@example.com' },
      [cartItem({ price: 4, quantity: 1 })],
      1700000000001,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toBe('unavailable-items')
    expect(res.unavailable).toEqual([{ cardId: 'card-angel', name: 'Angel of the Ruins' }])
    expect(mockSetDoc).not.toHaveBeenCalled() // ningun alta parcial ni con precio inventado
  })
})
