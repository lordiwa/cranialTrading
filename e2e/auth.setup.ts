import { test as setup } from '@playwright/test'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const AUTH_DIR = join(process.cwd(), 'e2e', '.auth')
const STORAGE_STATE_FILE = join(AUTH_DIR, 'user.json')

/**
 * Global auth setup — runs ONCE before all tests.
 * Logs in via form, saves Playwright storageState (cookies + localStorage).
 * With browserLocalPersistence, Firebase auth tokens are in localStorage,
 * so storageState captures everything. No IndexedDB dump needed.
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_A_EMAIL
  const password = process.env.TEST_USER_A_PASSWORD

  if (!email || !password) {
    throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD in .env.local')
  }

  // Ensure auth directory exists
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true })

  // Navigate to login page
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // Fill and submit login form
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  // Wait for successful redirect (not on /login anymore)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })

  // Wait for Firebase to persist auth tokens to localStorage
  await page.waitForTimeout(2_000)

  // Set locale to English and mark tour completed
  await page.evaluate(() => {
    localStorage.setItem('cranial_locale', 'en')
    localStorage.setItem('cranial_tour_completed', 'true')
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('cranial_tour_completed')) {
        localStorage.setItem(key, 'true')
      }
    }
  })

  // Save Playwright storageState (cookies + localStorage — includes Firebase auth tokens)
  await page.context().storageState({ path: STORAGE_STATE_FILE })
})
