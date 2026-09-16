/**
 * TASK-298 — el carrito NUNCA debe cobrar un precio que el vendedor no publicó.
 *
 * Regresión cruzada exchangeCart (addItem + upgrade CK en background) ->
 * buyRequests (submitBuyRequest). La aserción va sobre el DOCUMENTO
 * PERSISTIDO (el payload que recibe setDoc, mockeado — TASK-291 cambió el
 * alta de addDoc a setDoc sobre un id determinista) — nunca sobre la
 * pantalla, y nunca contra Firebase real.
 *
 * Revierte la premisa de TASK-119 ("el carrito es efímero y el monto es
 * indicativo"): desde SCRUM-70 el carrito persiste un BuyRequest real sobre
 * el que el vendedor actúa (fulfillRequest descuenta inventario de la
 * colección), así que el precio de la transacción tiene que ser SIEMPRE el
 * que el vendedor publicó. Ver docs/DECISIONES-DE-PRODUCTO.md (AC0).
 */
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { useExchangeCartStore } from '@/stores/exchangeCart'
import { useBuyRequestsStore } from '@/stores/buyRequests'
import { getCardPrices } from '@/services/mtgjson'
import type { ExchangeCartItem } from '@/types/exchangeCart'

vi.mock('@/services/mtgjson', () => ({
  getCardPrices: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  // TASK-291 AC3: submitBuyRequest now targets a deterministic doc id via
  // setDoc, not addDoc — see stores/buyRequests.ts.
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(() => ({})),
}))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null }) }))

import { setDoc } from 'firebase/firestore'

const mockGetCardPrices = vi.mocked(getCardPrices)
const mockSetDoc = vi.mocked(setDoc)

// Flush the fire-and-forget CK lookup promise chain (addItem does not await it).
async function flushCKLookup() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function makeItem(overrides: Partial<ExchangeCartItem> = {}): ExchangeCartItem {
  return {
    scryfallId: 'scry-serra',
    cardId: 'card-serra',
    name: 'Serra Angel',
    edition: 'M21',
    quantity: 1,
    maxQuantity: 4,
    condition: 'NM',
    foil: false,
    price: 4.5,
    image: '',
    status: 'sale',
    ...overrides,
  }
}

let mockStorage: Record<string, string> = {}

beforeEach(() => {
  mockStorage = {}
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
    clear: vi.fn(() => { mockStorage = {} }),
    length: 0,
    key: vi.fn(() => null),
  })
  setActivePinia(createPinia())
  mockGetCardPrices.mockReset()
  mockSetDoc.mockReset()
  mockSetDoc.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TASK-298 — el precio de la transacción persistida es el del vendedor, nunca el de CK', () => {
  it('AC3/AC5: agrega una carta cuyo precio de vendedor difiere del de CK y el BuyRequest persistido lleva items[].price y totalValue del VENDEDOR', async () => {
    // Medido en WG-008: el vendedor publicó Serra Angel a $4.50; CK dice $0.35.
    mockGetCardPrices.mockResolvedValue({
      cardKingdom: { retail: 0.35, retailFoil: null, buylist: null, buylistFoil: null },
    })

    const cartStore = useExchangeCartStore()
    cartStore.addItem('vendedor', makeItem({ price: 4.5 }))
    await flushCKLookup() // deja que el upgrade CK resuelva ANTES de enviar el pedido

    const cart = cartStore.getCart('vendedor')
    expect(cart!.items[0].price).toBe(4.5) // AC2: nunca 0.35

    const buyRequestsStore = useBuyRequestsStore()
    const res = await buyRequestsStore.submitBuyRequest(
      'owner-uid',
      { name: 'Comprador', phone: '099123', email: 'a@b.com' },
      cart!.items,
      cart!.createdAt,
    )
    expect(res.ok).toBe(true)

    const payload = mockSetDoc.mock.calls[0][1] as { items: ExchangeCartItem[]; totalValue: number }
    expect(payload.items[0].price).toBe(4.5) // documento persistido, no la pantalla
    expect(payload.totalValue).toBe(4.5)
  })

  it('caso numérico del ticket: 1x Serra Angel $4.50 + 1x Elspeth $29.99 persiste totalValue $34.49', async () => {
    // Medido en WG-008: ambos pedidos reales en producción persistieron
    // Serra Angel $0.35 + Elspeth $57.99 = totalValue $58.34, contra un pedido
    // que con los precios reales del vendedor vale $34.49.
    mockGetCardPrices.mockImplementation(async (scryfallId: string) => {
      if (scryfallId === 'scry-serra') {
        return { cardKingdom: { retail: 0.35, retailFoil: null, buylist: null, buylistFoil: null } }
      }
      if (scryfallId === 'scry-elspeth') {
        return { cardKingdom: { retail: 57.99, retailFoil: null, buylist: null, buylistFoil: null } }
      }
      return null
    })

    const cartStore = useExchangeCartStore()
    cartStore.addItem('vendedor', makeItem({
      scryfallId: 'scry-serra', cardId: 'card-serra', name: 'Serra Angel', price: 4.5,
    }))
    cartStore.addItem('vendedor', makeItem({
      scryfallId: 'scry-elspeth', cardId: 'card-elspeth', name: 'Elspeth, Storm Slayer', price: 29.99,
    }))
    await flushCKLookup()

    const cart = cartStore.getCart('vendedor')
    const buyRequestsStore = useBuyRequestsStore()
    await buyRequestsStore.submitBuyRequest(
      'owner-uid',
      { name: 'Comprador', phone: '099123', email: 'a@b.com' },
      cart!.items,
      cart!.createdAt,
    )

    const payload = mockSetDoc.mock.calls[0][1] as { items: ExchangeCartItem[]; totalValue: number }
    expect(payload.items.map(i => i.price)).toEqual([4.5, 29.99])
    // toBeCloseTo: 4.5 + 29.99 en IEEE-754 double da 34.489999999999995, no
    // 34.49 exacto — precisión de punto flotante de JS, no del cálculo (mismo
    // reduce sin redondeo que computeTotalValue ya usa en producción).
    expect(payload.totalValue).toBeCloseTo(34.49, 2)
  })
})
