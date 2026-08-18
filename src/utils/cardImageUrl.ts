/**
 * cardImageUrl — TASK-241 (proxy re-scope, 2026-08-18). Builds URLs against
 * our own cached-image proxy (Cloud Function `cardImage` + Firebase Storage,
 * see functions/lib/cardImage.js) instead of hitting cards.scryfall.io
 * directly. Rafael's argument for this ticket is REQUEST COUNT to Scryfall,
 * not bytes — AC1 already fixed bytes by switching to the `thumb`/`grid`
 * WEBP variants; this fixes call volume by routing the grid's repeated
 * requests through our own domain, which serves from Storage on a cache hit
 * and only calls Scryfall once per (variant, face, scryfallId) ever.
 *
 * The proxy URL shape mirrors Scryfall's own path layout on purpose
 * (variant/face/id) so the two are a straight string rewrite of each other —
 * see scryfallFallbackUrl below, which is the AC7 degradation path.
 */

export type CardImageVariant = 'thumb' | 'grid'
export type CardImageFace = 'front' | 'back'

const PROXY_URL_RE = /^\/img\/(thumb|grid)\/(front|back)\/([0-9a-fA-F-]+)\.webp$/

/** Our own proxy URL — same-origin, so no CORS concerns and Cache-Control
 *  from OUR response (not Scryfall's) governs the browser/CDN cache. */
export function cardImageProxyUrl(
  scryfallId: string,
  variant: CardImageVariant = 'thumb',
  face: CardImageFace = 'front'
): string {
  return `/img/${variant}/${face}/${scryfallId}.webp`
}

/**
 * AC7 degradation: given a URL that (looks like) one of our proxy URLs,
 * returns the direct Scryfall CDN URL it maps to — used as the `@error`
 * fallback on `<img>` tags so a proxy/Storage outage still renders the
 * card by falling all the way back to hitting Scryfall directly, exactly
 * like before this ticket. Returns null for any URL that isn't one of ours
 * (nothing to fall back from — e.g. already a direct Scryfall URL, or a
 * data: URL, or empty).
 */
export function scryfallFallbackUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const m = PROXY_URL_RE.exec(url)
  if (!m) return null
  const [, variant, face, scryfallId] = m
  if (!variant || !face || !scryfallId) return null
  return `https://cards.scryfall.io/${variant}/${face}/${scryfallId.charAt(0)}/${scryfallId.charAt(1)}/${scryfallId}.webp`
}
