import { cardImageProxyUrl, scryfallFallbackUrl } from '../../../src/utils/cardImageUrl'

describe('cardImageProxyUrl (TASK-241 AC2)', () => {
  it('defaults to thumb/front', () => {
    expect(cardImageProxyUrl('a268697b-22b0-4e1b-a5b6-d9be95025e57')).toBe(
      '/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })

  it('honors an explicit variant and face', () => {
    expect(cardImageProxyUrl('a268697b-22b0-4e1b-a5b6-d9be95025e57', 'grid', 'back')).toBe(
      '/img/grid/back/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })
})

describe('scryfallFallbackUrl (TASK-241 AC7)', () => {
  it('rewrites one of our proxy URLs to the equivalent direct Scryfall CDN URL', () => {
    expect(scryfallFallbackUrl('/img/thumb/front/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')).toBe(
      'https://cards.scryfall.io/thumb/front/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })

  it('rewrites the back face too', () => {
    expect(scryfallFallbackUrl('/img/grid/back/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp')).toBe(
      'https://cards.scryfall.io/grid/back/a/2/a268697b-22b0-4e1b-a5b6-d9be95025e57.webp'
    )
  })

  it('returns null for a URL that is not one of our proxy URLs (nothing to fall back from)', () => {
    expect(scryfallFallbackUrl('https://cards.scryfall.io/thumb/front/a/2/x.webp')).toBeNull()
  })

  it('returns null for empty/undefined/null input', () => {
    expect(scryfallFallbackUrl('')).toBeNull()
    expect(scryfallFallbackUrl(undefined)).toBeNull()
    expect(scryfallFallbackUrl(null)).toBeNull()
  })
})
