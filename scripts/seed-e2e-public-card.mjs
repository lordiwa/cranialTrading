#!/usr/bin/env node
/**
 * seed-e2e-public-card — TASK-267 AC5.
 *
 * Re-seeds the E2E account (TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in
 * .env.local) with one real card that is for-sale AND public, so that
 * `collection-crud.spec.ts`'s "collection page loads with card grid
 * visible @smoke" has something to find.
 *
 * WHY THIS DRIVES THE REAL UI INSTEAD OF WRITING DOCUMENTS BY HAND.
 * `card_index` is built POSITIONALLY and is this project's central bug
 * family (see CLAUDE.md / project memory `project_card_index_redesign_v3`)
 * — a hand-written chunk with the wrong shape passes every health check and
 * then reads as a product bug later. This script instead launches a real
 * Chromium, logs in, and drives AddCardModal.vue exactly the way a human
 * would: search → select a print → set status to "For Sale" (public
 * defaults to true) → save. That flow is what calls
 * `collectionStore.addCard`, which itself writes the card doc, the
 * `card_index` chunk entry, and (via `services/publicCards.ts`'s
 * `syncCardToPublic` + `scheduleIndexReconcile`) the `public_cards` root
 * doc and the seller's `public_card_index` — the same four places TASK-267
 * AC5 asks to be measured, all produced by the app's own code path.
 *
 * SAFETY RAIL — dev only by default. Pass --project=<id> to target a
 * different Firebase project; anything other than the default
 * (cranial-trading-dev) prints a loud confirmation requirement and refuses
 * to run without --i-know-what-im-doing. There is no case in which this
 * script silently touches production.
 *
 * Usage:
 *   node scripts/seed-e2e-public-card.mjs [--project=cranial-trading-dev] [--card="Lightning Bolt"]
 *
 * Verification (counts only, no mutation) is printed at the end via
 * firebase-admin, reading: users/<uid>/cards, users/<uid>/card_index,
 * users/<uid>/public_card_index, and the root public_cards collection.
 * Requires Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS
 * or `gcloud auth application-default login`) for the verification step —
 * the seed itself (browser + app login) does not need them.
 */
import { chromium } from '@playwright/test'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
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

const BASE_URL =
  projectId === DEFAULT_PROJECT_ID
    ? 'https://cranial-trading-dev.web.app'
    : args.get('base-url')
if (!BASE_URL) {
  console.error('No --base-url given for a non-default project.')
  process.exit(1)
}

const CARD_NAME = args.get('card') ?? 'Lightning Bolt'

const email = process.env.TEST_USER_A_EMAIL
const password = process.env.TEST_USER_A_PASSWORD
if (!email || !password) {
  throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD in .env.local')
}

async function seed() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // ---- login (same flow as e2e/auth.setup.ts) ----
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('[data-testid="login-trigger"]').click()
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 })
  await page.waitForTimeout(2_000)
  await page.evaluate(() => {
    localStorage.setItem('cranial_locale', 'en')
    localStorage.setItem('cranial_tour_completed', 'true')
  })

  // ---- collection → Add Card modal (same locators as e2e/pages/collection.page.ts) ----
  await page.goto(`${BASE_URL}/collection`)
  await page.waitForLoadState('domcontentloaded')

  const addCardButton = page.getByRole('button', { name: /add card|agregar carta/i }).first()
  const fabButton = page.locator('[data-tour="fab-add-card"]')
  try {
    await addCardButton.waitFor({ state: 'visible', timeout: 8000 })
    await addCardButton.click()
  } catch {
    await fabButton.click()
  }

  const modal = page.locator('.fixed.inset-0.z-50').first()
  const searchInput = modal.locator('input[placeholder*="earch"]').first()
  await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
  await searchInput.fill(CARD_NAME)
  await searchInput.press('Enter')
  await page.waitForTimeout(3000)

  const resultCards = modal.locator('.max-h-\\[300px\\] img')
  await resultCards.first().waitFor({ state: 'visible', timeout: 15_000 })
  await resultCards.first().click({ force: true })
  await page.waitForTimeout(500)

  // ---- status = For Sale (public toggle defaults to true — AddCardModal.vue form.public) ----
  // Locale-agnostic match on the group's own text, not a positional index:
  // the modal has 3 role="group" chip groups (quantity, condition, status).
  const statusGroup = modal
    .locator('[role="group"][aria-label]')
    .filter({ hasText: /for sale|en venta|venta/i })
  const saleButton = statusGroup.locator('button').filter({ hasText: /for sale|en venta/i }).first()
  await saleButton.waitFor({ state: 'visible', timeout: 10_000 })
  await saleButton.click()

  const publicToggle = modal.locator('[role="switch"]').first()
  const ariaChecked = await publicToggle.getAttribute('aria-checked').catch(() => null)
  if (ariaChecked === 'false') await publicToggle.click()

  const quantityInput = modal.locator('input[type="number"]').first()
  await quantityInput.waitFor({ state: 'visible' })
  await quantityInput.fill('1')

  const saveButton = modal.getByRole('button', { name: /^add$|agregar/i })
  await saveButton.click()

  await page.locator('text=/success|éxito|agregad|added/i').first().waitFor({ timeout: 15_000 }).catch(() => {})
  // Let the fire-and-forget syncCardToPublic + scheduleIndexReconcile settle
  // (both are non-blocking background calls kicked off by addCard).
  await page.waitForTimeout(4_000)

  await browser.close()
  console.log(`Seeded "${CARD_NAME}" (status=sale, public=true) for ${email} on ${BASE_URL}`)
}

async function verify() {
  const app = initializeApp({ credential: applicationDefault(), projectId })
  if (app.options.projectId !== projectId) {
    throw new Error(`refusing to verify: resolved projectId is ${app.options.projectId}, not ${projectId}`)
  }
  const db = getFirestore(app)
  const uid = (await getAuth(app).getUserByEmail(email)).uid

  const cardsSnap = await db.collection('users').doc(uid).collection('cards').get()
  const cardIndexSnap = await db.collection('users').doc(uid).collection('card_index').get()
  const publicCardIndexSnap = await db.collection('users').doc(uid).collection('public_card_index').get()
  const publicCardsSnap = await db.collection('public_cards').where('userId', '==', uid).get()

  console.log('--- verification (measured, not assumed) ---')
  console.log('uid:', uid)
  console.log('users/<uid>/cards:', cardsSnap.size)
  console.log('users/<uid>/card_index chunks:', cardIndexSnap.size)
  console.log('users/<uid>/public_card_index docs:', publicCardIndexSnap.size)
  console.log('public_cards (root, userId==uid):', publicCardsSnap.size)
}

await seed()
try {
  await verify()
} catch (err) {
  console.warn('Seed succeeded but verification could not run (likely missing ADC):', err.message)
}
