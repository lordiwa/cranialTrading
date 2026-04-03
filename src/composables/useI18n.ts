import { computed, ref } from 'vue'

// Tipo para los locales soportados
export type SupportedLocale = 'es' | 'en' | 'pt'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface LocaleMessages extends Record<string, string | LocaleMessages> {}

// Locales cargados dinámicamente (solo el activo al inicio)
const locales = ref<Record<string, LocaleMessages>>({})

// Estado global del idioma actual
const currentLocale = ref<SupportedLocale>('es')

/**
 * Carga un locale dinámicamente
 */
async function loadLocale(lang: SupportedLocale): Promise<void> {
  // eslint-disable-next-line security/detect-object-injection
  if (locales.value[lang]) return
  const module = await import(`../locales/${lang}.json`) as { default: LocaleMessages }
  // eslint-disable-next-line security/detect-object-injection
  locales.value[lang] = module.default
}

/**
 * Obtiene un valor anidado de un objeto usando notación de punto
 * Ejemplo: getNestedValue(obj, 'common.actions.save') => 'GUARDAR'
 */
function getNestedValue(obj: LocaleMessages, path: string): string | undefined {
  const keys = path.split('.')
  let current: string | LocaleMessages = obj

  for (const key of keys) {
    if (typeof current === 'string') {
      return undefined
    }
    // eslint-disable-next-line security/detect-object-injection
    const next: string | LocaleMessages | undefined = current[key] as string | LocaleMessages | undefined
    if (next === undefined) {
      return undefined
    }
    current = next
  }

  return typeof current === 'string' ? current : undefined
}

/**
 * Reemplaza placeholders en un string con valores
 * Ejemplo: interpolate('Hola {name}', { name: 'Juan' }) => 'Hola Juan'
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => {
    // eslint-disable-next-line security/detect-object-injection
    return params[key]?.toString() ?? `{${key}}`
  })
}

/**
 * Cambia el idioma actual (carga el locale si no está en memoria)
 * @param newLocale - Nuevo idioma
 */
async function setLocale(newLocale: SupportedLocale): Promise<void> {
  await loadLocale(newLocale)
  currentLocale.value = newLocale
  localStorage.setItem('cranial_locale', newLocale)
  document.documentElement.lang = newLocale
}

/**
 * Obtiene todos los idiomas disponibles
 */
function getAvailableLocales(): SupportedLocale[] {
  return ['es', 'en', 'pt']
}

/**
 * Composable para internacionalización
 */
export function useI18n() {
  const locale = computed(() => currentLocale.value)
  const messages = computed((): LocaleMessages => locales.value[currentLocale.value] ?? {})

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
export async function initI18n(): Promise<void> {
  const saved = localStorage.getItem('cranial_locale') as SupportedLocale | null
  const lang = (saved && ['es', 'en', 'pt'].includes(saved)) ? saved : 'es'
  await loadLocale(lang)
  currentLocale.value = lang
  document.documentElement.lang = lang
}

// Exportar función t standalone para uso en stores
export function t(key: string, params?: Record<string, string | number>): string {
  const current = locales.value[currentLocale.value]
  if (!current) return key

  const value = getNestedValue(current, key)

  if (value === undefined) {
    console.warn(`[i18n] Missing translation for key: ${key}`)
    return key
  }

  if (params) {
    return interpolate(value, params)
  }

  return value
}
