export type SupportedLocale = 'es' | 'en' | 'pt'

/** Idiomas soportados por la app, en el mismo orden que usan los selectores de UI. */
export const SUPPORTED_LOCALES: SupportedLocale[] = ['es', 'en', 'pt']

/** Idioma usado cuando no hay preferencia guardada o el valor guardado no es válido. */
export const DEFAULT_LOCALE: SupportedLocale = 'es'

/**
 * Valida si un valor arbitrario (p.ej. leído de localStorage) es un locale soportado.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale)
}

/**
 * Resuelve el locale a usar a partir de un valor guardado (p.ej. localStorage),
 * cayendo al fallback si no hay valor guardado o si no es un locale soportado.
 */
export function resolveLocale(
  saved: string | null | undefined,
  fallback: SupportedLocale = DEFAULT_LOCALE
): SupportedLocale {
  return isSupportedLocale(saved) ? saved : fallback
}
