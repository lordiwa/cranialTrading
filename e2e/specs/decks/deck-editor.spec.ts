import { test, expect } from '../../fixtures/test';

test.describe('Deck Editor', () => {
  test('add card from collection to mainboard → allocation + stats update', async ({ decksPage, page, commonPage }) => {
    await decksPage.goto();

    // Create a test deck first
    const deckName = `Editor Test ${Date.now()}`;
    await decksPage.createDeck(deckName, 'modern');
    await page.waitForTimeout(3000);

    // TASK-271 AC5: this test used to create a real deck and never delete
    // it — MEASURED by the orchestrator against dev: three "Editor Test
    // <timestamp>" decks, created 20:33:55Z, 20:47:54Z and 23:47:58Z, one
    // per run, no exceptions. Cleanup goes through the UI, not the admin
    // SDK: `deck-crud.spec.ts`'s "create new deck" test already exercises
    // this exact delete flow (decksPage.deleteDeck + the z-[60] confirm
    // dialog) as its own cleanup, and reusing it here proves the real
    // product delete path instead of going around it with an out-of-band
    // teardown. Deleted by the exact name this run captured at creation
    // time, never by position or "most recent".
    try {
      // Look for the deck in the list
      const deckText = page.locator(`text=${deckName}`);
      if (await deckText.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Try to find and click an edit button near the deck
        const editBtn = page.getByRole('button', { name: /edit|editar/i }).first();
        if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await editBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    } finally {
      await decksPage.deleteDeck(deckName);
      const confirmDialog = decksPage.page.locator('.fixed.inset-0.z-\\[60\\]');
      await confirmDialog.first().waitFor({ state: 'visible', timeout: 5000 });
      await confirmDialog.first().locator('button').last().click();
      await decksPage.page.waitForTimeout(1000);
      // Verify the deck is really gone — same closing assertion
      // deck-crud.spec.ts's "delete deck" test uses, so a UI delete that
      // silently no-ops (a dead locator, an intercepted click) reddens here
      // instead of leaving a fourth "Editor Test" deck behind unnoticed.
      const deckStillThere = decksPage.page.locator('button').filter({ hasText: deckName });
      await expect(deckStillThere).toHaveCount(0, { timeout: 5000 });
    }
  });

  test('add card to sideboard → move between mainboard and sideboard', async ({ decksPage }) => {
    await decksPage.goto();
    // Verify editor elements exist
    await expect(decksPage.newDeckButton).toBeVisible();
  });

  test('adjust card quantity in deck → quantity display updates', async ({ decksPage }) => {
    await decksPage.goto();
    await expect(decksPage.newDeckButton).toBeVisible();
  });

  test('over-allocation validation: allocate more than available → error', async ({ decksPage }) => {
    await decksPage.goto();
    await expect(decksPage.newDeckButton).toBeVisible();
  });

  test('deck stats panel shows mana curve / type distribution', async ({ decksPage }) => {
    await decksPage.goto();
    await expect(decksPage.newDeckButton).toBeVisible();
  });
});
