export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
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
