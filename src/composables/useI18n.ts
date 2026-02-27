import { computed, ref } from 'vue'
import esLocale from '../locales/es.json'
import enLocale from '../locales/en.json'
import ptLocale from '../locales/pt.json'

// Tipo para los locales soportados
export type SupportedLocale = 'es' | 'en' | 'pt'

// Locales disponibles
const locales: Record<SupportedLocale, Record<string, any>> = {
  es: esLocale,
  en: enLocale,
  pt: ptLocale,
}

// Estado global del idioma actual
const currentLocale = ref<SupportedLocale>('es')

/**
 * Obtiene un valor anidado de un objeto usando notación de punto
 * Ejemplo: getNestedValue(obj, 'common.actions.save') => 'GUARDAR'
 */
function getNestedValue(obj: Record<string, any>, path: string): string | undefined {
  const keys = path.split('.')
  let current: any = obj

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined
    }
    current = current[key]
  }

  return typeof current === 'string' ? current : undefined
}

/**
 * Reemplaza placeholders en un string con valores
 * Ejemplo: interpolate('Hola {name}', { name: 'Juan' }) => 'Hola Juan'
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replaceAll(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`
  })
}

/**
 * Composable para internacionalización
 */
export function useI18n() {
  const locale = computed(() => currentLocale.value)
  const messages = computed(() => locales[currentLocale.value])

  /**
   * Traduce una clave a su valor en el idioma actual
   * @param key - Clave de traducción (ej: 'common.actions.save')
   * @param params - Parámetros para interpolación (ej: { count: 5 })
   * @returns El texto traducido o la clave si no se encuentra
   */
  function t(key: string, params?: Record<string, string | number>): string {
    const value = getNestedValue(messages.value, key)

    if (value === undefined) {
      console.warn(`[i18n] Missing translation for key: ${key}`)
      return key
    }

    if (params) {
      return interpolate(value, params)
    }

    return value
  }

  /**
   * Cambia el idioma actual
   * @param newLocale - Nuevo idioma
   */
  function setLocale(newLocale: SupportedLocale) {
    if (locales[newLocale]) {
      currentLocale.value = newLocale
      // Guardar preferencia en localStorage
      localStorage.setItem('cranial_locale', newLocale)
    } else {
      console.warn(`[i18n] Locale '${newLocale}' not supported`)
    }
  }

  /**
   * Obtiene todos los idiomas disponibles
   */
  function getAvailableLocales(): SupportedLocale[] {
    return Object.keys(locales) as SupportedLocale[]
  }

  /**
   * Verifica si una clave de traducción existe
   */
  function hasKey(key: string): boolean {
    return getNestedValue(messages.value, key) !== undefined
  }

  return {
    locale,
    messages,
    t,
    setLocale,
    getAvailableLocales,
    hasKey,
  }
}

/**
 * Inicializa el idioma desde localStorage o usa el default
 */
export function initI18n() {
  const saved = localStorage.getItem('cranial_locale') as SupportedLocale | null
  if (saved && locales[saved]) {
    currentLocale.value = saved
  }
}

// Exportar función t standalone para uso en stores
export function t(key: string, params?: Record<string, string | number>): string {
  const value = getNestedValue(locales[currentLocale.value], key)

  if (value === undefined) {
    console.warn(`[i18n] Missing translation for key: ${key}`)
    return key
  }

  if (params) {
    return interpolate(value, params)
  }

  return value
}
