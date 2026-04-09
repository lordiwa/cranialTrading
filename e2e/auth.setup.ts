import { test as setup } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const AUTH_DIR = join(process.cwd(), 'e2e', '.auth')
const STORAGE_STATE_FILE = join(AUTH_DIR, 'user.json')
const IDB_DUMP_FILE = join(AUTH_DIR, 'firebase-idb.json')

/**
 * Global auth setup — runs ONCE before all tests.
 * Logs in via form, saves Playwright storageState + Firebase IndexedDB dump.
 * Tests reuse these files, eliminating redundant logins and Firebase rate-limiting.
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

  // Wait for Firebase to persist auth tokens to IndexedDB
  await page.waitForTimeout(2_000)

  // Set locale to English and mark tour completed
  await page.evaluate(() => {
    localStorage.setItem('cranial_locale', 'en')
    localStorage.setItem('cranial_tour_completed', 'true')
    // Set all user-specific tour keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('cranial_tour_completed')) {
        localStorage.setItem(key, 'true')
      }
    }
  })

  // Dump Firebase IndexedDB auth state
  const idbEntries = await page.evaluate(() => {
    return new Promise<any[]>((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb')
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction('firebaseLocalStorage', 'readonly')
          const store = tx.objectStore('firebaseLocalStorage')
          const keys = store.getAllKeys()
          const values = store.getAll()
          tx.oncomplete = () => {
            const entries = keys.result.map((key: any, i: number) => ({
              key, value: values.result[i],
            }))
            db.close()
            resolve(entries)
          }
        } catch { db.close(); resolve([]) }
      }
      req.onerror = () => resolve([])
    })
  })

  // Save IndexedDB dump to disk
  writeFileSync(IDB_DUMP_FILE, JSON.stringify(idbEntries))

  // Save Playwright storageState (cookies + localStorage)
  await page.context().storageState({ path: STORAGE_STATE_FILE })
})
