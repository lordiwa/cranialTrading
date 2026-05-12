import { describe, expect, it } from 'vitest'
import { findCardWithSamePrint, type PrintIdentity } from '@/utils/cardIdentity'
import type { Card } from '@/types/card'

const card = (overrides: Partial<Card>): Card => ({
  id: overrides.id ?? 'c1',
  scryfallId: overrides.scryfallId ?? 'sc-1',
  name: overrides.name ?? 'Lightning Bolt',
  edition: overrides.edition ?? 'Foundations',
  setCode: overrides.setCode ?? 'FDN',
  quantity: overrides.quantity ?? 1,
  condition: overrides.condition ?? 'NM',
  foil: overrides.foil ?? false,
  price: overrides.price ?? 0,
  image: overrides.image ?? '',
  status: overrides.status ?? 'collection',
  updatedAt: overrides.updatedAt ?? new Date(),
})

const identity: PrintIdentity = {
  scryfallId: 'sc-1',
  edition: 'Foundations',
  condition: 'NM',
  foil: false,
  status: 'collection',
}

describe('findCardWithSamePrint', () => {
  it('returns the card when scryfallId, edition, condition, foil and status all match', () => {
    const cards = [card({ id: 'A' })]
    expect(findCardWithSamePrint(cards, identity)?.id).toBe('A')
  })

  it('returns undefined when no card matches', () => {
    expect(findCardWithSamePrint([], identity)).toBeUndefined()
  })

  it('does NOT match when scryfallId differs', () => {
    const cards = [card({ id: 'A', scryfallId: 'other' })]
    expect(findCardWithSamePrint(cards, identity)).toBeUndefined()
  })

  it('does NOT match when edition differs (set_name vs set code)', () => {
    // Per feedback_card_edition_canonical: edition is set_name. A row with set code
    // ("FDN") and a row with set name ("Foundations") are different identities.
    const cards = [card({ id: 'A', edition: 'FDN' })]
    expect(findCardWithSamePrint(cards, identity)).toBeUndefined()
  })

  it('does NOT match when condition differs', () => {
    const cards = [card({ id: 'A', condition: 'LP' })]
    expect(findCardWithSamePrint(cards, identity)).toBeUndefined()
  })

  it('does NOT match when foil differs', () => {
    const cards = [card({ id: 'A', foil: true })]
    expect(findCardWithSamePrint(cards, identity)).toBeUndefined()
  })

  it('does NOT match when status differs (collection vs sale)', () => {
    const cards = [card({ id: 'A', status: 'sale' })]
    expect(findCardWithSamePrint(cards, identity)).toBeUndefined()
  })

  it('returns the first matching card when multiple legacy duplicates exist', () => {
    const cards = [card({ id: 'A' }), card({ id: 'B' })]
    expect(findCardWithSamePrint(cards, identity)?.id).toBe('A')
  })

  it('matches across all valid statuses (sale, trade, wishlist)', () => {
    for (const status of ['sale', 'trade', 'wishlist'] as const) {
      const cards = [card({ id: 'A', status })]
      expect(findCardWithSamePrint(cards, { ...identity, status })?.id).toBe('A')
    }
  })

  it('matches foil card when identity.foil is true', () => {
    const cards = [card({ id: 'A', foil: true })]
    expect(findCardWithSamePrint(cards, { ...identity, foil: true })?.id).toBe('A')
  })
})
