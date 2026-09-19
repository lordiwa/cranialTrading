/**
 * TASK-316 AC5 — guarda de vuelo único en el botón "marcar como vendida".
 * SavedMatchesView arma la guarda (fulfillingRequestIds, un Set en memoria
 * chequeado en el MISMO tick del primer click) y la refleja acá via el prop
 * `fulfilling`. Este test ancla el contrato del lado del componente: cuando
 * `fulfilling` es true, el botón nativo queda `disabled` — lo que en un
 * <button disabled> real evita que un segundo click dispare `emit('fulfill')`
 * mientras el primer cumplimiento está en curso.
 *
 * Previene: que alguien quite el binding `:disabled="fulfilling"` al tocar
 * este componente y el doble click vuelva a poder disparar dos
 * fulfillRequest concurrentes para el MISMO pedido (el hallazgo de TASK-316).
 */

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'es' } }),
}))

import { mount } from '@vue/test-utils'
import BuyRequestCard from '../../../src/components/matches/BuyRequestCard.vue'
import type { BuyRequest } from '../../../src/types/buyRequest'

function makeRequest(overrides: Partial<BuyRequest> = {}): BuyRequest {
  return {
    id: 'req-1',
    buyerName: 'Rafa',
    buyerPhone: '',
    buyerEmail: '',
    items: [],
    totalValue: 0,
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  }
}

describe('BuyRequestCard — TASK-316 AC5 (guarda de vuelo único)', () => {
  it('deshabilita el botón "marcar como vendida" cuando fulfilling=true', () => {
    const wrapper = mount(BuyRequestCard, {
      props: { request: makeRequest(), fulfilling: true },
    })
    const fulfillBtn = wrapper.findAll('button').find(b => b.text().includes('matches.buyRequests.fulfill'))
    expect(fulfillBtn?.attributes('disabled')).toBeDefined()
  })

  it('no deshabilita el botón cuando fulfilling es false/ausente — no bloquea el flujo normal', () => {
    const wrapper = mount(BuyRequestCard, {
      props: { request: makeRequest() },
    })
    const fulfillBtn = wrapper.findAll('button').find(b => b.text().includes('matches.buyRequests.fulfill'))
    expect(fulfillBtn?.attributes('disabled')).toBeUndefined()
  })
})
