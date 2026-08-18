/**
 * Regression lock for TASK-241 AC1.
 *
 * indexToCard used to build grid-thumbnail image URLs from Scryfall's `normal`
 * variant (488x680 JPG, ~98 KB measured on the reported card) even though the
 * grid only ever renders a small tile. Scryfall's `thumb` variant (146x204
 * WEBP, ~10.5 KB measured on the same card) is the same use case at ~10x
 * fewer bytes with no proxy/infra needed. If a future edit reintroduces
 * `/normal/` (or any non-`thumb` path) into the constructed image URL, this
 * test reddens.
 */

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  queryCardIndex: vi.fn(),
  buildCardIndex: vi.fn().mockResolvedValue({ totalCards: 0, chunks: 0 }),
  applyCardIndexDelta: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, skippedIds: [], fallbackUsed: 0 }),
  loadCollectionChunk: vi.fn(),
  loadCardPage: vi.fn(),
}))

vi.mock('@/services/publicCards', () => ({
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

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'card-1' }),
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: vi.fn().mockResolvedValue(undefined),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
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

function makeIndexCard(overrides: Partial<IndexCard> = {}): IndexCard {
  return {
    i: 'card-1',
    s: 'a268697b-22b0-4e1b-a5b6-d9be95025e57',
    n: 'Test Card',
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
    ...overrides,
  }
}

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

describe('collection store: grid thumbnail image URL (TASK-241 AC1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocs.mockResolvedValue(snapshotOf([]))
  })

  it('single-faced card: requests the Scryfall thumb WEBP variant, never normal', async () => {
    mockGetDocs.mockResolvedValue(snapshotOf([chunkDoc('chunk_0', [makeIndexCard()])]))

    const store = useCollectionStore()
    await store.loadCollection()

    expect(store.cards).toHaveLength(1)
    const image = store.cards[0].image
    expect(image).toBe(
      'https://cards.scryfall.io/thumb/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
    expect(image).not.toContain('/normal/')
  })

  it('dual-faced card: both faces request thumb WEBP, never normal', async () => {
    mockGetDocs.mockResolvedValue(
      snapshotOf([chunkDoc('chunk_0', [makeIndexCard({ df: true })])])
    )

    const store = useCollectionStore()
    await store.loadCollection()

    const parsed = JSON.parse(store.cards[0].image as string) as {
      card_faces: { image_uris: { normal?: string; small?: string } }[]
    }
    expect(parsed.card_faces[0].image_uris.normal).toBe(
      'https://cards.scryfall.io/thumb/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
    expect(parsed.card_faces[1].image_uris.normal).toBe(
      'https://cards.scryfall.io/thumb/back/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
    expect(store.cards[0].image).not.toContain('/normal/')
  })
})
