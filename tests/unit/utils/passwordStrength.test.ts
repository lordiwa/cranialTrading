/**
 * Unit tests for the v2 register/reset-password strength-meter heuristic
 * (design→app v2 F7b, TASK-103). Pure function — presentation-only, does
 * not gate submission.
 */

import { getPasswordStrengthLabel, getPasswordStrengthScore } from '@/utils/passwordStrength'

describe('getPasswordStrengthScore', () => {
  it('returns 0 for an empty password', () => {
    expect(getPasswordStrengthScore('')).toBe(0)
  })

  it('returns a low score for a short, single-character-class password', () => {
    expect(getPasswordStrengthScore('abc')).toBe(1)
  })

  it('returns a higher score for length + mixed digits/letters', () => {
    const short = getPasswordStrengthScore('abc')
    const longerMixed = getPasswordStrengthScore('dragon-rojo-42')
    expect(longerMixed).toBeGreaterThan(short)
  })

  it('returns the max score for a long password with digits, case and symbols', () => {
    expect(getPasswordStrengthScore('Ancestral-Recall-9!')).toBe(4)
  })

  it('never exceeds the 0-4 range regardless of input', () => {
    const score = getPasswordStrengthScore('Sup3r-L0ng-P@ssw0rd-With-Everything-1234!!')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(4)
  })
})

describe('getPasswordStrengthLabel', () => {
  it('maps each score to its label', () => {
    expect(getPasswordStrengthLabel(0)).toBe('empty')
    expect(getPasswordStrengthLabel(1)).toBe('weak')
    expect(getPasswordStrengthLabel(2)).toBe('fair')
    expect(getPasswordStrengthLabel(3)).toBe('strong')
    expect(getPasswordStrengthLabel(4)).toBe('veryStrong')
  })
})
