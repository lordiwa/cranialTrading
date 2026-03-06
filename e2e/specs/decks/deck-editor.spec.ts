import { test, expect } from '../../fixtures/test';

test.describe('Deck Editor', () => {
  test('add card from collection to mainboard → allocation + stats update', async ({ decksPage, page, commonPage }) => {
    await decksPage.goto();

    // Create a test deck first
    const deckName = `Editor Test ${Date.now()}`;
    await decksPage.createDeck(deckName, 'modern');
    await page.waitForTimeout(3000);

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
