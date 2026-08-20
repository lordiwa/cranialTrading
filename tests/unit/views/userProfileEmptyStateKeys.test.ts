/**
 * TASK-248 AC1/AC7 — source-level lock, same technique as
 * userProfilePrivacy.test.ts (AC6, TASK-247 tanda 4): this project has no
 * convention for mounting views in vitest (see CLAUDE.md's TDD table: "New
 * Vue component -> E2E only"), so a template-conditional bug like this one
 * is locked by reading the compiled template source directly instead.
 *
 * THE BUG: `UserProfileView.vue` had exactly ONE empty-collection message —
 * `profile.noPublicCards` — bound to BOTH the "this seller genuinely has no
 * public cards" state AND the "a filter/search matched nothing" state. A
 * seller with 6,647 public cards and an active keyword filter matching zero
 * of them was told "This user has no public cards in their collection",
 * which is false.
 *
 * This lock reddens if the two states are ever collapsed back onto the same
 * i18n key, WITHOUT depending on the two states' testids reaching runtime
 * (this file cannot render Vue).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../..')
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')

const VIEW = stripComments(readFileSync(resolve(root, 'src/views/UserProfileView.vue'), 'utf8'))

/** Grabs the full opening-tag-to-closing-tag block for one data-testid. */
function blockFor(testid: string): string {
  const marker = `data-testid="${testid}"`
  const idx = VIEW.indexOf(marker)
  expect(idx, `expected to find an element with ${marker} in UserProfileView.vue`).toBeGreaterThan(-1)
  // A generous window is enough to capture the element's own template
  // content without needing a real HTML/Vue parser here.
  return VIEW.slice(idx, idx + 400)
}

describe('UserProfileView — empty-collection states use DISTINCT messages', () => {
  it('the truly-empty state and the filtered-empty state are two different elements', () => {
    expect(VIEW).toContain('data-testid="profile-no-public-cards"')
    expect(VIEW).toContain('data-testid="profile-filtered-empty"')
  })

  it('"no public cards at all" renders profile.noPublicCards', () => {
    expect(blockFor('profile-no-public-cards')).toMatch(/t\(['"]profile\.noPublicCards['"]\)/)
  })

  it('"filter/search matched nothing" renders a DIFFERENT key, not profile.noPublicCards', () => {
    const block = blockFor('profile-filtered-empty')
    expect(block).not.toMatch(/t\(['"]profile\.noPublicCards['"]\)/)
  })

  it('the filtered-empty state offers a way to clear filters', () => {
    expect(VIEW).toContain('data-testid="profile-clear-filters"')
  })
})
