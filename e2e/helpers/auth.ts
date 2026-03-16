import { type Page } from '@playwright/test';

/**
 * Race a promise against a hard timeout to prevent hangs.
 * Used around browser-context async operations (IndexedDB) that have no built-in timeout.
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
 * Cached Firebase auth state to avoid re-login per test.
 * Firebase rate-limits sequential signInWithEmailAndPassword calls (~20/min),
 * causing CI failures when 30+ tests each login independently.
 * After the first successful login we cache the IndexedDB + localStorage state
 * and restore it on subsequent test pages, bypassing the login form entirely.
 */
let cachedAuth: { indexedDB: any[]; localStorage: Record<string, string> } | null = null;

/**
 * Ensure the page is authenticated. If we're on the login page,
 * perform a login then navigate to the target URL.
 * Firebase stores auth in indexedDB which isn't captured by
 * Playwright's storageState, so we login per-context.
 */
export async function ensureLoggedIn(page: Page, targetUrl?: string) {
  const email = process.env.TEST_USER_A_EMAIL;
  const password = process.env.TEST_USER_A_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD');
  }

  const dest = targetUrl || '/collection';

  // Try restoring cached auth state (avoids Firebase rate-limiting on CI)
  if (cachedAuth && cachedAuth.indexedDB.length > 0) {
    const restored = await restoreCachedAuth(page, dest);
    if (restored) return;
    // If restore failed, fall through to form login
  }

  // Wait for Vue to bootstrap and either show login form or authenticated nav.
  // page.goto resolves on initial HTML load, before Vue's client-side redirect.
  await page.waitForLoadState('domcontentloaded');
  const loginForm = page.locator('input[type="email"]');
  const authenticatedNav = page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]');
  await Promise.race([
    loginForm.waitFor({ state: 'visible', timeout: 5_000 }),
    authenticatedNav.waitFor({ state: 'visible', timeout: 5_000 }),
  ]).catch(() => {
    // Neither appeared — fall through to URL check
  });

  if (page.url().includes('/login') || await loginForm.isVisible().catch(() => false)) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Race: redirect away from /login vs error toast
    await waitForLoginResult(page);

    // Wait for authenticated UI to be ready instead of hardcoded timeout
    await page.waitForSelector(
      '[data-testid="nav-collection"], [data-tour="nav-collection"], nav, .nav',
      { timeout: 10_000 },
    ).catch(() => {
      // Not critical — some pages may not have nav visible immediately
    });

    // Cache auth state for subsequent tests
    await saveAuthState(page);

    // Set locale and mark tour completed BEFORE any navigation.
    await page.evaluate(() => {
      localStorage.setItem('cranial_locale', 'en');
    });
    await markTourCompletedForCurrentUser(page);

    // Force a full page navigation to the target URL.
    // This re-initializes the Vue app, so initI18n() reads locale=en
    // and WelcomeModal reads tour=completed.
    await page.goto(dest);
    await page.waitForLoadState('domcontentloaded');

    // Dismiss any overlay that still appears (shouldn't with tour key set)
    await dismissTourOverlay(page);
  } else {
    // Not on login page — ensure locale is English anyway
    const currentLocale = await page.evaluate(() => localStorage.getItem('cranial_locale'));
    if (currentLocale !== 'en') {
      await page.evaluate(() => {
        localStorage.setItem('cranial_locale', 'en');
      });
      await markTourCompletedForCurrentUser(page);
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
    } else {
      await markTourCompletedForCurrentUser(page);
    }
    await dismissTourOverlay(page);
  }
}

/**
 * Save Firebase auth state (IndexedDB + localStorage) after successful login.
 */
async function saveAuthState(page: Page) {
  try {
    const ls = await page.evaluate(() => {
      const result: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) result[k] = localStorage.getItem(k) || '';
      }
      return result;
    });

    const idb = await withTimeout(
      page.evaluate(() => {
        return new Promise<any[]>((resolve) => {
          const req = indexedDB.open('firebaseLocalStorageDb');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('firebaseLocalStorage', 'readonly');
              const store = tx.objectStore('firebaseLocalStorage');
              const keys = store.getAllKeys();
              const values = store.getAll();
              tx.oncomplete = () => {
                const entries = keys.result.map((key: any, i: number) => ({
                  key, value: values.result[i],
                }));
                db.close();
                resolve(entries);
              };
            } catch { db.close(); resolve([]); }
          };
          req.onerror = () => resolve([]);
        });
      }),
      5_000,
      'saveAuthState IndexedDB read',
    );

    if (idb.length > 0) {
      cachedAuth = { indexedDB: idb, localStorage: ls };
    }
  } catch {
    // Non-critical — next test will just login via form
  }
}

/**
 * Restore cached Firebase auth state into a fresh page, bypassing the login form.
 * Returns true if auth was restored and the page is on the target URL.
 */
async function restoreCachedAuth(page: Page, targetUrl: string): Promise<boolean> {
  try {
    // Navigate to the app origin first (needed for IndexedDB/localStorage access)
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Restore localStorage
    await page.evaluate((ls) => {
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, cachedAuth!.localStorage);

    // Restore IndexedDB (Firebase auth tokens) — with timeout to prevent hangs
    await withTimeout(
      page.evaluate(async (entries) => {
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
            for (const entry of entries) {
              store.put(entry.value, entry.key);
            }
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
          req.onerror = () => reject(req.error);
        });
      }, cachedAuth!.indexedDB),
      5_000,
      'restoreCachedAuth IndexedDB write',
    );

    // Navigate to target — Firebase should recognize auth from IndexedDB
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait briefly for Vue router to settle
    const loginForm = page.locator('input[type="email"]');
    const authenticatedNav = page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]');
    await Promise.race([
      loginForm.waitFor({ state: 'visible', timeout: 3_000 }),
      authenticatedNav.waitFor({ state: 'visible', timeout: 3_000 }),
    ]).catch(() => {});

    // If we ended up on login, the cached token expired — invalidate cache
    if (page.url().includes('/login') || await loginForm.isVisible().catch(() => false)) {
      cachedAuth = null;
      return false;
    }

    // Success — locale and tour should already be set from cached localStorage
    await markTourCompletedForCurrentUser(page);
    await dismissTourOverlay(page);
    return true;
  } catch {
    cachedAuth = null;
    return false;
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
    // Rate-limiting: if Firebase returns wrong-password due to throttling, wait and retry once
    if (msg?.includes('incorrecto') || msg?.includes('incorrect') || msg?.includes('wrong')) {
      await page.waitForTimeout(3000);
      await errorToast.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
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
