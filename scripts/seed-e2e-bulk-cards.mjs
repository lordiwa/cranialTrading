#!/usr/bin/env node
/**
 * seed-e2e-bulk-cards — TASK-267.
 *
 * Seeds a large batch of PUBLIC, FOR-SALE cards into the E2E account
 * (TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in .env.local) so tests that
 * assert on a healthy-sized public profile (e.g.
 * `user-profile.spec.ts`'s "browse public cards on profile with text
 * search filter", which requires > 1000 public cards as an anti-empty-green
 * sensor — see the comment above that assertion before touching the
 * threshold) have real data to find.
 *
 * WHY THIS CALLS REAL BACKEND ENTRY POINTS INSTEAD OF WRITING DOCUMENTS BY
 * HAND. `card_index` and `public_card_index` are built POSITIONALLY and are
 * this project's central bug family (CLAUDE.md / project memory
 * `project_card_index_redesign_v3`) — a hand-written chunk with the wrong
 * shape passes every health check and then reads as a product bug later.
 * This script instead:
 *   1. Signs in as the real E2E user via the Firebase client SDK.
 *   2. Calls `bulkImportCards` — the SAME Cloud Function
 *      `useCollectionImport.ts`'s CSV-import path calls (confirmImport →
 *      bulkImportCards) — in chunks of 500, with status=sale, public=true.
 *   3. Calls `buildCardIndex` — the SAME Cloud Function the app calls after
 *      every import — to rebuild `card_index` from the real card docs.
 *
 * WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: write `public_cards` or
 * `public_card_index` itself. That sync is `services/publicCards.ts`'s
 * `syncAllUserCards` + `buildPublicCardDoc` + the debounced
 * `flushIndexReconcileNow` — real client-only logic with its own coalescing
 * behavior (see the comments in that file). Reimplementing that shape here
 * would be exactly the "index written by hand, wrong shape, passes health
 * checks" trap this comment opened with. Instead, run the app's own
 * "ACTUALIZAR" button on /saved-matches once after this script finishes —
 * with `card_index` already rebuilt, that sync completes in seconds even
 * for thousands of cards (measured: ~10s for 2202 cards, TASK-267).
 *
 * KNOWN TRAP THIS SCRIPT SIDESTEPS: importing this many cards through the
 * ImportDeckModal's PLAIN TEXT paste (not CSV) truncates any card name
 * lacking a following "(SET)" annotation to its first word
 * (`parseTextImportLine`'s trailing `(?:\s+[\w-]+)?` group cannibalizes the
 * last bareword when the lazy `(.+?)` has nothing else to consume) — e.g.
 * "1 Kor Outfitter" becomes cardName "Kor". That also forces a per-card
 * sequential Scryfall fallback search (`useCollectionImport.ts`'s
 * `handleImport`, one `await fetchCardFromScryfall` per line, not batched),
 * which is both slow and fails under load (measured: 2199 lines took over
 * 10 minutes and produced a wall of "Failed to fetch" errors on the
 * fallback search). CSV import (`handleImportCsv` → `buildRawCsvCard`)
 * takes a `scryfallId` directly and does no Scryfall lookup at all — this
 * script's Cloud-Function-direct approach gets the same benefit without a
 * browser. This is a real product bug (undocumented before TASK-267);
 * fixing `parseTextImportLine` is out of scope here and belongs in its own
 * ticket, not folded into a data-seeding change.
 *
 * ALSO MEASURED (TASK-267): driving this at ~2000-card scale through the
 * actual browser UI (Playwright launch, paste, click, wait) reliably froze
 * the tab for minutes at a time once the deck editor grid tried to render
 * that many rows — a live instance of `project_vue_reactivity_large_collections`.
 * Calling the two Cloud Functions directly, as this script does, has no UI
 * to freeze and finishes in well under a minute for ~2000 cards.
 *
 * SAFETY RAIL — dev only by default, same pattern as
 * scripts/seed-e2e-public-card.mjs. Pass --project=<id> to target a
 * different Firebase project; anything other than the default
 * (cranial-trading-dev) refuses to run without --i-know-what-im-doing.
 *
 * Usage:
 *   node scripts/seed-e2e-bulk-cards.mjs [--count=2000] [--project=cranial-trading-dev]
 *
 * After it finishes, log in as the E2E user on the dev site, open
 * /saved-matches, and click "ACTUALIZAR" once to populate public_cards /
 * public_card_index from the freshly-imported cards.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { applicationDefault, initializeApp as initAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const DEFAULT_PROJECT_ID = 'cranial-trading-dev'
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)

const projectId = args.get('project') ?? DEFAULT_PROJECT_ID
if (projectId !== DEFAULT_PROJECT_ID && !args.get('i-know-what-im-doing')) {
  console.error(
    `Refusing to run against project "${projectId}" — this script defaults to ${DEFAULT_PROJECT_ID}.\n` +
    `Pass --project=${projectId} --i-know-what-im-doing to confirm a deliberate target other than dev.`
  )
  process.exit(1)
}

const COUNT = Number.parseInt(String(args.get('count') ?? '2000'), 10)

// Firebase client config for cranial-trading-dev (public, safe to embed —
// same values shipped in .env.development / the deployed bundle).
const firebaseConfig = {
  apiKey: 'AIzaSyBJvs6B_1Ox_NOAl2CxBhCVInc7JVxLAio',
  authDomain: 'cranial-trading-dev.firebaseapp.com',
  projectId: DEFAULT_PROJECT_ID,
  storageBucket: 'cranial-trading-dev.firebasestorage.app',
  messagingSenderId: '805900880586',
  appId: '1:805900880586:web:986d4dbf9124f99d88c233',
}
if (projectId !== DEFAULT_PROJECT_ID) {
  throw new Error('Only cranial-trading-dev config is wired into this script — see --i-know-what-im-doing guard above.')
}

const email = process.env.TEST_USER_A_EMAIL
const password = process.env.TEST_USER_A_PASSWORD
if (!email || !password) {
  throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD in .env.local')
}

/** Pull COUNT distinct real cards (name, set, scryfallId) from scryfall_cache via admin (read-only). */
async function fetchRealCards(adminDb, count) {
  const rows = []
  const seenNames = new Set()
  let last = null
  let scanned = 0
  while (rows.length < count && scanned < count * 30) {
    let q = adminDb.collection('scryfall_cache').orderBy('__name__').limit(1000)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      const data = d.data()
      const name = data.name
      const set = data.set
      if (!name || !set) continue
      if (name.includes('//')) continue // split/dual-faced — keep the sample simple
      if (/^(Forest|Island|Plains|Mountain|Swamp)$/.test(name)) continue
      if (seenNames.has(name.toLowerCase())) continue
      seenNames.add(name.toLowerCase())
      rows.push({ name, set, scryfallId: d.id })
    }
    last = snap.docs[snap.docs.length - 1]
    scanned += snap.docs.length
  }
  return rows.slice(0, count)
}

async function main() {
  // Admin (read-only here) — only used to sample real cards from scryfall_cache.
  const adminApp = initAdminApp({ credential: applicationDefault(), projectId })
  if (adminApp.options.projectId !== projectId) throw new Error('refusing: admin app resolved to the wrong project')
  const adminDb = getFirestore(adminApp)
  const uid = (await getAdminAuth(adminApp).getUserByEmail(email)).uid

  console.log(`Sampling ${COUNT} real cards from scryfall_cache...`)
  const sample = await fetchRealCards(adminDb, COUNT)
  console.log(`Got ${sample.length} distinct cards.`)

  // Client SDK — this is the actual write path the app uses (bulkImportCards,
  // buildCardIndex), authenticated as the real E2E user.
  const clientApp = initializeApp(firebaseConfig)
  const auth = getAuth(clientApp)
  await signInWithEmailAndPassword(auth, email, password)
  if (auth.currentUser?.uid !== uid) throw new Error('signed-in uid does not match the E2E account uid')
  console.log(`Signed in as ${email} (${uid}).`)

  const functions = getFunctions(clientApp)
  const bulkImportCards = httpsCallable(functions, 'bulkImportCards')

  const CHUNK_SIZE = 500
  let created = 0
  for (let i = 0; i < sample.length; i += CHUNK_SIZE) {
    const chunk = sample.slice(i, i + CHUNK_SIZE).map((c) => ({
      scryfallId: c.scryfallId,
      name: c.name,
      edition: c.set.toUpperCase(),
      setCode: c.set.toUpperCase(),
      quantity: 1,
      condition: 'NM',
      foil: false,
      price: 0,
      image: '',
      status: 'sale',
      public: true,
    }))
    const result = await bulkImportCards({ cards: chunk })
    created += result.data.count
    console.log(`Imported chunk ${i}-${i + chunk.length}: ${result.data.count} cards (running total ${created}).`)
  }

  console.log('Rebuilding card_index...')
  const buildCardIndex = httpsCallable(functions, 'buildCardIndex')
  const indexResult = await buildCardIndex({})
  console.log('buildCardIndex result:', JSON.stringify(indexResult.data))

  console.log('\nDone importing. NEXT STEP (manual, real app code path):')
  console.log('  1. Log in as the E2E user on the dev site.')
  console.log('  2. Open /saved-matches and click "ACTUALIZAR" once.')
  console.log('  That runs the real client-side public sync (public_cards + public_card_index).')
}

await main()
