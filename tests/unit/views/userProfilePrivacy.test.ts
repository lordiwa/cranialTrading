/**
 * TASK-247 tanda 4 — AC6 static lock.
 *
 * TASK-136 deliberately cut the public profile off from the visited user's
 * PRIVATE card subcollection: a visitor sees `public_cards` (and now the
 * public card index derived from it) and nothing else. This file is the
 * cheap half of AC6 — a source-level lock that reddens if anyone reintroduces
 * a client-side read of `users/{uid}/cards`, of the private card index, or of
 * `scryfall_cache` (which requires auth and so cannot serve an anonymous
 * visitor anyway).
 *
 * The expensive half — watching the actual network requests in a browser
 * while viewing someone else's profile — cannot run here and is written up as
 * a procedure in the ticket. This lock does not replace it; it makes the
 * regression that would break it visible in CI.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../..')

/**
 * Comments are stripped before matching. A lock that reddens because a comment
 * NAMES the thing it forbids is a lock nobody can write documentation around —
 * and this file's whole subject (what was removed, and why) can only be
 * explained by naming it.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

const read = (rel: string): string => stripComments(readFileSync(resolve(root, rel), 'utf8'))

const VIEW = read('src/views/UserProfileView.vue')
const COMPOSABLE = read('src/composables/usePublicProfileIndex.ts')
const SOURCES: [string, string][] = [
  ['UserProfileView.vue', VIEW],
  ['usePublicProfileIndex.ts', COMPOSABLE],
]

describe('AC6 — the public profile never reads the visited user private data', () => {
  it.each(SOURCES)('%s does not name the private cards subcollection', (_name, src) => {
    // Any of these would be a read of users/{uid}/cards, which is exactly
    // what TASK-136 removed and what AC6 forbids.
    expect(src).not.toMatch(/['"`]cards['"`]\s*\)/)
    expect(src).not.toMatch(/users\/\$\{[^}]*\}\/cards/)
    // LOW-3 (ronda 2): a bare /card_index/ also forbids `public_card_index`,
    // which is the collection this feature is SUPPOSED to read. Only the
    // PRIVATE index is off limits here.
    expect(src).not.toMatch(/(?<!public_)card_index/)
  })

  it.each(SOURCES)('%s does not import the collection store or the card services', (_name, src) => {
    expect(src).not.toMatch(/stores\/collection/)
    expect(src).not.toMatch(/services\/cards/)
    expect(src).not.toMatch(/scryfallCache/)
    expect(src).not.toMatch(/cardEnrichment/)
  })

  it('the view no longer enriches public cards in the browser', () => {
    // The old enrichPublicCardsInMemory fetched Scryfall card-by-card for
    // whatever page was loaded — the reason the colour filter only ever saw
    // ~60 cards. The index resolves colours server-side now.
    expect(VIEW).not.toMatch(/enrichPublicCardsInMemory/)
    expect(VIEW).not.toMatch(/getCardsByIds/)
  })

  it('the profile takes its card images from our proxy, not from Scryfall directly', () => {
    // TASK-241: ~155 KB per card measured when the profile pulled JPGs from
    // cards.scryfall.io. publicIndexCardToCard derives /img/... from the
    // scryfallId instead, and nothing here may reintroduce a direct URL.
    for (const [, src] of SOURCES) {
      expect(src).not.toMatch(/cards\.scryfall\.io/)
    }
  })
})
