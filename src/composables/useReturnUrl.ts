export function buildLoginUrl(returnUrl: string): string {
  return `/login?returnUrl=${encodeURIComponent(returnUrl)}`
}

export function buildRegisterUrl(returnUrl: string): string {
  return `/register?returnUrl=${encodeURIComponent(returnUrl)}`
}
