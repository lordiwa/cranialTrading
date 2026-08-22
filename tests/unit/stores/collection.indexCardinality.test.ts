/**
 * TASK-275 — el card_index queda con huecos que el uso NO cierra.
 *
 * MEDIDO contra la cuenta de QA de dev (2026-08-22): 1880 documentos en
 * users/<uid>/cards contra 1879 entradas en card_index, un solo chunk,
 * contiguo, sin duplicados. `indexLooksComplete` (src/stores/collection.ts
 * ~718-762) mira cuatro condiciones y NINGUNA es cardinalidad, así que ese
 * índice se declara SANO y no se dispara ninguna reparación: la suite E2E
 * completa cargó esa colección decenas de veces y el hueco nunca se cerró.
 * La carta faltante es invisible para la búsqueda, que se construye A PARTIR
 * del índice.
 *
 * Alcance decidido (Rafael, 2026-08-22, opción A): DETECCIÓN SIN REPARACIÓN.
 * El sensor compara entradas cargadas contra el conteo real de documentos
 * (getCountFromServer, la misma lectura agregada que addCard ya usa) y, SOLO
 * ante divergencia, persiste un documento de diagnóstico por cuenta. NO
 * dispara buildCardIndex: reconstruir una cuenta de 100 mil cartas no es
 * gratis y todavía no se sabe la frecuencia real. Que no repare es la mitad
 * del sentido del ticket, así que está bloqueado por test acá abajo.
 *
 * AC5 (el criterio que gobierna el ticket): el sensor tiene que verse ROJO
 * ante una divergencia sembrada a propósito. Este proyecto ya tiene cuatro
 * chequeos de salud que no detectan un índice corto; uno más que nunca se vio
 * fallar no agrega nada.
 */

// Mock Firebase BEFORE any imports that use it
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

const mockBuildCardIndex = vi.fn().mockResolvedValue({ totalCards: 0, chunks: 0 })

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: (...args: unknown[]) => mockBuildCardIndex(...args),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
  isPublicCard: vi.fn(),
  scheduleIndexReconcile: vi.fn(),
  batchSyncCardsToPublic: vi.fn().mockResolvedValue(undefined),
  removeCardFromPublic: vi.fn().mockResolvedValue(undefined),
  syncAllUserCards: vi.fn(),
  syncAllUserPreferences: vi.fn(),
  syncCardToPublic: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/scryfallCache', () => ({
  getCardsByIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

const mockGetDocs = vi.fn()
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetCountFromServer = vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) })

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'card-1' }),
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getCountFromServer: (...args: unknown[]) => mockGetCountFromServer(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  Timestamp: { now: () => ({ seconds: 1755000000, nanoseconds: 0 }) },
  updateDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com', username: 'testuser' },
  })),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({ show: vi.fn() })),
}))

import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore, type IndexCard } from '@/stores/collection'

const DIAGNOSTIC_PATH = 'users/test-user-id/diagnostics/cardIndexHealth'

/** Minimal IndexCard — only the fields loadFromIndex/indexToCard actually read. */
function makeIndexCard(id: string): IndexCard {
  return {
    i: id,
    s: `scryfall-${id}`,
    n: `Card ${id}`,
    st: 'collection',
    q: 1,
    p: 0,
    cm: 0,
    co: [],
    r: 'c',
    t: 'Creature',
    f: false,
    sc: 'tst',
    e: 'Test Set',
    pw: '',
    to: '',
    fa: false,
    pm: [],
    kw: [],
    lg: [],
    ca: 0,
    cn: 'NM',
    pb: false,
  }
}

/** A fake card_index chunk document snapshot. */
function chunkDoc(id: string, cards: IndexCard[]) {
  return {
    id,
    ref: { path: `users/test-user-id/card_index/${id}` },
    data: () => ({ cards, count: cards.length, version: 3 }),
  }
}

function snapshotOf(docs: ReturnType<typeof chunkDoc>[]) {
  return { empty: docs.length === 0, docs, size: docs.length }
}

/** El sensor sale del camino de carga sin bloquearlo: hay que dejar drenar la cola. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** Escrituras del setDoc dirigidas al documento de diagnóstico, y solo esas. */
function diagnosticWrites() {
  return mockSetDoc.mock.calls.filter(
    ([ref]) => (ref as { path?: string } | undefined)?.path === DIAGNOSTIC_PATH
  )
}

describe('collection store: sensor de cardinalidad del card_index (TASK-275)', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue(snapshotOf([]))
    mockDeleteDoc.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockBuildCardIndex.mockResolvedValue({ totalCards: 0, chunks: 0 })
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('AC5 — DIVERGENCIA SEMBRADA: 3 documentos contra 2 entradas persiste el diagnóstico', async () => {
    // Un chunk único, contiguo desde 0, sin duplicados, versión 3 y 2 != 2000:
    // pasa las CUATRO condiciones de indexLooksComplete. El sensor de
    // cardinalidad es lo único que puede verlo.
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    const writes = diagnosticWrites()
    expect(writes).toHaveLength(1)
    expect(writes[0]?.[1]).toMatchObject({
      docCount: 3,
      indexCount: 2,
      difference: 1,
    })
    expect(writes[0]?.[1]).toHaveProperty('detectedAt')
  })

  it('AC5 — la divergencia también se grita por consola, no solo se persiste', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('TASK-275'))
  })

  it('DETECCIÓN PURA: ante divergencia NO se dispara buildCardIndex — el sensor observa, no repara', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    // Se detectó...
    expect(diagnosticWrites()).toHaveLength(1)
    // ...y aun así NADIE reconstruyó. Reconstruir una cuenta de 100 mil cartas
    // no es gratis; primero se mide la frecuencia real (alcance, opción A).
    expect(mockBuildCardIndex).not.toHaveBeenCalled()
  })

  it('CASO SANO: mismo conteo que entradas — CERO escrituras y ninguna reparación', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b'), makeIndexCard('c')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(diagnosticWrites()).toHaveLength(0)
    expect(mockBuildCardIndex).not.toHaveBeenCalled()
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('la lectura agregada va UNA sola vez por carga, y sobre users/<uid>/cards', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b'), makeIndexCard('c')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(mockGetCountFromServer).toHaveBeenCalledTimes(1)
    expect(mockGetCountFromServer).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/test-user-id/cards' })
    )
  })

  it('si la lectura agregada falla, la carga NO se rompe y no se escribe diagnóstico — el sensor no puede volverse una dependencia dura de red', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')])])
    )
    mockGetCountFromServer.mockRejectedValue(new Error('unavailable'))

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(store.cards).toHaveLength(2)
    expect(diagnosticWrites()).toHaveLength(0)
    expect(mockBuildCardIndex).not.toHaveBeenCalled()
  })

  it('si el propio diagnóstico no se puede escribir, la carga sigue siendo válida', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard('a'), makeIndexCard('b')])])
    )
    mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) })
    mockSetDoc.mockRejectedValue(new Error('permission-denied'))

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(store.cards).toHaveLength(2)
    expect(mockBuildCardIndex).not.toHaveBeenCalled()
  })

  it('NO corre cuando no hay índice que medir — sin card_index no hay nada que comparar', async () => {
    mockGetDocs.mockResolvedValue(snapshotOf([]))

    const store = useCollectionStore()
    await store.loadCollection()
    await flush()

    expect(mockGetCountFromServer).not.toHaveBeenCalled()
    expect(diagnosticWrites()).toHaveLength(0)
  })
})
