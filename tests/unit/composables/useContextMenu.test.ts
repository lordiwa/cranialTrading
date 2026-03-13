import { calculateMenuPosition } from '@/composables/useContextMenu'

describe('calculateMenuPosition', () => {
  const menuWidth = 200
  const menuHeight = 300
  const vpWidth = 1920
  const vpHeight = 1080

  it('places menu at click position when it fits within viewport', () => {
    const result = calculateMenuPosition(500, 400, menuWidth, menuHeight, vpWidth, vpHeight)
    expect(result).toEqual({ x: 500, y: 400 })
  })

  it('clamps left when menu overflows right edge', () => {
    const result = calculateMenuPosition(1800, 400, menuWidth, menuHeight, vpWidth, vpHeight)
    expect(result.x).toBe(vpWidth - menuWidth)
    expect(result.y).toBe(400)
  })

  it('clamps up when menu overflows bottom edge', () => {
    const result = calculateMenuPosition(500, 900, menuWidth, menuHeight, vpWidth, vpHeight)
    expect(result.x).toBe(500)
    expect(result.y).toBe(vpHeight - menuHeight)
  })

  it('clamps both axes when overflowing bottom-right corner', () => {
    const result = calculateMenuPosition(1800, 900, menuWidth, menuHeight, vpWidth, vpHeight)
    expect(result.x).toBe(vpWidth - menuWidth)
    expect(result.y).toBe(vpHeight - menuHeight)
  })

  it('never returns negative coordinates', () => {
    const result = calculateMenuPosition(0, 0, menuWidth, menuHeight, vpWidth, vpHeight)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
  })

  it('handles menu larger than viewport gracefully', () => {
    const result = calculateMenuPosition(100, 100, 2000, 2000, vpWidth, vpHeight)
    // Should clamp to 0,0 (or at least non-negative)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
  })
})
