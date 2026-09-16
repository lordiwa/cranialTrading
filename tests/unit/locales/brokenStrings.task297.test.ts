/**
 * TASK-297. Wargaming de usabilidad contra produccion (2026-09-15): dos
 * cadenas rotas medidas en pantalla.
 *
 * (a) el cajon del carrito ("cart.loginToMatch") escribia "INICIAR SESION"
 * sin tilde, mientras el resto de la app ("auth.login.title",
 * "profile.notFound.login") escribe "INICIAR SESIÓN" con tilde. Mismo boton,
 * mismo idioma, dos ortografias.
 *
 * (b) el aviso de exito al agregar una carta ("cards.addModal.success") traia
 * su propio "✓" escrito a mano ademas del icono que ya dibuja el recuadro del
 * toast (BaseToast.vue, un <svg> para todo toast de tipo success) — se leia
 * "check check <carta> agregada". Se decidio que el RECUADRO es quien pone el
 * icono; el texto no debe repetirlo. Se aplica a las 3 locales (Regla 6).
 */

import es from '@/locales/es.json'
import en from '@/locales/en.json'
import pt from '@/locales/pt.json'

describe('es.json — TASK-297 cadenas rotas', () => {
  it('AC1: cart.loginToMatch se escribe igual que el resto de la app (con tilde)', () => {
    expect(es.cart.loginToMatch).toBe('INICIAR SESIÓN')
    expect(es.cart.loginToMatch).toBe(es.auth.login.title)
    expect(es.cart.loginToMatch).toBe(es.profile.notFound.login)
  })

  it('AC2: cards.addModal.success no trae un icono de verificacion escrito a mano (el recuadro del toast ya dibuja el suyo)', () => {
    expect(es.cards.addModal.success).not.toContain('✓')
    expect(es.cards.addModal.success).toBe('{name} agregada')
  })
})

describe('en.json / pt.json — TASK-297 AC2 aplicado de forma consistente (Regla 6)', () => {
  it('en.json: cards.addModal.success sin icono escrito a mano', () => {
    expect(en.cards.addModal.success).not.toContain('✓')
  })

  it('pt.json: cards.addModal.success sin icono escrito a mano', () => {
    expect(pt.cards.addModal.success).not.toContain('✓')
  })
})

/**
 * AC3 (hallazgo del reviewer de contexto fresco, 2026-09-15): TASK-297 solo
 * arreglo "cards.addModal.success", pero es la MISMA familia de bug —
 * BaseToast.vue dibuja su propio SVG de check para todo toast de tipo
 * 'success' — la que dejaba doble tilde en pantalla en estas otras claves,
 * confirmadas por trazado con grep hasta su superficie real de render (ver
 * docs/PASADA-CADENAS-ES-2026-09-15.md para el listado completo, incluidas
 * las que se dejaron sin tocar y por que):
 *
 * - decks.messages.created      -> toastStore.show(..., 'success')  (stores/decks.ts:466)
 * - decks.messages.deleted      -> toastStore.show(..., 'success')  (stores/decks.ts:579)
 * - matches.contactModal.emailCopied  -> 'success' (SavedContactCard.vue:26, MatchCard.vue:149)
 * - matches.contactModal.contactSaved -> 'success' (MatchCard.vue:192)
 * - contacts.messages.saved     -> 'success' (stores/contacts.ts:42)
 *
 * NO se tocan (declaradas, no arregladas, ver el doc de la pasada):
 * - cards.grid.interestSent: texto de un boton inline, no es toast — el "✓"
 *   ahi es legitimo (no hay recuadro que dibuje ninguno).
 * - matches.messages.saved: la MISMA clave se dispara como 'info' Y como
 *   'success' (stores/matches.ts:438 y :464) — sacarle el "✓" la deja sin
 *   ningun icono en el camino 'info'. Ambiguo, se deja como esta.
 * - matches.messages.completed: cero usos en src/ (clave muerta, medido con
 *   grep) — no se toca porque borrar claves muertas es otro alcance.
 */
describe('es.json / en.json / pt.json — TASK-297 AC3: resto de la familia del doble icono', () => {
  const fixedKeys: Array<[locale: string, dict: Record<string, any>]> = [
    ['es', es],
    ['en', en],
    ['pt', pt],
  ]

  it.each(fixedKeys)('%s.json: decks.messages.created sin icono escrito a mano', (_locale, dict) => {
    expect(dict.decks.messages.created).not.toContain('✓')
  })

  it.each(fixedKeys)('%s.json: decks.messages.deleted sin icono escrito a mano', (_locale, dict) => {
    expect(dict.decks.messages.deleted).not.toContain('✓')
  })

  it.each(fixedKeys)('%s.json: matches.contactModal.emailCopied sin icono escrito a mano', (_locale, dict) => {
    expect(dict.matches.contactModal.emailCopied).not.toContain('✓')
  })

  it.each(fixedKeys)('%s.json: matches.contactModal.contactSaved sin icono escrito a mano', (_locale, dict) => {
    expect(dict.matches.contactModal.contactSaved).not.toContain('✓')
  })

  it.each(fixedKeys)('%s.json: contacts.messages.saved sin icono escrito a mano', (_locale, dict) => {
    expect(dict.contacts.messages.saved).not.toContain('✓')
  })

  it('es.json: cards.grid.interestSent SI conserva el "✓" (texto de boton, no toast — no se toca)', () => {
    expect(es.cards.grid.interestSent).toContain('✓')
  })
})
