/**
 * TASK-192 — un precio con tipo inesperado no puede tumbar la pantalla.
 *
 * QUE PASABA. MTGJSON es un tercero y su payload entra sin ninguna validacion.
 * getLatestPrice devolvia el valor tal cual venia y lo declaraba `number | null`
 * — una promesa de tipo que nadie verificaba en tiempo de ejecucion. Si MTGJSON
 * sirve el precio como STRING ('12.50' en vez de 12.50), formatPrice llamaba
 * .toFixed(2) sobre un string y tiraba TypeError. En /search eso hace
 * DESAPARECER LA GRILLA ENTERA de resultados, que el usuario lee como "esa carta
 * no existe". Medido por el wargaming mutando la respuesta real (84.803 precios
 * a string): en /collection son 15 errores de render en 15 s y todas las cartas
 * quedan en "CK: -".
 *
 * EL AGRAVANTE, que es lo que lo volvia grave: el payload se cachea en IndexedDB
 * con TTL de 24 h. Con el upstream YA SANO el cliente no vuelve a pedir el
 * archivo, asi que un fallo TRANSITORIO del tercero dejaba la app rota un dia
 * entero, y la unica salida era que el usuario borrara los datos del sitio.
 *
 * DOS DECISIONES DE DISENO, explicitas:
 *
 * 1. Un string numerico se COERCE, no se descarta. '12.50' es un precio
 *    perfectamente valido servido con otro tipo — un cambio de tipo del tercero,
 *    no un dato corrupto. Descartarlo dejaria la app en "N/A" durante 24 h; la
 *    coercion la deja funcionando. Solo lo que no es un numero finito (objetos,
 *    arrays, NaN, Infinity, 'abc', '') degrada a null.
 *
 * 2. El saneamiento vive en getLatestPrice, que es la FRONTERA por donde entra
 *    el dato del tercero, y ademas formatPrice se endurece por su cuenta. Es a
 *    proposito: son las dos unicas puertas, y el ticket exige que formatPrice no
 *    lance con NINGUN valor de entrada. Con la frontera saneada el payload malo
 *    puede seguir cacheado sin hacer daño — nunca llega a render.
 */
import { formatPrice, __testables } from '@/services/mtgjson'

const { getLatestPrice } = __testables

describe('TASK-192 — getLatestPrice sanea el payload del tercero', () => {
  it('devuelve el numero cuando MTGJSON manda un numero (comportamiento de hoy)', () => {
    expect(getLatestPrice({ '2026-08-10': 12.5 })).toBe(12.5)
  })

  it('toma la fecha mas reciente, no la primera (comportamiento de hoy)', () => {
    expect(getLatestPrice({ '2026-08-01': 1, '2026-08-10': 9.99 })).toBe(9.99)
  })

  it('COERCE un string numerico — es un cambio de tipo, no un dato corrupto', () => {
    expect(getLatestPrice({ '2026-08-10': '12.50' as never })).toBe(12.5)
  })

  it('coerce un string numerico con espacios', () => {
    expect(getLatestPrice({ '2026-08-10': '  7.25  ' as never })).toBe(7.25)
  })

  it('descarta un string no numerico', () => {
    expect(getLatestPrice({ '2026-08-10': 'gratis' as never })).toBeNull()
  })

  it('descarta el string vacio (Number("") es 0, que se mostraria como $0.00)', () => {
    expect(getLatestPrice({ '2026-08-10': '' as never })).toBeNull()
  })

  it('descarta NaN', () => {
    expect(getLatestPrice({ '2026-08-10': Number.NaN })).toBeNull()
  })

  it('descarta Infinity', () => {
    expect(getLatestPrice({ '2026-08-10': Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('descarta un objeto', () => {
    expect(getLatestPrice({ '2026-08-10': { usd: 12.5 } as never })).toBeNull()
  })

  it('descarta un array', () => {
    // Number([12.5]) es 12.5 — la coercion de JS lo aceptaria en silencio.
    expect(getLatestPrice({ '2026-08-10': [12.5] as never })).toBeNull()
  })

  it('descarta true (Number(true) es 1, se mostraria como $1.00)', () => {
    expect(getLatestPrice({ '2026-08-10': true as never })).toBeNull()
  })

  it('descarta null explicito', () => {
    expect(getLatestPrice({ '2026-08-10': null as never })).toBeNull()
  })

  it('sigue devolviendo null sin punto de precio', () => {
    expect(getLatestPrice(undefined)).toBeNull()
    expect(getLatestPrice({})).toBeNull()
  })

  it('acepta el 0 legitimo — es un precio, no un valor ausente', () => {
    expect(getLatestPrice({ '2026-08-10': 0 })).toBe(0)
  })
})

describe('TASK-192 — formatPrice no lanza con NINGUNA entrada', () => {
  it('formatea un numero normal (comportamiento de hoy)', () => {
    expect(formatPrice(12.5)).toBe('$12.50')
  })

  it('sigue devolviendo N/A para null y undefined (comportamiento de hoy)', () => {
    expect(formatPrice(null)).toBe('N/A')
    expect(formatPrice(undefined)).toBe('N/A')
  })

  it('formatea un string numerico en vez de reventar — ESTE es el crash del ticket', () => {
    expect(formatPrice('12.50' as never)).toBe('$12.50')
  })

  const basura: [string, unknown][] = [
    ['string no numerico', 'gratis'],
    ['string vacio', ''],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['objeto', { usd: 1 }],
    ['array', [1, 2]],
    ['array vacio', []],
    ['booleano', true],
    ['funcion', () => 1],
    ['Symbol', Symbol('x')],
    ['BigInt', 10n],
  ]

  it.each(basura)('degrada %s a N/A sin lanzar', (_nombre, valor) => {
    expect(() => formatPrice(valor as never)).not.toThrow()
    expect(formatPrice(valor as never)).toBe('N/A')
  })

  it('formatea el 0 como $0.00, no como N/A', () => {
    expect(formatPrice(0)).toBe('$0.00')
  })
})
