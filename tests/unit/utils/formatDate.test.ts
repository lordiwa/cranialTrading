import { formatDate } from '../../../src/utils/formatDate'

describe('formatDate', () => {
  const testDate = new Date('2024-03-15')

  it('returns a non-empty string for a valid date with en locale', () => {
    const result = formatDate(testDate, 'en')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('returns a non-empty string for a valid date with es locale', () => {
    const result = formatDate(testDate, 'es')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('returns different strings for en and es locales', () => {
    const enResult = formatDate(testDate, 'en')
    const esResult = formatDate(testDate, 'es')
    // en and es format dates differently
    expect(enResult).not.toBe(esResult)
  })

  it('returns empty string for null', () => {
    expect(formatDate(null, 'en')).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined, 'en')).toBe('')
  })

  it('returns empty string for an invalid Date object', () => {
    expect(formatDate(new Date('invalid'), 'en')).toBe('')
  })

  it('accepts custom Intl.DateTimeFormatOptions', () => {
    const result = formatDate(testDate, 'en', { year: 'numeric' })
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })
})
