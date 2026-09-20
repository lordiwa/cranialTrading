/**
 * TASK-313 regression lock — WG4-O3B2-04 (wargaming corrida #4, 2026-09-19,
 * severidad BAJA, ROTURA REAL): abrir el modal de CONTACTAR y cerrarlo sin
 * escribir persistía una conversación vacía e imborrable en Firestore, y el
 * encabezado de /messages la contaba como "1 conversaciones activas" pese a
 * que /messages seguía mostrando un solo estado vacío verdadero.
 *
 * Causa: ChatModal.initializeConversation() llamaba a
 * messagesStore.createConversation() (un getDoc + setDoc real) desde el watch
 * que dispara cuando `show` pasa a true — o sea, al ABRIR el modal, antes de
 * que exista un solo mensaje. El fix difiere esa escritura a
 * handleSendMessage, en el primer envío real; abrir el modal ahora solo
 * calcula el id determinístico de la conversación en memoria (sin tocar
 * Firestore) para poder escuchar mensajes existentes.
 *
 * Casos de uso aprobados cubiertos acá (ver briefing del Orquestador):
 *   AC2 (caso 2, EXCEPCIÓN) — abrir y cerrar sin escribir no persiste nada.
 *   caso 1 (HAPPY) — enviar sí crea la conversación, y recién en ese momento.
 *   caso 3 (ALTERNATIVO) — abrir, cerrar sin enviar, reabrir y enviar: UNA
 *   sola conversación, nunca dos.
 */

vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me', avatarUrl: null } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const mockGetDoc = vi.fn()
const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] })
const mockOnSnapshot = vi.fn(() => vi.fn())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => args),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  query: vi.fn((...args: unknown[]) => args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  where: vi.fn((...args: unknown[]) => args),
  Timestamp: { now: () => ({ toDate: () => new Date('2026-09-20T00:00:00Z') }) },
}))

import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ChatModal from '@/components/chat/ChatModal.vue'

// Llamadas a setDoc que efectivamente CREAN el documento de conversación
// (tiene participantIds); distinto de la escritura de un mensaje (senderId)
// o del merge de lastMessage ({merge:true}, ya cubierto por participantIds
// ausente en ese payload).
const conversationCreateCalls = () =>
  mockSetDoc.mock.calls.filter(([, data]) => data && typeof data === 'object' && 'participantIds' in data)

// El modal se teletransporta a document.body (BaseModal usa <Teleport>), así
// que se consulta el DOM real en vez de wrapper.find()/findAll() (que no
// atraviesan el teleport de forma confiable en este entorno de test — medido:
// wrapper.find('input') devuelve un DOMWrapper vacío pese a que el <input>
// existe en document.body).
function findSendButton(): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '✓') ?? null
}

function findCloseButton(): HTMLButtonElement | null {
  return document.querySelector('[aria-label="common.actions.close"]') as HTMLButtonElement | null
}

async function setInputValue(value: string) {
  const input = document.querySelector('input') as HTMLInputElement | null
  if (!input) throw new Error('chat input not found in document')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  document.body.innerHTML = ''
  mockGetDoc.mockResolvedValue({ exists: () => false })
  mockSetDoc.mockResolvedValue(undefined)
  mockGetDocs.mockResolvedValue({ docs: [] })
  mockOnSnapshot.mockImplementation(() => vi.fn())
})

describe('ChatModal — TASK-313 la conversación se crea en el primer envío, nunca al abrir', () => {
  it('AC2: abrir el modal y cerrarlo sin escribir nunca llama a setDoc (no persiste nada)', async () => {
    const wrapper = mount(ChatModal, {
      props: { show: true, otherUserId: 'other-id', otherUsername: 'other' },
      attachTo: document.body,
    })
    await flushPromises()

    expect(mockSetDoc).not.toHaveBeenCalled()

    const closeBtn = findCloseButton()
    expect(closeBtn).toBeTruthy()
    closeBtn!.click()
    await flushPromises()

    expect(mockSetDoc).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('HAPPY: enviar un mensaje sí crea la conversación, recién en ese momento', async () => {
    const wrapper = mount(ChatModal, {
      props: { show: true, otherUserId: 'other-id', otherUsername: 'other' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(mockSetDoc).not.toHaveBeenCalled()

    await setInputValue('hola')
    const sendBtn = findSendButton()
    expect(sendBtn).toBeTruthy()
    sendBtn!.click()
    await flushPromises()

    expect(conversationCreateCalls()).toHaveLength(1)
    wrapper.unmount()
  })

  it('ALTERNATIVO (caso 3): abrir, cerrar sin enviar, reabrir y enviar produce UNA sola conversación', async () => {
    const wrapper = mount(ChatModal, {
      props: { show: true, otherUserId: 'other-id', otherUsername: 'other' },
      attachTo: document.body,
    })
    await flushPromises()

    // Cerrar sin escribir (dispara handleClose, resetea el estado local)
    findCloseButton()!.click()
    await flushPromises()
    expect(mockSetDoc).not.toHaveBeenCalled()

    // El padre real reacciona a @close bajando `show`; lo simulamos acá.
    await wrapper.setProps({ show: false })
    await flushPromises()
    // Reabrir (segundo click en CONTACTAR)
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(mockSetDoc).not.toHaveBeenCalled()

    // Ahora sí se envía
    await setInputValue('hola de nuevo')
    findSendButton()!.click()
    await flushPromises()

    expect(conversationCreateCalls()).toHaveLength(1)
    wrapper.unmount()
  })
})
