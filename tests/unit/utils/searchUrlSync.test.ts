import { buildSearchQueryUpdate } from '@/utils/searchUrlSync'

describe('buildSearchQueryUpdate', () => {
  it('returns a new query with q set to the trimmed name when it differs from the current q', () => {
    const result = buildSearchQueryUpdate({ q: 'Chandra, Torch of Defiance' }, 'Black Lotus')
    expect(result).toEqual({ q: 'Black Lotus' })
  })

  it('preserves other existing query params untouched', () => {
    const result = buildSearchQueryUpdate({ q: 'Chandra', from: 'decks' }, 'Black Lotus')
    expect(result).toEqual({ q: 'Black Lotus', from: 'decks' })
  })

  it('returns null when the name is empty (does not clobber the URL)', () => {
    expect(buildSearchQueryUpdate({ q: 'Chandra' }, '')).toBeNull()
    expect(buildSearchQueryUpdate({ q: 'Chandra' }, '   ')).toBeNull()
  })

  it('returns null when the trimmed name already matches the current ?q= (no-op guard against header-driven re-sync loops)', () => {
    expect(buildSearchQueryUpdate({ q: 'Black Lotus' }, 'Black Lotus')).toBeNull()
    expect(buildSearchQueryUpdate({ q: 'Black Lotus' }, '  Black Lotus  ')).toBeNull()
  })

  it('trims whitespace from the name before comparing/writing', () => {
    const result = buildSearchQueryUpdate({ q: 'Chandra' }, '  Black Lotus  ')
    expect(result).toEqual({ q: 'Black Lotus' })
  })
})
