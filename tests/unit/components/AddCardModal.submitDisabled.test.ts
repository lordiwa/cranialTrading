/**
 * TASK-300. Wargaming de usabilidad contra produccion (2026-09-15): al abrir
 * AGREGAR CARTA sin buscar ni elegir ninguna carta, el boton AGREGAR queda
 * habilitado (enabled = true, sin aria-disabled). Al pulsarlo no pasa nada
 * — handleAddCard() arranca con `if (!selectedPrint.value || !authStore.user)
 * return`, asi que se va en silencio: sin toast, sin foco, cero documentos
 * creados. Es un control muerto.
 *
 * Causa: AddCardModal.vue el boton AGREGAR declara solo `:disabled="loading"`.
 * El patron correcto ya existe en el mismo archivo en el boton BUSCAR:
 * `:disabled="searching || !searchQuery.trim()"`.
 *
 * AC2: sin carta elegida, AGREGAR debe estar deshabilitado con el mismo
 * criterio de "hay algo elegible" que ya usa BUSCAR.
 * AC3: el estado deshabilitado debe ser perceptible fuera de lo visual — el
 * atributo `disabled` real del <button>, no solo una clase de opacidad
 * (BaseButton pasa `:disabled="disabled"` directo al <button> nativo).
 * AC4: esta prueba debe REDDENAR hoy, antes del fix.
 */

vi.mock('@/services/firebase', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/scryfall', () => ({
  getCardSuggestions: vi.fn().mockResolvedValue([]),
  searchCards: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com', username: 'testuser' },
  })),
}))

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AddCardModal from '@/components/collection/AddCardModal.vue'

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('AddCardModal — AGREGAR sin carta elegida (TASK-300)', () => {
  it('AC2/AC3/AC4: el boton AGREGAR esta realmente deshabilitado cuando no hay ninguna carta seleccionada', () => {
    const wrapper = mount(AddCardModal, {
      props: { show: true },
      attachTo: document.body,
      global: { stubs: { RouterLink: true } },
    })

    const submitButton = findButtonByText('cards.addModal.submit')
    expect(submitButton).toBeTruthy()
    // AC3: disabled real del <button> nativo (BaseButton pasa `disabled` al
    // elemento), no solo una clase visual de opacidad.
    expect(submitButton!.disabled).toBe(true)

    wrapper.unmount()
  })
})
