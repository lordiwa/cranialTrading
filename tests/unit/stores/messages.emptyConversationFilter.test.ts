/**
 * TASK-313 AC3 regression lock (caso 5 de los casos de uso aprobados) —
 * WG4-O3B2-04: el encabezado "N conversaciones activas" de MessagesView.vue
 * (y el gate del estado vacío, `conversations.length === 0`) leen
 * directamente messagesStore.conversations, que loadConversations() poblaba
 * con TODO documento de /conversations sin verificar si tenía algún mensaje
 * real. Una conversación creada por el defecto de ChatModal/MatchCard (o por
 * cualquier otra vía futura) quedaba contada como "activa" y listada, aunque
 * nadie hubiera escrito un solo mensaje.
 *
 * Harm prevented: un usuario con la bandeja realmente vacía ve "1
 * conversaciones activas" y una entrada fantasma en la lista en vez del
 * estado vacío verdadero.
 *
 * `lastMessage` arranca en '' al crear el documento (ver createConversation)
 * y sendMessage() lo llena recién con el primer mensaje real (nunca vacío:
 * sendMessage rechaza content.trim() === ''), así que es un proxy exacto de
 * "tiene al menos un mensaje" sin necesitar una query extra por conversación.
 */
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: vi.fn().mockResolvedValue(undefined),
  where: vi.fn((...args: unknown[]) => args),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  Timestamp: { now: () => ({ toDate: () => new Date('2026-09-20T00:00:00Z') }) },
}))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me' } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({ t: (k: string) => k }))

import { createPinia, setActivePinia } from 'pinia'
import { getDocs } from 'firebase/firestore'
import { useMessagesStore } from '@/stores/messages'

// Forma real de una conversación abierta y cerrada sin enviar nada
// (WG4-O3B2-04): lastMessage se queda en '' para siempre.
const neverMessagedDoc = (id: string) => ({
  data: () => ({
    id,
    participantIds: ['me-id', 'other-id'],
    participantNames: { 'me-id': 'me', 'other-id': 'other' },
    participantAvatars: {},
    lastMessage: '',
    lastMessageTime: { toDate: () => new Date('2026-09-19T00:00:00Z') },
  }),
})

const realConversationDoc = (id: string) => ({
  data: () => ({
    id,
    participantIds: ['me-id', 'third-id'],
    participantNames: { 'me-id': 'me', 'third-id': 'third' },
    participantAvatars: {},
    lastMessage: 'hola',
    lastMessageTime: { toDate: () => new Date('2026-09-19T00:00:00Z') },
  }),
})

describe('useMessagesStore — loadConversations excluye conversaciones sin mensajes (TASK-313 AC3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('de una lista mixta, solo cuenta/lista la conversación que sí tiene un mensaje', async () => {
    ;(getDocs as any)
      .mockResolvedValueOnce({ docs: [neverMessagedDoc('empty-1'), realConversationDoc('real-1')] })
      .mockResolvedValueOnce({ docs: [] }) // unreadCount fetch de real-1

    const store = useMessagesStore()
    await store.loadConversations()

    expect(store.conversations).toHaveLength(1)
    expect(store.conversations[0]?.id).toBe('real-1')
  })
})
