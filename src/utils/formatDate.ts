/**
 * Format a date using the app's current locale via Intl.DateTimeFormat.
 * Replaces all toLocaleDateString() calls. Returns '' for invalid/null/undefined.
 */
export function formatDate(
  date: Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  if (!date) return ''
  if (isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}
