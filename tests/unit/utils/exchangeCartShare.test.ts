import { formatCartAsText, shareCart } from '@/utils/exchangeCartShare'
import type { ExchangeCartItem } from '@/types/exchangeCart'

function makeItem(overrides: Partial<ExchangeCartItem> = {}): ExchangeCartItem {
  return {
    scryfallId: 'abc-123',
    cardId: 'card-1',
    name: 'Lightning Bolt',
    edition: 'MH2',
    quantity: 1,
    maxQuantity: 4,
    condition: 'NM',
    foil: false,
    price: 1.5,
    image: 'https://example.com/img.jpg',
    status: 'collection',
    ...overrides,
  }
}

const BASE_URL = 'https://cranial-trading.web.app'

describe('formatCartAsText', () => {
  it('formats a single item correctly', () => {
    const items = [makeItem()]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('1x Lightning Bolt (MH2) - $1.50')
  })

  it('formats multiple items as a bullet list', () => {
    const items = [
      makeItem({ name: 'Lightning Bolt', edition: 'MH2', quantity: 2, price: 1.5 }),
      makeItem({ name: 'Ragavan, Nimble Pilferer', edition: 'MH2', quantity: 1, price: 55.0 }),
    ]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('- 2x Lightning Bolt (MH2)')
    expect(text).toContain('- 1x Ragavan, Nimble Pilferer (MH2)')
  })

  it('shows total value', () => {
    const items = [
      makeItem({ quantity: 2, price: 1.5 }),
      makeItem({ name: 'Ragavan', quantity: 1, price: 55.0 }),
    ]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('Total: $58.00')
  })

  it('includes profile URL', () => {
    const items = [makeItem()]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('https://cranial-trading.web.app/@rafael')
  })

  it('shows "$X.XX each" when quantity > 1', () => {
    const items = [makeItem({ quantity: 3, price: 2.0 })]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('$2.00 each')
  })

  it('shows "N/A" when price is 0', () => {
    const items = [makeItem({ price: 0 })]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain('N/A')
  })

  it('returns empty string for empty cart', () => {
    const text = formatCartAsText('rafael', [], BASE_URL)
    expect(text).toBe('')
  })

  it('includes the username header', () => {
    const items = [makeItem()]
    const text = formatCartAsText('rafael', items, BASE_URL)
    expect(text).toContain("@rafael's collection")
  })
})

describe('shareCart', () => {
  const items = [makeItem()]

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls navigator.share when available and returns "shared"', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: shareFn, clipboard: { writeText: vi.fn() } })

    const result = await shareCart('rafael', items, BASE_URL)
    expect(shareFn).toHaveBeenCalledOnce()
    expect(result).toBe('shared')
  })

  it('falls back to clipboard.writeText and returns "copied"', async () => {
    const writeTextFn = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } })

    const result = await shareCart('rafael', items, BASE_URL)
    expect(writeTextFn).toHaveBeenCalledOnce()
    expect(result).toBe('copied')
  })

  it('returns "error" when both share and clipboard fail', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new Error('fail')),
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('fail')) },
    })

    const result = await shareCart('rafael', items, BASE_URL)
    expect(result).toBe('error')
  })
})
