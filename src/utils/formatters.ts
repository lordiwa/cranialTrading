/**
 * TASK-192 — punto paralelo de services/mtgjson.ts formatPrice (Regla 6).
 *
 * Este formatea precios de market_data (MarketView, banner de portafolio). Los
 * escriben Cloud Functions, asi que un tipo raro es menos probable que con
 * MTGJSON — pero la firma `(price: number)` no lo IMPIDE, y el modo de fallo es
 * el mismo: .toFixed sobre algo que no es numero revienta el render de la tabla
 * entera. Un formateador de display no puede tumbar la pantalla.
 *
 * Un string numerico se acepta; cualquier otra cosa sale como N/A. NO se cierran
 * los casos raros al reves: Number([1]) o Number(true) mostrarian un precio
 * inventado, que es peor que un N/A.
 */
export function formatPrice(price: unknown): string {
  if (typeof price === 'number') {
    return Number.isFinite(price) ? `$${price.toFixed(2)}` : 'N/A'
  }
  if (typeof price === 'string') {
    const trimmed = price.trim()
    if (trimmed !== '') {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) return `$${parsed.toFixed(2)}`
    }
  }
  return 'N/A'
}

export function formatPercent(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export function formatDollarChange(val: number): string {
  if (val > 0) return `+$${val.toFixed(2)}`
  if (val < 0) return `-$${Math.abs(val).toFixed(2)}`
  return '$0.00'
}
