/**
 * TASK-296. Wargaming de usabilidad contra produccion (2026-09-15), viewport
 * de telefono, /register en espanol: el aviso de username invalido salia
 * cortado ("El nombre de usuario debe tener 3-20 letr...") porque
 * BaseToast.vue pintaba el mensaje con la clase Tailwind `truncate`
 * (overflow-hidden + text-overflow:ellipsis + white-space:nowrap). El span
 * es el UNICO punto de render de TODOS los avisos de la app (toda llamada a
 * toastStore.show/showProgress termina ahi), asi que el recorte alcanzaba a
 * cualquier mensaje largo, no solo a este.
 *
 * Cobertura real de "se ve entero en un telefono" (medir scrollWidth vs
 * clientWidth tras un layout real) requiere un motor de layout de verdad —
 * jsdom no lo tiene, siempre da 0x0 — por eso esa parte del AC3 queda para
 * E2E (viewport movil + idioma espanol), no aca. Lo que SI se puede sensar a
 * nivel de componente, y es lo que este archivo bloquea: (a) que el span que
 * pinta el mensaje no vuelva a llevar una clase de recorte de una linea
 * (truncate / line-clamp / whitespace-nowrap), y (b) que el texto completo
 * del mensaje llegue al DOM sin cortar. Regresion real: alguien reintroduce
 * `truncate` en ese span.
 */

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  t: (key: string) => key,
}))

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BaseToast from '@/components/ui/BaseToast.vue'
import { useToastStore } from '@/stores/toast'

const LONG_MESSAGE = 'El nombre de usuario debe tener 3-20 letras, números o guiones bajos'

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

describe('BaseToast — el aviso no se recorta a una linea (TASK-296)', () => {
  it('AC1/AC2: el span del mensaje no lleva clases que fuercen una sola linea recortada', async () => {
    const toastStore = useToastStore()
    toastStore.show(LONG_MESSAGE, 'error')

    const wrapper = mount(BaseToast, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    const messageSpan = document.querySelector('[role="status"] span.text-small')
    expect(messageSpan).toBeTruthy()
    expect(messageSpan!.textContent?.trim()).toBe(LONG_MESSAGE)

    const classList = Array.from(messageSpan!.classList)
    for (const clippingClass of ['truncate', 'line-clamp-1', 'whitespace-nowrap']) {
      expect(classList, `no debe llevar la clase de recorte "${clippingClass}"`).not.toContain(clippingClass)
    }

    wrapper.unmount()
  })
})
