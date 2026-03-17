import type { CardCondition } from '../types/card'

const CONDITION_MULTIPLIERS: Record<string, number> = {
  M: 1.0,
  NM: 1.0,
  LP: 0.85,
  MP: 0.70,
  HP: 0.50,
  PO: 0.30,
}

export function getConditionMultiplier(condition: CardCondition): number {
  return CONDITION_MULTIPLIERS[condition] ?? 1.0
}

export function getConditionAdjustedPrice(price: number, condition: CardCondition): number {
  return Math.round(price * getConditionMultiplier(condition) * 100) / 100
}
