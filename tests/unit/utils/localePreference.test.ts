import { isSupportedLocale, resolveLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../../src/utils/localePreference'

describe('isSupportedLocale', () => {
  it('returns true for es, en, pt', () => {
    expect(isSupportedLocale('es')).toBe(true)
    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('pt')).toBe(true)
  })

  it('returns false for an unsupported language code', () => {
    expect(isSupportedLocale('fr')).toBe(false)
  })

  it('returns false for null, undefined, empty string and non-string values', () => {
    expect(isSupportedLocale(null)).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
    expect(isSupportedLocale('')).toBe(false)
    expect(isSupportedLocale(123)).toBe(false)
    expect(isSupportedLocale({})).toBe(false)
  })
})

describe('resolveLocale', () => {
  it('returns the saved locale when it is supported', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('pt')).toBe('pt')
    expect(resolveLocale('es')).toBe('es')
  })

  it('falls back to the default locale (es) when nothing is saved', () => {
    expect(resolveLocale(null)).toBe('es')
    expect(resolveLocale(undefined)).toBe('es')
  })

  it('falls back to the default locale when the saved value is unsupported', () => {
    expect(resolveLocale('fr')).toBe('es')
    expect(resolveLocale('')).toBe('es')
    expect(resolveLocale('ES')).toBe('es') // case-sensitive, not normalized
  })

  it('honors a custom fallback when provided', () => {
    expect(resolveLocale(null, 'en')).toBe('en')
    expect(resolveLocale('fr', 'pt')).toBe('pt')
  })

  it('exposes the default locale and the supported locale list as constants', () => {
    expect(DEFAULT_LOCALE).toBe('es')
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en', 'pt'])
  })
})
