/**
 * TASK-291 — wargaming WG-001: un pedido enviado dejaba DOS BuyRequest
 * identicos en la bandeja del vendedor. Mecanismo verificado contra el
 * disco (ver ticket): ExchangeCartDrawer.submitRequest() no tenia guarda de
 * vuelo y el segundo clic, dentro de la ventana de vuelo del primero,
 * disparaba un segundo alta.
 *
 * AC4: la aserción va sobre el CONTEO DE LLAMADAS al mock de setDoc (lo que
 * persiste el BuyRequest), nunca sobre avisos en pantalla — la pantalla
 * muestra un solo toast de éxito aunque se hayan escrito dos documentos.
 *
 * Las dos `trigger('click')` del test de doble clic se disparan SIN esperar
 * (`await`) entre ellas a propósito: un `await` deja que Vue vuelva a
 * pintar el DOM (y recién ahí el atributo `disabled` refleja `sending`),
 * lo que enmascararía si la guarda interna de submitRequest() hace algo —
 * el segundo clic nunca llegaria a ejecutar la funcion porque un <button
 * disabled> real no dispara 'click'. Disparando ambos clics en el mismo
 * tick sincronico (antes de que Vue re-renderice) se ejercita la guarda
 * real dentro de submitRequest(), no el atributo disabled del DOM.
 */

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'owner-id' } }),
}))

const mockSetDoc = vi.fn().mockResolvedValue(undefined)
// TASK-306: submitRequest() now re-checks the published price
// (checkPriceChanges) before calling submitBuyRequest, and submitBuyRequest
// itself re-resolves against `public_cards` via getDoc before persisting.
// Every test in this file seeds the SAME card at the SAME published price
// (0.35 — see seedCart below), so getDoc always reports "still published,
// same price" and none of these AC2/AC4 sequencing tests have to change
// their click choreography to account for the new confirm-again step.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ price: 0.35, status: 'sale' }) }),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}))

import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExchangeCartDrawer from '@/components/cart/ExchangeCartDrawer.vue'
import { useExchangeCartStore } from '@/stores/exchangeCart'
import { useToastStore } from '@/stores/toast'

const OWNER_ID = 'owner-id'
const USERNAME = 'seller1'

function seedCart() {
  const cartStore = useExchangeCartStore()
  cartStore.addItem(USERNAME, {
    scryfallId: 'scry-1',
    cardId: 'card-1',
    name: 'Serra Angel',
    edition: 'DOM',
    quantity: 1,
    maxQuantity: 4,
    condition: 'NM',
    foil: false,
    price: 0.35,
    image: '',
    status: 'sale',
  })
  return cartStore
}

// ExchangeCartDrawer's root is a <Teleport to="body"> — its content is
// moved out of the mounted component's own element tree into document.body,
// so it must be queried from document.body (mirrors CardDetailModal's own
// tests, which hit this same Teleport-vs-wrapper.find() gap).
function setInputValue(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event('input'))
}

async function fillContact() {
  const { nextTick } = await import('vue')
  setInputValue('#cart-buyer-phone', '099123456')
  await nextTick()
  setInputValue('#cart-buyer-email', 'buyer@example.com')
  await nextTick()
}

function findSendButton(): HTMLButtonElement {
  return Array.from(document.querySelectorAll('button')).find(
    b => b.textContent?.includes('cart.sendRequest') || b.textContent?.includes('cart.sending'),
  ) as HTMLButtonElement
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockSetDoc.mockResolvedValue(undefined)
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('ExchangeCartDrawer — TASK-291 AC4 (doble clic -> UN solo BuyRequest)', () => {
  it('REDDENS today: two rapid clicks on ENVIAR PEDIDO AL DUEÑO must persist exactly one BuyRequest document', async () => {
    seedCart()
    const wrapper = mount(ExchangeCartDrawer, {
      props: { username: USERNAME, show: true, ownerId: OWNER_ID },
      attachTo: document.body,
    })
    await fillContact()

    const btn = findSendButton()
    // Two clicks fired back-to-back with NO await between them — see file
    // header for why this is the correct way to exercise the guard.
    btn.click()
    btn.click()
    await flushPromises()

    expect(mockSetDoc).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('control: a single click still sends exactly one BuyRequest (must stay green)', async () => {
    seedCart()
    const wrapper = mount(ExchangeCartDrawer, {
      props: { username: USERNAME, show: true, ownerId: OWNER_ID },
      attachTo: document.body,
    })
    await fillContact()

    findSendButton().click()
    await flushPromises()

    expect(mockSetDoc).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})

describe('ExchangeCartDrawer — TASK-291 AC2 (boton deshabilitado + estado visible durante el envio)', () => {
  it('disables the button and shows the sending label as soon as the send is dispatched, until it resolves', async () => {
    seedCart()
    let resolveSetDoc: () => void
    mockSetDoc.mockImplementation(() => new Promise<void>(resolve => { resolveSetDoc = resolve }))

    const wrapper = mount(ExchangeCartDrawer, {
      props: { username: USERNAME, show: true, ownerId: OWNER_ID },
      attachTo: document.body,
    })
    await fillContact()

    findSendButton().click()
    await flushPromises()

    const btnWhileSending = findSendButton()
    expect(btnWhileSending.disabled).toBe(true)
    expect(document.body.textContent).toContain('cart.sending')
    expect(document.body.textContent).not.toContain('cart.sendRequest')

    // On success the cart is cleared and the footer (incl. this button)
    // unmounts entirely — by design, the empty-cart state has no send
    // button at all. The "re-enabled after completion" half of AC2 is
    // covered by the error-path test below, where the cart survives.
    resolveSetDoc!()
    await flushPromises()

    expect(findSendButton()).toBeUndefined()
    expect(document.body.textContent).toContain('cart.emptyState')

    wrapper.unmount()
  })

  it('re-enables the button after a failed send — an error must not brick the form forever', async () => {
    seedCart()
    mockSetDoc.mockRejectedValue(new Error('network down'))

    const wrapper = mount(ExchangeCartDrawer, {
      props: { username: USERNAME, show: true, ownerId: OWNER_ID },
      attachTo: document.body,
    })
    await fillContact()

    findSendButton().click()
    await flushPromises()

    const toastStore = useToastStore()
    expect(toastStore.toasts.some(t => t.type === 'error')).toBe(true)

    const btnAfter = findSendButton()
    expect(btnAfter.disabled).toBe(false)
    expect(document.body.textContent).toContain('cart.sendRequest')

    wrapper.unmount()
  })
})
