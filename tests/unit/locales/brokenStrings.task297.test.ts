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
