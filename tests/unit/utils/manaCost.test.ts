import { parseManaCost } from '@/utils/manaCost'

describe('parseManaCost', () => {
  it('returns all-zero for empty string', () => {
    expect(parseManaCost('')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })

  it('returns all-zero for undefined-equivalent (no tokens)', () => {
    expect(parseManaCost('{0}')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })

  it('counts simple WUBRG pips', () => {
    expect(parseManaCost('{W}{W}{U}')).toEqual({
      W: 2, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })

  it('counts generic mana into generic bucket', () => {
    expect(parseManaCost('{2}{R}{R}')).toEqual({
      W: 0, U: 0, B: 0, R: 2, G: 0, C: 0, generic: 2,
    })
  })

  it('ignores X cost (variable)', () => {
    expect(parseManaCost('{X}{R}{R}')).toEqual({
      W: 0, U: 0, B: 0, R: 2, G: 0, C: 0, generic: 0,
    })
  })

  it('ignores Y and Z costs (variable)', () => {
    expect(parseManaCost('{Y}{Z}{G}')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 1, C: 0, generic: 0,
    })
  })

  it('counts hybrid {W/U} as 1 to each color (per SCRUM-42 spec)', () => {
    expect(parseManaCost('{W/U}')).toEqual({
      W: 1, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })

  it('counts phyrexian {W/P} as 1 to color', () => {
    expect(parseManaCost('{W/P}')).toEqual({
      W: 1, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })

  it('counts colorless {C}', () => {
    expect(parseManaCost('{C}{C}')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 2, generic: 0,
    })
  })

  it('handles complex commander cost like {3}{W}{U}{B}', () => {
    expect(parseManaCost('{3}{W}{U}{B}')).toEqual({
      W: 1, U: 1, B: 1, R: 0, G: 0, C: 0, generic: 3,
    })
  })

  it('handles double-digit generic {12}', () => {
    expect(parseManaCost('{12}')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 12,
    })
  })

  it('handles 2-hybrid {2/W} as 1 W and 2 generic (best case)', () => {
    // {2/W} can be paid with 2 generic OR 1 W. We count as max color flexibility:
    // 1 W (best for color demand) AND 2 generic (alt path).
    expect(parseManaCost('{2/W}')).toEqual({
      W: 1, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 2,
    })
  })

  it('handles snow {S} like generic 1', () => {
    expect(parseManaCost('{S}')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 1,
    })
  })

  it('is robust to malformed input', () => {
    expect(parseManaCost('garbage')).toEqual({
      W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0,
    })
  })
})
