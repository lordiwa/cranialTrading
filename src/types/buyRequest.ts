import type { ExchangeCartItem } from './exchangeCart'

export type BuyRequestStatus = 'pending' | 'seen' | 'fulfilled'

/**
 * SCRUM-70: un carrito que un visitante envía al dueño de un perfil, persistido
 * bajo /users/{ownerUid}/buyRequests/{requestId}.
 */
/** Datos de contacto del comprador (para que el dueño pueda responderle). */
export interface BuyerContact {
  name: string
  phone: string
  email: string
}

export interface BuyRequest {
  id: string
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  items: ExchangeCartItem[]
  totalValue: number
  status: BuyRequestStatus
  createdAt: Date
}
