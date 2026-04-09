import { type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const IDB_DUMP_FILE = join(process.cwd(), 'e2e', '.auth', 'firebase-idb.json');

/**
 * Race a promise against a hard timeout to prevent hangs.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}

/**
 * Load Firebase IndexedDB dump created by auth.setup.ts.
 */
function loadIdbDump(): any[] | null {
  try {
    if (existsSync(IDB_DUMP_FILE)) {
      return JSON.parse(readFileSync(IDB_DUMP_FILE, 'utf-8'));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

/**
 * Restore Firebase IndexedDB auth tokens into the page.
 * Playwright's storageState handles cookies/localStorage, but Firebase
 * stores auth in IndexedDB which storageState doesn't capture.
 */
async function restoreFirebaseIdb(page: Page, entries: any[]): Promise<void> {
  await withTimeout(
    page.evaluate(async (idbEntries) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('firebaseLocalStorageDb', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            db.createObjectStore('firebaseLocalStorage');
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          const store = tx.objectStore('firebaseLocalStorage');
          for (const entry of idbEntries) {
            store.put(entry.value, entry.key);
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
    }, entries),
    5_000,
    'restoreFirebaseIdb',
  );
}

/**
 * Ensure the page is authenticated.
 *
 * With the setup project (auth.setup.ts), Playwright already restores
 * cookies + localStorage via storageState. This function handles:
 * 1. Restoring Firebase IndexedDB tokens (not captured by storageState)
 * 2. Navigating to the target URL
 * 3. Falling back to form login ONLY if everything else fails
 */
export async function ensureLoggedIn(page: Page, targetUrl?: string) {
  const email = process.env.TEST_USER_A_EMAIL;
  const password = process.env.TEST_USER_A_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD');
  }

  const dest = targetUrl || '/collection';

  // Step 1: Restore Firebase IndexedDB from setup dump
  const idbEntries = loadIdbDump();
  if (idbEntries && idbEntries.length > 0) {
    // Navigate to app origin first (needed for IndexedDB access)
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await restoreFirebaseIdb(page, idbEntries).catch(() => {
      // Non-critical — will fall back to form login
    });

    // Navigate to target — Firebase should recognize auth from IndexedDB
    await page.goto(dest);
    await page.waitForLoadState('domcontentloaded');

    // Check if we're authenticated
    const loginForm = page.locator('input[type="email"]');
    const authenticatedNav = page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]');
    await Promise.race([
      loginForm.waitFor({ state: 'visible', timeout: 3_000 }),
      authenticatedNav.waitFor({ state: 'visible', timeout: 3_000 }),
    ]).catch(() => {});

    if (!page.url().includes('/login') && !(await loginForm.isVisible().catch(() => false))) {
      // Authenticated via IndexedDB restore
      await markTourCompletedForCurrentUser(page);
      await dismissTourOverlay(page);
      return;
    }
  }

  // Step 2: Fallback — form login (should rarely happen with setup project)
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  const loginForm = page.locator('input[type="email"]');
  await loginForm.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

  if (page.url().includes('/login') || await loginForm.isVisible().catch(() => false)) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    await waitForLoginResult(page);

    await page.waitForSelector(
      '[data-testid="nav-collection"], [data-tour="nav-collection"], nav, .nav',
      { timeout: 10_000 },
    ).catch(() => {});

    await page.evaluate(() => {
      localStorage.setItem('cranial_locale', 'en');
    });
    await markTourCompletedForCurrentUser(page);

    await page.goto(dest);
    await page.waitForLoadState('domcontentloaded');
    await dismissTourOverlay(page);
  } else {
    await markTourCompletedForCurrentUser(page);
    await dismissTourOverlay(page);
  }
}

/**
 * Race between successful redirect and error toast after login submission.
 * Throws immediately if an error toast appears instead of waiting 45s.
 */
export async function waitForLoginResult(page: Page) {
  const errorToast = page.locator('.border-rust').first();
  const result = await Promise.race([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
      .then(() => 'redirected' as const),
    errorToast.waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => 'error' as const),
  ]);
  if (result === 'error') {
    const msg = await errorToast.textContent().catch(() => 'unknown error');
    // Rate-limiting: if Firebase returns wrong-password due to throttling, retry with exponential backoff
    if (msg?.includes('incorrecto') || msg?.includes('incorrect') || msg?.includes('wrong')) {
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const backoffMs = attempt * 3_000; // 3s, 6s, 9s — must fit within 45s test timeout
        await page.waitForTimeout(backoffMs);
        await page.evaluate(() => {
          document.querySelectorAll('.border-rust').forEach((el) => el.remove());
        });
        await page.waitForTimeout(300);

        await page.locator('input[type="email"]').fill(process.env.TEST_USER_A_EMAIL!);
        await page.locator('input[type="password"]').fill(process.env.TEST_USER_A_PASSWORD!);
        await page.locator('button[type="submit"]').click();

        const retryErrorToast = page.locator('.border-rust').first();
        const retryResult = await Promise.race([
          page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
            .then(() => 'redirected' as const),
          retryErrorToast.waitFor({ state: 'visible', timeout: 10_000 })
            .then(() => 'error' as const),
        ]);

        if (retryResult === 'redirected') {
          return;
        }

        if (attempt === MAX_RETRIES) {
          const retryMsg = await retryErrorToast.textContent().catch(() => 'unknown');
          throw new Error(`Login failed after ${MAX_RETRIES} retries (Firebase rate-limiting): ${retryMsg}`);
        }
      }
      return;
    }
    throw new Error(`Login failed: ${msg}. Check credentials and Firebase project.`);
  }
}

/**
 * Mark the tour completed for the currently logged-in user.
 * The tour key is `cranial_tour_completed_{userId}` in localStorage.
 */
async function markTourCompletedForCurrentUser(page: Page) {
  await page.evaluate(() => {
    // Set generic key
    localStorage.setItem('cranial_tour_completed', 'true');
    // Also set all existing user-specific keys to 'true'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cranial_tour_completed')) {
        localStorage.setItem(key, 'true');
      }
    }
    // Try to get the userId from the Pinia auth store
    try {
      const app = (document.querySelector('#app') as any)?.__vue_app__;
      if (app) {
        const pinia = app.config.globalProperties.$pinia;
        if (pinia) {
          const authStore = pinia.state.value.auth;
          if (authStore?.user?.id) {
            localStorage.setItem(`cranial_tour_completed_${authStore.user.id}`, 'true');
          }
        }
      }
    } catch {
      // Fallback: already set generic key above
    }
  });
}

/**
 * Dismiss the WelcomeModal / guided tour overlay if visible.
 * Uses fast DOM removal instead of sequential click fallbacks to avoid
 * accumulated timeouts (the old approach could take 7+ seconds).
 */
async function dismissTourOverlay(page: Page) {
  // Give Vue a tick to render any overlay, then nuke it from the DOM.
  // This is faster and more reliable than clicking Skip → backdrop → DOM removal sequentially.
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    // Remove z-[9999] tour overlay
    document.querySelectorAll('.fixed.inset-0').forEach((el) => {
      const z = (el as HTMLElement).style.zIndex || getComputedStyle(el).zIndex;
      if (z === '9999' || el.classList.toString().includes('9999')) {
        el.remove();
      }
    });
    // Remove driver.js popovers
    document.querySelectorAll('.driver-popover, .driver-overlay').forEach((el) => el.remove());
  });
}
