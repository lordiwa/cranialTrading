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

/**
 * DESIGN DECISION (TASK-241, 2026-08-18, written down per Rafael's request):
 * cardImageProxyUrl returns a RELATIVE path (/img/...), not an absolute URL,
 * on purpose:
 *   - same-origin — no CORS, and it resolves correctly against whichever
 *     Firebase Hosting deploy is currently serving the app (dev vs prod)
 *     without the frontend needing to know its own deployed origin;
 *   - works unmodified against a local dev server IF/when `/img/**` is also
 *     proxied there (see firebase.json's hosting rewrite).
 * The trade-off, in full: it breaks any consumer that validates "is this a
 * real image URL" by checking startsWith('http') — MatchCard.vue regressed
 * exactly this way (2026-08-18 audit) before this helper existed. The
 * chosen fix is NOT to make the proxy URL absolute; it's to give every
 * consumer that needs to answer "is this displayable" ONE shared check
 * instead of each one growing its own ad hoc validation — that duplication
 * (CollectionGridCard{Compact,Full} checked one shape, MatchCard checked a
 * narrower one) is exactly how the regression got in.
 */
export function isDisplayableImageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return url.startsWith('http') || url.startsWith('/img/')
}
