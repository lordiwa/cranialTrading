import { type Page } from '@playwright/test';

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

  // Check if we're redirected to login
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 30_000,
    });
    // Wait for Firebase auth to settle and user data to load
    await page.waitForTimeout(3000);

    // Now on /saved-matches with user authenticated.
    // Set locale and mark tour completed BEFORE any navigation.
    await page.evaluate(() => {
      localStorage.setItem('cranial_locale', 'en');
    });
    await markTourCompletedForCurrentUser(page);

    // Force a full page navigation to the target URL.
    // This re-initializes the Vue app, so initI18n() reads locale=en
    // and WelcomeModal reads tour=completed.
    const dest = targetUrl || '/collection';
    await page.goto(dest);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

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
      await page.waitForTimeout(1000);
    } else {
      await markTourCompletedForCurrentUser(page);
    }
    await dismissTourOverlay(page);
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
 * The modal has z-[9999] and blocks all pointer events.
 */
async function dismissTourOverlay(page: Page) {
  // Wait briefly for any overlay to appear
  const overlay = page.locator('.fixed.inset-0.z-\\[9999\\]');
  const overlayVisible = await overlay.isVisible({ timeout: 3000 }).catch(() => false);

  if (!overlayVisible) {
    // Check for driver.js popover
    const driverPopover = page.locator('.driver-popover');
    if (await driverPopover.isVisible({ timeout: 500 }).catch(() => false)) {
      const closeBtn = driverPopover.locator('button.driver-popover-close-btn');
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }
    return;
  }

  // Mark tour completed again (userId should now be available)
  await markTourCompletedForCurrentUser(page);

  // Click Skip button with force to bypass overlay interception
  const skipButton = page.locator('button').filter({ hasText: /skip|saltar|omitir/i });
  if (await skipButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipButton.first().click({ force: true });
    await page.waitForTimeout(800);
    if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) {
      return;
    }
  }

  // Fallback: force-click the backdrop
  const backdrop = overlay.locator('div.absolute.inset-0').first();
  if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
    await backdrop.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Last resort: remove overlay from DOM via JS
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.evaluate(() => {
      document.querySelectorAll('.fixed.inset-0').forEach((el) => {
        if (el.classList.toString().includes('9999') || getComputedStyle(el).zIndex === '9999') {
          el.remove();
        }
      });
    });
    await page.waitForTimeout(300);
  }
}
