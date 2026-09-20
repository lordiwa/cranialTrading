/**
 * TASK-313 regression lock — Regla 6 (CLAUDE.md), caso 4 de los casos de uso
 * aprobados: MatchCard.handleOpenChat() llamaba a
 * messagesStore.createConversation(otherUserId, otherUsername) ANTES de abrir
 * el ChatModal, o sea que el botón "Mensaje" de un match persistía una
 * conversación en Firestore aunque el usuario cerrara el chat sin escribir
 * nada — el mismo defecto que WG4-O3B2-04 reportó para el botón CONTACTAR del
 * perfil, en un llamador paralelo distinto. El fix quita esa llamada:
 * ChatModal ya calcula su propio id de conversación al abrir (sin escribir) y
 * recién persiste en el primer envío real (ver ChatModal.deferredCreate.test.ts).
 *
 * Harm prevented: abrir el chat de un match desde la lista de matches nuevos
 * infla el conteo de "N conversaciones activas" con una conversación fantasma
 * apenas se mira un match, sin que el usuario haya escrito una sola palabra.
 */

vi.mock('@/services/mtgjson', () => ({
  getCardPrices: vi.fn().mockResolvedValue(null),
  formatPrice: (n: number) => `$${n}`,
}))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/contacts', () => ({
  useContactsStore: vi.fn(() => ({ contacts: [], isContact: () => false, addContact: vi.fn() })),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: vi.fn(() => ({ show: vi.fn() })) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ user: { id: 'me-id', username: 'me', avatarUrl: null } })),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  where: vi.fn((...args: unknown[]) => args),
  Timestamp: { now: () => ({ toDate: () => new Date('2026-09-20T00:00:00Z') }) },
}))

import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MatchCard from '@/components/matches/MatchCard.vue'
import type { MatchCard as MatchCardType, SimpleMatch } from '@/stores/matches'

function makeMatchCard(overrides: Partial<MatchCardType> = {}): MatchCardType {
  return {
    scryfallId: 'a268697b-22b0-4e1b-a5b6-d9be95025e57',
    name: 'Test Card',
    edition: 'Test Set',
    quantity: 1,
    condition: 'NM',
    foil: false,
    price: 1,
    image: '',
    status: 'collection',
    ...overrides,
  }
}

function makeMatch(overrides: Partial<SimpleMatch> = {}): SimpleMatch {
  return {
    id: 'match-1',
    type: 'BIDIRECTIONAL',
    otherUserId: 'other-id',
    otherUsername: 'otheruser',
    createdAt: new Date(),
    myCards: [makeMatchCard()],
    otherCards: [makeMatchCard()],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mockGetDoc.mockResolvedValue({ exists: () => false })
  mockSetDoc.mockResolvedValue(undefined)
})

describe('MatchCard — TASK-313 Regla 6: el botón Mensaje no persiste nada al abrir el chat', () => {
  it('clickear "Mensaje" abre el ChatModal sin llamar a setDoc', async () => {
    const wrapper = mount(MatchCard, {
      props: { match: makeMatch(), tab: 'new' },
      global: { stubs: { RouterLink: true } },
      attachTo: document.body,
    })

    const messageButton = wrapper.findAll('button').find(b => b.text() === 'matches.actions.message')
    expect(messageButton).toBeTruthy()
    await messageButton!.trigger('click')
    await flushPromises()

    expect(mockSetDoc).not.toHaveBeenCalled()
    // El chat efectivamente se abrió (ChatModal montado y visible vía Teleport a body).
    expect(document.body.textContent).toContain('messages.chat.title')

    wrapper.unmount()
  })
})
