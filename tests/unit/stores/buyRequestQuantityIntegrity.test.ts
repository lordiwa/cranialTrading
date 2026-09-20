/**
 * TASK-307/316 review M-1: buyRequestPriceIntegrity.test.ts:24 dice "la
 * cantidad se cubre en buyRequestQuantityIntegrity.test.ts" — ese archivo no
 * existía (cita falsa, verificado con `ls`). Este archivo la hace real, y
 * cubre a nivel de STORE el mismo hallazgo R-2 que
 * tests/unit/utils/buyRequest.test.ts ya prueba a nivel de función pura
 * (planFulfillment): un carrito enviado por el flujo normal
 * (submitBuyRequest) con una cantidad negativa o NaN nunca debe llegar a
 * persistirse en el documento del pedido.
 */
import { createPinia, setActivePinia } from 'pinia'

// vi.hoisted: el lookup de "lo publicado" tiene que ser visible tanto para
// el factory de vi.mock (que corre hoisted, antes de cualquier `let`/`const`
// de este archivo) como para el cuerpo de los tests, que lo siembran.
const { setPublishedPrice, resetPublishedPrices, mockDoc, mockGetDoc } = vi.hoisted(() => {
  const publishedPrices: Record<string, { price: number; status: string; quantity: number } | undefined> = {}
  return {
    setPublishedPrice: (docPath: string, price: number, status = 'sale', quantity = 99) => {
      publishedPrices[docPath] = { price, status, quantity }
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
  setPublishedPrice('public_cards/seller-uid_card-angel', 2.4)
})

describe('TASK-307/316 review R-2 — la cantidad del carrito nunca se persiste sin piso', () => {
  it('una cantidad negativa (-3) se rechaza como unavailable-items y nunca se persiste — previene que un pedido enviado por el flujo normal infle o corrompa el stock del vendedor con una cantidad negativa', async () => {
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'seller-uid',
      { name: 'Visitante', phone: '099000111', email: 'buyer@example.com' },
      [cartItem({ quantity: -3 })],
      1700000000000,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toBe('unavailable-items')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('una cantidad NaN se rechaza como unavailable-items y nunca se persiste — previene que un documento de carta termine con una cantidad no numérica', async () => {
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'seller-uid',
      { name: 'Visitante', phone: '099000111', email: 'buyer@example.com' },
      [cartItem({ quantity: NaN })],
      1700000000001,
    )

    expect(res.ok).toBe(false)
    expect(res.error).toBe('unavailable-items')
    expect(mockSetDoc).not.toHaveBeenCalled()
  })
})
