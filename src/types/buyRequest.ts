import type { ExchangeCartItem } from './exchangeCart'
import type { FulfillmentShortfall } from '../utils/buyRequest'

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
  /**
   * TASK-307/316 review M-5: constancia persistida de lo que NO se pudo
   * cumplir, escrita en la MISMA transaccion que marca `fulfilled`. Antes
   * `shortfalls` solo vivia en el valor de retorno de fulfillRequest y en un
   * toast de 4 segundos — el vendedor que refrescaba la pagina perdia la
   * unica prueba de que el pedido fue parcial. Ausente en pedidos anteriores
   * a este fix, o cuando no faltó nada.
   */
  shortfalls?: FulfillmentShortfall[]
}
