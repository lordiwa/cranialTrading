import {
  accountMissingCount,
  accountStatusLabel,
  computeVerdict,
} from '../../../scripts/backfillCardChunkIdHelpers.mjs'

describe('accountMissingCount', () => {
  it('RUN mode: missing = failed writes', () => {
    expect(accountMissingCount('run', { written: 100, failed: 0 })).toBe(0)
    expect(accountMissingCount('run', { written: 100, failed: 5 })).toBe(5)
  })

  it('STATUS mode: missing = the preview "would write" count, NOT failed (failed is always 0 in status)', () => {
    expect(accountMissingCount('status', { written: 6535, failed: 0 })).toBe(6535)
  })
})

describe('accountStatusLabel', () => {
  it('reports INTERRUMPIDA when the account did not finish', () => {
    expect(accountStatusLabel('status', { done: false, written: 10, failed: 0 })).toMatch(/INTERRUMPIDA/)
  })

  it('reports completa when nothing is missing', () => {
    expect(accountStatusLabel('run', { done: true, written: 100, failed: 0 })).toBe('completa')
    expect(accountStatusLabel('status', { done: true, written: 0, failed: 0 })).toBe('completa')
  })

  it('STATUS: reports INCOMPLETO when cards are missing the field, never "completa" (the bug reproduced against prod)', () => {
    expect(accountStatusLabel('status', { done: true, written: 6535, failed: 0 })).toMatch(/INCOMPLETO/)
  })

  it('RUN: reports INCOMPLETO on write failures', () => {
    expect(accountStatusLabel('run', { done: true, written: 100, failed: 3 })).toMatch(/INCOMPLETO/)
  })
})

describe('computeVerdict', () => {
  it('RUN mode: clean when no failures and no incomplete accounts', () => {
    expect(computeVerdict('run', { totalWritten: 121294, totalFailed: 0, accountsIncomplete: 0 })).toEqual({
      totalMissing: 0,
      clean: true,
    })
  })

  it('RUN mode: not clean when there were write failures', () => {
    expect(computeVerdict('run', { totalWritten: 100, totalFailed: 3, accountsIncomplete: 0 }).clean).toBe(false)
  })

  it('STATUS mode: NOT clean when accounts have cards missing the field — the exact prod scenario (6535 cards, 0 failed writes since none were attempted)', () => {
    const verdict = computeVerdict('status', { totalWritten: 6535, totalFailed: 0, accountsIncomplete: 0 })
    expect(verdict.totalMissing).toBe(6535)
    expect(verdict.clean).toBe(false)
  })

  it('STATUS mode: clean when every card already has the field (dev, post-backfill)', () => {
    const verdict = computeVerdict('status', { totalWritten: 0, totalFailed: 0, accountsIncomplete: 0 })
    expect(verdict.totalMissing).toBe(0)
    expect(verdict.clean).toBe(true)
  })

  it('not clean when any account is incomplete, even with zero missing counted so far', () => {
    expect(computeVerdict('status', { totalWritten: 0, totalFailed: 0, accountsIncomplete: 1 }).clean).toBe(false)
    expect(computeVerdict('run', { totalWritten: 0, totalFailed: 0, accountsIncomplete: 1 }).clean).toBe(false)
  })
})
