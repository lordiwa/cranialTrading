import { getAvatarUrlForUser } from '@/utils/avatar'

describe('getAvatarUrlForUser', () => {
  it('returns the custom URL when one is provided', () => {
    const url = getAvatarUrlForUser('user', 40, 'https://custom.com/img.jpg')
    expect(url).toBe('https://custom.com/img.jpg')
  })

  it('returns a dicebear URL containing the username and default size when no custom URL', () => {
    const url = getAvatarUrlForUser('user')
    expect(url).toContain('dicebear')
    expect(url).toContain('user')
    expect(url).toContain('40')
  })

  it('respects a custom size parameter', () => {
    const url = getAvatarUrlForUser('user', 100)
    expect(url).toContain('size=100')
  })

  it('encodes special characters in the username', () => {
    const url = getAvatarUrlForUser('user name')
    expect(url).toContain('user%20name')
  })
})
