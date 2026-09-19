/**
 * SCRUM-70 / TASK-307 / TASK-316 — buyRequests store: submit, fulfill
 * (descontar de colección), delete. Firebase completamente mockeado con un
 * simulador minimo de Firestore (docStore + version por path) que respalda
 * getDoc/setDoc/updateDoc/deleteDoc Y runTransaction — runTransaction relee
 * cada doc dentro de la funcion y reintenta la funcion ENTERA si algun doc
 * leido cambio de version antes de comitear, igual que la garantia real de
 * Firestore que TASK-316 AC2/AC6 necesita ejercitar.
 */
import { createPinia, setActivePinia } from 'pinia'

const {
  seedDoc,
  resetDocStore,
  setPublishedPrice,
  mockDoc,
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockRunTransaction,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown> | undefined>()
  const versions = new Map<string, number>()

  const bump = (path: string) => versions.set(path, (versions.get(path) ?? 0) + 1)

  const seedDoc = (path: string, data: Record<string, unknown>) => {
    store.set(path, data)
    bump(path)
  }

  const resetDocStore = () => {
    store.clear()
    versions.clear()
  }

  // TASK-306/307: lo que public_cards tiene HOY para una carta — quantity
  // default 99 (stock de sobra) para no interferir con los tests que no
  // ejercitan la validacion de cantidad al enviar.
  const setPublishedPrice = (docPath: string, price: number, status = 'sale', quantity = 99) => {
    seedDoc(docPath, { price, status, quantity })
  }

  const mockDoc = (...args: unknown[]) => ({ path: args.slice(1).join('/') })

  const mockGetDoc = async (ref: { path: string }) => {
    const data = store.get(ref.path)
    return { exists: () => data !== undefined, data: () => data ?? {} }
  }

  const mockSetDoc = async (ref: { path: string }, data: Record<string, unknown>) => {
    store.set(ref.path, data)
    bump(ref.path)
  }

  const mockUpdateDoc = async (ref: { path: string }, patch: Record<string, unknown>) => {
    const cur = store.get(ref.path) ?? {}
    store.set(ref.path, { ...cur, ...patch })
    bump(ref.path)
  }

  const mockDeleteDoc = async (ref: { path: string }) => {
    store.delete(ref.path)
    bump(ref.path)
  }

  // TASK-316 AC2/AC6/AC7: simulador de runTransaction fiel a la garantia
  // real que importa aca — optimistic concurrency. Si CUALQUIER doc leido
  // por la funcion cambio de version entre la lectura y el intento de
  // commit, la funcion ENTERA se reintenta con una lectura nueva, y ningun
  // write parcial de un intento fallido llega al store.
  const mockRunTransaction = async (_db: unknown, updateFn: (tx: unknown) => Promise<unknown>) => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const readVersions = new Map<string, number>()
      const pendingWrites: { type: 'update' | 'delete'; path: string; data?: Record<string, unknown> }[] = []
      const tx = {
        get: async (ref: { path: string }) => {
          readVersions.set(ref.path, versions.get(ref.path) ?? 0)
          const data = store.get(ref.path)
          return { exists: () => data !== undefined, data: () => data ?? {} }
        },
        update: (ref: { path: string }, patch: Record<string, unknown>) => {
          pendingWrites.push({ type: 'update', path: ref.path, data: patch })
        },
        delete: (ref: { path: string }) => {
          pendingWrites.push({ type: 'delete', path: ref.path })
        },
      }

      const result = await updateFn(tx)

      let conflict = false
      for (const [path, v] of readVersions) {
        if ((versions.get(path) ?? 0) !== v) { conflict = true; break }
      }
      if (conflict) continue

      for (const w of pendingWrites) {
        if (w.type === 'delete') {
          store.delete(w.path)
        } else {
          const cur = store.get(w.path) ?? {}
          store.set(w.path, { ...cur, ...w.data })
        }
        bump(w.path)
      }
      return result
    }
    throw new Error('mockRunTransaction: too many retries — possible livelock in the test setup')
  }

  return {
    seedDoc,
    resetDocStore,
    setPublishedPrice,
    mockDoc,
    mockGetDoc,
    mockSetDoc,
    mockUpdateDoc,
    mockDeleteDoc,
    mockRunTransaction,
  }
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  getDoc: vi.fn(mockGetDoc),
  setDoc: vi.fn(mockSetDoc),
  deleteDoc: vi.fn(mockDeleteDoc),
  updateDoc: vi.fn(mockUpdateDoc),
  doc: vi.fn(mockDoc),
  runTransaction: vi.fn(mockRunTransaction),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'owner-id' } }),
}))

import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { useBuyRequestsStore } from '@/stores/buyRequests'
import type { BuyRequest } from '@/types/buyRequest'

const item = (over: Partial<any> = {}) => ({
  scryfallId: 's', cardId: 'c1', name: 'N', edition: '', quantity: 1,
  maxQuantity: 9, condition: 'NM', foil: false, price: 2, image: '', status: 'sale',
  ...over,
})

/** Siembra una carta del vendedor directamente en el docStore (users/owner-id/cards/{cardId}). */
const seedCard = (cardId: string, quantity: number) => seedDoc(`users/owner-id/cards/${cardId}`, { quantity })

/** Siembra un buy request directamente en el docStore (users/owner-id/buyRequests/{id}). */
const seedBuyRequest = (id: string, data: { status: BuyRequest['status']; items: any[] }) =>
  seedDoc(`users/owner-id/buyRequests/${id}`, data)

describe('useBuyRequestsStore — submitBuyRequest (SCRUM-70.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetDocStore()
    // TASK-306: por defecto el vendedor tiene publicado exactamente lo que
    // item() carga en el carrito (price: 2, status: 'sale') — estos tests no
    // ejercitan la re-resolución en sí (eso lo hace priceResolution.test.ts),
    // así que el lookup no debe alterar lo que ya se está asertando aquí.
    setPublishedPrice('public_cards/owner-id_c1', 2)
  })

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
    // TASK-306: cada submit ahora también hace un doc() por línea para
    // leer el precio publicado (fetchPublishedPriceMap) antes del doc()
    // del propio BuyRequest — 1 item + 1 ref por submit, 2 submits = 4.
    expect(doc).toHaveBeenCalledTimes(4)
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

  it('TASK-307 AC5: una cantidad manipulada por encima del stock publicado se trunca al stock real antes de persistirse', async () => {
    // Previene: que un comprador edite item.quantity a mano (el ataque
    // medido en dev via localStorage) y ese numero llegue verbatim al
    // documento persistido — igual que TASK-306 ya hace con el precio.
    setPublishedPrice('public_cards/owner-id_c1', 2, 'sale', 1) // el vendedor solo tiene 1
    const store = useBuyRequestsStore()
    const res = await store.submitBuyRequest(
      'owner-id',
      { name: 'Rafa', phone: '099123', email: 'a@b.com' },
      [item({ price: 2, quantity: 2 })], // el carrito pide 2
      1000,
    )
    expect(res.ok).toBe(true)
    const payload = (setDoc as any).mock.calls[0][1]
    expect(payload.items[0].quantity).toBe(1) // nunca 2 — truncado al stock publicado
    expect(payload.totalValue).toBe(2) // 2 * 1, no 2 * 2
  })
})

describe('useBuyRequestsStore — fulfillRequest (SCRUM-70.3 / TASK-307 / TASK-316)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    resetDocStore()
  })

  it('descuenta de la colección (delete/update), reporta faltante con su cantidad y marca fulfilled', async () => {
    seedCard('c1', 1)
    seedCard('c2', 10)
    // 'gone' never seeded — carta inexistente.
    seedBuyRequest('req-1', {
      status: 'pending',
      items: [item({ cardId: 'c1', quantity: 1 }), item({ cardId: 'c2', quantity: 3 }), item({ cardId: 'gone', quantity: 1 })],
    })

    const store = useBuyRequestsStore()
    store.buyRequests.push({
      id: 'req-1', buyerName: 'Rafa', totalValue: 0, status: 'pending', createdAt: new Date(),
      items: [item({ cardId: 'c1', quantity: 1 }), item({ cardId: 'c2', quantity: 3 }), item({ cardId: 'gone', quantity: 1 })],
    })

    const res = await store.fulfillRequest('req-1')

    expect(res.ok).toBe(true)
    expect(res.missing).toEqual(['gone'])
    expect(res.shortfalls).toEqual([{ cardId: 'gone', requested: 1, available: 0 }])
    expect(updateDoc).not.toHaveBeenCalled() // TASK-316: el descuento va por tx.update/tx.delete, nunca updateDoc directo
    expect(store.buyRequests[0].status).toBe('fulfilled')
  })

  it('TASK-307 AC2/AC6: un pedido por MAS unidades de las que hay NO borra la carta y reporta el faltante con su cantidad — nunca "delete" sobre stock insuficiente', async () => {
    // Previene: la incidencia medida en dev — Angel of the Ruins con 1 copia,
    // pedido de 2x, marcado como vendido: la carta desaparecía entera de la
    // colección y no se avisaba nada faltante.
    seedCard('c1', 1)
    seedBuyRequest('req-1', { status: 'pending', items: [item({ cardId: 'c1', quantity: 2 })] })
    const store = useBuyRequestsStore()
    store.buyRequests.push({
      id: 'req-1', buyerName: 'Rafa', totalValue: 0, status: 'pending', createdAt: new Date(),
      items: [item({ cardId: 'c1', quantity: 2 })],
    })

    const res = await store.fulfillRequest('req-1')

    expect(res.ok).toBe(true)
    expect(res.shortfalls).toEqual([{ cardId: 'c1', requested: 2, available: 1 }])
    // La carta SIGUE en la colección con su cantidad intacta — nunca se borró.
    const cardSnap = await mockGetDoc({ path: 'users/owner-id/cards/c1' })
    expect(cardSnap.exists()).toBe(true)
    expect((cardSnap.data() as { quantity: number }).quantity).toBe(1)
  })

  it('TASK-316 AC3: un pedido ya cumplido se rechaza — nunca se vuelve a descontar', async () => {
    // Previene: aceptar un segundo "marcar como vendida" sobre el mismo
    // pedido y descontar la colección dos veces.
    seedCard('c1', 10)
    seedBuyRequest('req-1', { status: 'fulfilled', items: [item({ cardId: 'c1', quantity: 3 })] })
    const store = useBuyRequestsStore()
    store.buyRequests.push({
      id: 'req-1', buyerName: 'Rafa', totalValue: 0, status: 'fulfilled', createdAt: new Date(),
      items: [item({ cardId: 'c1', quantity: 3 })],
    })

    const res = await store.fulfillRequest('req-1')

    expect(res.ok).toBe(false)
    expect(res.alreadyFulfilled).toBe(true)
    const cardSnap = await mockGetDoc({ path: 'users/owner-id/cards/c1' })
    expect((cardSnap.data() as { quantity: number }).quantity).toBe(10) // intacta
  })

  it('TASK-316 AC2/AC6/AC7: dos cumplimientos concurrentes de la misma carta descuentan el total exacto, nunca una escritura absoluta que pisa a la otra', async () => {
    // Previene: el "lost update" medido en dev — Swamp 10 -> 8 -> 7 en vez de
    // 10 -> 8 -> 5 al cumplir dos pedidos de 2x y 3x desde "dos pestañas".
    seedCard('c1', 10)
    seedBuyRequest('req-a', { status: 'pending', items: [item({ cardId: 'c1', quantity: 2 })] })
    seedBuyRequest('req-b', { status: 'pending', items: [item({ cardId: 'c1', quantity: 3 })] })
    const store = useBuyRequestsStore()
    store.buyRequests.push(
      { id: 'req-a', buyerName: 'A', totalValue: 0, status: 'pending', createdAt: new Date(), items: [item({ cardId: 'c1', quantity: 2 })] },
      { id: 'req-b', buyerName: 'B', totalValue: 0, status: 'pending', createdAt: new Date(), items: [item({ cardId: 'c1', quantity: 3 })] },
    )

    const [resA, resB] = await Promise.all([store.fulfillRequest('req-a'), store.fulfillRequest('req-b')])

    expect(resA.ok).toBe(true)
    expect(resB.ok).toBe(true)
    const cardSnap = await mockGetDoc({ path: 'users/owner-id/cards/c1' })
    expect((cardSnap.data() as { quantity: number }).quantity).toBe(5) // 10 - 2 - 3, exacto
  })
})
