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
  /**
   * Referencia de mercado de Card Kingdom (retail/retailFoil), poblada en
   * background por _upgradePriceFromCK. NUNCA es el precio de la
   * transacción — `price` es siempre el que publicó el vendedor (TASK-298,
   * revierte TASK-119). Opcional: ausente hasta que el lookup resuelve, y
   * ausente en carritos guardados en localStorage antes de TASK-298.
   */
  ckReferencePrice?: number
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
