/**
 * TASK-091 — Messages store: unreadCount real, estado de error+retry, marcar como leído.
 * Firebase completamente mockeado (nunca importar Firebase real en unit tests).
 */
import { createPinia, setActivePinia } from 'pinia'

const batchUpdate = vi.fn()
const batchCommit = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: vi.fn().mockResolvedValue(undefined),
  where: vi.fn((...args: unknown[]) => args),
  writeBatch: vi.fn(() => ({ update: batchUpdate, commit: batchCommit })),
  Timestamp: { now: () => ({ toDate: () => new Date('2026-07-13T00:00:00Z') }) },
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me' } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({ t: (k: string) => k }))

import { getDocs, onSnapshot } from 'firebase/firestore'
import { useMessagesStore } from '@/stores/messages'

// Deja correr las cadenas de await pendientes de las llamadas fire-and-forget
// (markConversationRead se invoca con `void`, no se puede awaitear directamente).
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

const conversationDoc = (id: string) => ({
  data: () => ({
    id,
    participantIds: ['me-id', 'other-id'],
    participantNames: { 'me-id': 'me', 'other-id': 'other' },
    participantAvatars: {},
    lastMessage: 'hi',
    lastMessageTime: { toDate: () => new Date('2026-07-13T00:00:00Z') },
  }),
})

const unreadMessageDoc = (recipientId: string) => ({
  ref: {},
  data: () => ({ recipientId, senderId: 'x', senderUsername: 'x', content: 'hi', read: false }),
})

describe('useMessagesStore — loadConversations unreadCount real (TASK-091)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calcula unreadCount real por conversación desde los mensajes no leídos', async () => {
    ;(getDocs as any)
      .mockResolvedValueOnce({ docs: [conversationDoc('c1'), conversationDoc('c2')] })
      .mockResolvedValueOnce({ docs: [unreadMessageDoc('me-id'), unreadMessageDoc('me-id')] }) // c1: 2 unread
      .mockResolvedValueOnce({ docs: [unreadMessageDoc('other-id')] }) // c2: 0 unread para mí

    const store = useMessagesStore()
    await store.loadConversations()

    expect(store.conversations).toHaveLength(2)
    const c1 = store.conversations.find(c => c.id === 'c1')
    const c2 = store.conversations.find(c => c.id === 'c2')
    expect(c1?.unreadCount).toBe(2)
    expect(c2?.unreadCount).toBe(0)
  })

  it('deja unreadCount en 0 si falla el conteo de una conversación puntual (best-effort)', async () => {
    ;(getDocs as any)
      .mockResolvedValueOnce({ docs: [conversationDoc('c1')] })
      .mockRejectedValueOnce(new Error('offline'))

    const store = useMessagesStore()
    await store.loadConversations()

    expect(store.conversations).toHaveLength(1)
    expect(store.conversations[0]?.unreadCount).toBe(0)
    expect(store.loadError).toBe(false)
  })

  it('marca loadError=true si falla la carga de conversaciones y loadConversations es el retry', async () => {
    ;(getDocs as any).mockRejectedValueOnce(new Error('network down'))

    const store = useMessagesStore()
    await store.loadConversations()
    expect(store.loadError).toBe(true)

    // Retry: mismo método, ahora exitoso
    ;(getDocs as any).mockResolvedValueOnce({ docs: [conversationDoc('c1')] }).mockResolvedValueOnce({ docs: [] })
    await store.loadConversations()
    expect(store.loadError).toBe(false)
    expect(store.conversations).toHaveLength(1)
  })
})

describe('useMessagesStore — markConversationRead (TASK-091)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('marca en batch los mensajes no leídos dirigidos al usuario y pone unreadCount en 0 localmente', async () => {
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [unreadMessageDoc('me-id'), unreadMessageDoc('me-id')],
    })

    const store = useMessagesStore()
    store.conversations.push({
      id: 'c1',
      participantIds: ['me-id', 'other-id'],
      participantNames: {},
      unreadCount: 2,
    } as any)

    await store.markConversationRead('c1')

    expect(batchUpdate).toHaveBeenCalledTimes(2)
    expect(batchUpdate).toHaveBeenCalledWith({}, { read: true })
    expect(batchCommit).toHaveBeenCalledTimes(1)
    expect(store.conversations.find(c => c.id === 'c1')?.unreadCount).toBe(0)
  })

  it('no escribe nada si no hay mensajes no leídos', async () => {
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })

    const store = useMessagesStore()
    await store.markConversationRead('c1')

    expect(batchUpdate).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('particiona en chunks de 500 y hace un commit secuencial por chunk', async () => {
    const manyUnread = Array.from({ length: 620 }, () => unreadMessageDoc('me-id'))
    ;(getDocs as any).mockResolvedValueOnce({ docs: manyUnread })

    const store = useMessagesStore()
    await store.markConversationRead('c1')

    expect(batchUpdate).toHaveBeenCalledTimes(620)
    expect(batchCommit).toHaveBeenCalledTimes(2) // 500 + 120
  })
})

describe('useMessagesStore — loadConversationMessages re-marca mensajes entrantes (TASK-091 review)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('re-marca como leído cuando llega un mensaje nuevo no leído mientras el hilo está abierto', async () => {
    let snapshotCallback: ((snap: { docs: unknown[] }) => void) | undefined
    ;(onSnapshot as any).mockImplementation((_ref: unknown, cb: (snap: { docs: unknown[] }) => void) => {
      snapshotCallback = cb
      return vi.fn()
    })

    // markConversationRead disparado al abrir el hilo: sin no-leídos todavía
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })

    const store = useMessagesStore()
    store.loadConversationMessages('c1')
    await flushPromises()

    expect(batchCommit).not.toHaveBeenCalled()

    // Llega un mensaje nuevo no leído dirigido a mí vía el listener en tiempo real
    ;(getDocs as any).mockResolvedValueOnce({ docs: [unreadMessageDoc('me-id')] })
    snapshotCallback?.({
      docs: [{
        id: 'm1',
        data: () => ({
          senderId: 'other-id',
          senderUsername: 'other',
          recipientId: 'me-id',
          content: 'nuevo mensaje',
          read: false,
          createdAt: { toDate: () => new Date('2026-07-13T00:00:00Z') },
        }),
      }],
    })
    await flushPromises()

    expect(batchUpdate).toHaveBeenCalledWith({}, { read: true })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('no vuelve a marcar si el snapshot no trae mensajes no leídos nuevos (evita loop)', async () => {
    let snapshotCallback: ((snap: { docs: unknown[] }) => void) | undefined
    ;(onSnapshot as any).mockImplementation((_ref: unknown, cb: (snap: { docs: unknown[] }) => void) => {
      snapshotCallback = cb
      return vi.fn()
    })
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })

    const store = useMessagesStore()
    store.loadConversationMessages('c1')
    await flushPromises()
    vi.clearAllMocks()

    // Snapshot con mensajes ya leídos (p.ej. reflejando el propio update que hizo markConversationRead)
    snapshotCallback?.({
      docs: [{
        id: 'm1',
        data: () => ({
          senderId: 'other-id',
          senderUsername: 'other',
          recipientId: 'me-id',
          content: 'ya leído',
          read: true,
          createdAt: { toDate: () => new Date('2026-07-13T00:00:00Z') },
        }),
      }],
    })
    await flushPromises()

    expect(getDocs).not.toHaveBeenCalled()
    expect(batchCommit).not.toHaveBeenCalled()
  })
})
