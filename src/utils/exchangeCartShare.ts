import type { ExchangeCartItem } from '@/types/exchangeCart'

export function formatCartAsText(
  username: string,
  items: ExchangeCartItem[],
  baseUrl: string,
): string {
  if (items.length === 0) return ''

  const lines: string[] = []

  lines.push(`Exchange Cart from @${username}'s collection:`)

  for (const item of items) {
    let pricePart: string
    if (item.price === 0) {
      pricePart = 'N/A'
    } else if (item.quantity > 1) {
      pricePart = `$${item.price.toFixed(2)} each`
    } else {
      pricePart = `$${item.price.toFixed(2)}`
    }
    lines.push(`- ${item.quantity}x ${item.name} (${item.edition}) - ${pricePart}`)
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  lines.push(`Total: $${total.toFixed(2)}`)
  lines.push(`View profile: ${baseUrl}/@${username}`)

  return lines.join('\n')
}

export async function shareCart(
  username: string,
  items: ExchangeCartItem[],
  baseUrl: string,
): Promise<'shared' | 'copied' | 'error'> {
  const text = formatCartAsText(username, items, baseUrl)

  if (navigator.share) {
    try {
      await navigator.share({ text, title: `Exchange Cart from @${username}` })
      return 'shared'
    } catch {
      // share failed, try clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'error'
  }
}
