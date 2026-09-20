/**
 * TASK-304 — regression lock for the actual fix in UserProfileView.vue.
 *
 * AC1 (artifacts/TASK-304-AC1-evidencia.md) measured that /collection and
 * /@usuario already share the SAME price-fetching function (getCardPrices)
 * for the SAME card — the divergence was never a data asymmetry, it was a
 * LOADING-ORDER asymmetry: /collection preloads MTGJSON set mappings in
 * parallel batches (via CollectionTotalsPanel -> useCollectionTotals ->
 * preloadSetMappings) before any card asks for its own price, and the
 * public profile did not, so it fell back to fetching one set at a time,
 * lazily, per card.
 *
 * A behavioral test would need to fully mount UserProfileView.vue (router,
 * auth/exchangeCart/confirm/toast stores, Firestore, i18n, ChatModal,
 * ExchangeCartDrawer, …) just to observe a setTimeout-deferred call — the
 * project's own established pattern for this exact file (see
 * userProfilePrivacy.test.ts, TASK-247/136) is a source-level lock instead,
 * for precisely this cost/benefit reason. This lock targets the actual
 * CALL SITE directly (not an already-covered helper in isolation) per the
 * project's own retrospective that a well-tested helper proved nothing
 * about whether its caller used it — see mtgjsonFailedSetCooldown.test.ts's
 * header for the same lesson applied to the other half of this fix.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../..')
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*/g, '$1')
const VIEW = stripComments(readFileSync(resolve(root, 'src/views/UserProfileView.vue'), 'utf8'))

describe('UserProfileView.vue preloads MTGJSON set mappings like /collection does (TASK-304)', () => {
  it('imports preloadSetMappings from the same service /collection uses', () => {
    expect(VIEW).toMatch(/preloadSetMappings/)
    expect(VIEW).toMatch(/from ['"]\.\.\/services\/mtgjson['"]/)
  })

  it('harm prevented: watches the loaded cards and preloads their set mappings in a deferred batch — without this, a later refactor can silently reintroduce the one-set-at-a-time lazy path that caused the CK/TCG/buylist divergence with /collection', () => {
    const watchBlock = VIEW.match(/watch\(cards,[\s\S]*?\}\);/)
    expect(watchBlock, 'expected a watch(cards, ...) block wiring the preload').not.toBeNull()

    const block = watchBlock![0]
    // Must actually call preloadSetMappings ...
    expect(block).toMatch(/preloadSetMappings\(/)
    // ... deferred, not synchronously in the render path (case 5 / TASK-153:
    // preloading eagerly on the render path is the exact cost that ticket
    // measured and fixed by batching + delaying).
    expect(block).toMatch(/setTimeout\(/)
  })
})
