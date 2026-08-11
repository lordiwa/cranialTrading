/**
 * TASK-192 — el OTRO formatPrice.
 *
 * Hay dos funciones con el mismo nombre y el mismo defecto (Regla 6 del
 * CLAUDE.md: los puntos paralelos se arreglan juntos, en el mismo paso):
 *   src/services/mtgjson.ts  -> precios de MTGJSON (acepta null/undefined)
 *   src/utils/formatters.ts  -> este, usado por MarketView y el banner de
 *                               portafolio, sobre datos de market_data
 * Este ni siquiera acepta null: su firma es `(price: number)`, o sea que
 * confia en el tipo. market_data lo escriben Cloud Functions, asi que la
 * probabilidad de un tipo raro es menor que con MTGJSON — pero la firma no lo
 * IMPIDE, y el modo de fallo es identico: .toFixed sobre algo que no es numero
 * revienta el render de la tabla entera de MarketView.
 *
 * NO SE TOCAN formatPercent ni formatDollarChange, que tienen la misma forma.
 * Estan fuera del alcance de este ticket (Regla 2) y quedan anotados en el
 * comentario del ticket.
 */
import { formatPrice } from '@/utils/formatters'

describe('TASK-192 — utils/formatters formatPrice no lanza', () => {
  it('formatea un numero normal (comportamiento de hoy)', () => {
    expect(formatPrice(1.5)).toBe('$1.50')
    expect(formatPrice(0)).toBe('$0.00')
    expect(formatPrice(123.456)).toBe('$123.46')
  })

  it('formatea un string numerico en vez de reventar', () => {
    expect(formatPrice('12.50' as never)).toBe('$12.50')
  })

  const basura: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['string no numerico', 'gratis'],
    ['string vacio', ''],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['objeto', { usd: 1 }],
    ['array', [1, 2]],
    ['booleano', true],
  ]

  it.each(basura)('degrada %s a N/A sin lanzar', (_nombre, valor) => {
    expect(() => formatPrice(valor as never)).not.toThrow()
    expect(formatPrice(valor as never)).toBe('N/A')
  })
})
