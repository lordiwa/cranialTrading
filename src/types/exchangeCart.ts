import type { CardCondition, CardStatus } from './card'

export interface ExchangeCartItem {
  scryfallId: string
  cardId: string
  name: string
  edition: string
  quantity: number
  maxQuantity: number
  condition: CardCondition
  foil: boolean
  price: number
  image: string
  status: CardStatus
}

export interface ExchangeCart {
  username: string
  items: ExchangeCartItem[]
  createdAt: number
  expiresAt: number
}

export interface ExchangeCartStorage {
  carts: Record<string, ExchangeCart>
}
