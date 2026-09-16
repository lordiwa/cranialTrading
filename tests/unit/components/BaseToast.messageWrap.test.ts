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
 *
 * Hallazgo del reviewer de contexto fresco (2026-09-15, sobre este mismo
 * candado): el candado de arriba solo miraba las clases del PROPIO <span> —
 * era ciego a sus ancestros. Reintroducir el recorte por el DIV PADRE
 * (`overflow-hidden whitespace-nowrap` sobre el contenedor `flex-1
 * min-w-0`, en vez de en el span) dejaba el candado en VERDE con el bug
 * visual de vuelta. Ademas, la asercion sobre `textContent` es vacua frente
 * a un recorte por CSS: el recorte visual no muta el string del DOM (lo
 * hace `text-overflow: ellipsis` a nivel de pintado), asi que esa asercion
 * pasaba igual ANTES del arreglo de TASK-296 — no discriminaba el bug que
 * este archivo dice bloquear. Se mantiene como candado de integridad de
 * texto (protege contra un recorte por JS tipo `.slice()`/`+ '…'`, una
 * clase de regresion distinta y real, aunque menos probable), pero el
 * candado real del recorte por CSS es el recorrido de clases — ahora
 * extendido a TODA la cadena de ancestros del span dentro del toast.
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
    // Candado de integridad de texto (no de recorte por CSS, ver comentario
    // de cabecera): protege contra un recorte hecho a mano en JS
    // (`.slice()`, `+ '…'`), no contra `overflow:hidden` + ellipsis visual.
    expect(messageSpan!.textContent?.trim()).toBe(LONG_MESSAGE)

    const classList = Array.from(messageSpan!.classList)
    for (const clippingClass of ['truncate', 'line-clamp-1', 'whitespace-nowrap']) {
      expect(classList, `no debe llevar la clase de recorte "${clippingClass}"`).not.toContain(clippingClass)
    }

    // El candado real contra el recorte por CSS: recorrer TODA la cadena de
    // ancestros del span dentro del toast (hasta el contenedor
    // role="status", sin incluirlo) y prohibir ahi la misma familia de
    // clases de recorte. Esto es lo que el candado anterior no hacia, y lo
    // que dejo pasar el recorte reintroducido por el div padre
    // (`flex-1 min-w-0` con `overflow-hidden whitespace-nowrap` encima).
    const statusRoot = document.querySelector('[role="status"]')
    let ancestor = messageSpan!.parentElement
    let ancestorsChecked = 0
    while (ancestor && ancestor !== statusRoot && ancestor !== document.body) {
      const ancestorClasses = Array.from(ancestor.classList)
      const label = `<${ancestor.tagName.toLowerCase()} class="${ancestor.className}">`

      expect(ancestorClasses, `el ancestro ${label} no debe llevar "truncate"`).not.toContain('truncate')
      expect(
        ancestorClasses.some((c) => /^line-clamp-\d+$/.test(c)),
        `el ancestro ${label} no debe llevar una clase line-clamp-*`,
      ).toBe(false)
      const clipsViaOverflow = ancestorClasses.includes('overflow-hidden') && ancestorClasses.includes('whitespace-nowrap')
      expect(
        clipsViaOverflow,
        `el ancestro ${label} no debe combinar "overflow-hidden" + "whitespace-nowrap" (recorta a una linea)`,
      ).toBe(false)

      ancestorsChecked++
      ancestor = ancestor.parentElement
    }
    // Si esto da 0, el recorrido no encontro nada (p.ej. cambio de markup
    // rompio el selector de arriba) y el candado de ancestros de arriba
    // quedaria mudo sin que ningun test lo note — asi que lo afirmamos.
    expect(ancestorsChecked).toBeGreaterThan(0)

    wrapper.unmount()
  })
})
