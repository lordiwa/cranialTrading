import { type Page } from '@playwright/test';

/**
 * Ensure the page is authenticated.
 *
 * With browserLocalPersistence + Playwright storageState, the browser
 * already has Firebase auth tokens in localStorage when the test starts.
 * This function just navigates to the target URL and verifies auth.
 * Falls back to form login only as a safety net.
 */
export async function ensureLoggedIn(page: Page, targetUrl?: string) {
  const email = process.env.TEST_USER_A_EMAIL;
  const password = process.env.TEST_USER_A_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing TEST_USER_A_EMAIL or TEST_USER_A_PASSWORD');
  }

  const dest = targetUrl || '/collection';

  // Navigate to target — storageState should already have auth tokens
  await page.goto(dest);
  await page.waitForLoadState('domcontentloaded');

  // Check if we're authenticated
  const loginForm = page.locator('input[type="email"]');
  const authenticatedNav = page.locator('[data-testid="nav-collection"], [data-tour="nav-collection"]');
  await Promise.race([
    loginForm.waitFor({ state: 'visible', timeout: 5_000 }),
    authenticatedNav.waitFor({ state: 'visible', timeout: 5_000 }),
  ]).catch(() => {});

  if (page.url().includes('/login') || await loginForm.isVisible().catch(() => false)) {
    // Fallback: form login (should rarely happen with storageState)
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
    // Rate-limiting: Firebase returns various error messages when throttled
    if (msg?.includes('incorrecto') || msg?.includes('incorrect') || msg?.includes('wrong') || msg?.includes('Invalid')) {
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const backoffMs = attempt * 3_000;
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
 */
async function markTourCompletedForCurrentUser(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('cranial_tour_completed', 'true');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cranial_tour_completed')) {
        localStorage.setItem(key, 'true');
      }
    }
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
    } catch { /* fallback: generic key already set */ }
  });
}

/**
 * Dismiss the WelcomeModal / guided tour overlay if visible.
 */
async function dismissTourOverlay(page: Page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0').forEach((el) => {
      const z = (el as HTMLElement).style.zIndex || getComputedStyle(el).zIndex;
      if (z === '9999' || el.classList.toString().includes('9999')) {
        el.remove();
      }
    });
    document.querySelectorAll('.driver-popover, .driver-overlay').forEach((el) => el.remove());
  });
}
