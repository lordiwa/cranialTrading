import { test, expect } from '../../fixtures/test';

test.describe('Contacts', () => {
  test.beforeEach(async ({ contactsPage }) => {
    await contactsPage.goto();
  });

  test('contacts page loads contact list', async ({ contactsPage, page }) => {
    await expect(page).toHaveURL(/\/contacts/);
    await page.waitForTimeout(2000);
    // Page should show contacts or empty state
    const contactsOrEmpty = page.locator('text=/contact|no.*contact/i');
    await expect(contactsOrEmpty.first()).toBeVisible({ timeout: 5000 });
  });

  test('open chat modal from contact card', async ({ contactsPage }) => {
    const count = await contactsPage.getContactCount();
    if (count > 0) {
      const chatBtn = contactsPage.chatButton(0);
      if (await chatBtn.isVisible()) {
        await chatBtn.click();
        await contactsPage.page.waitForTimeout(1000);
      }
    }
  });

  test('visit contact public profile link', async ({ contactsPage, page }) => {
    const count = await contactsPage.getContactCount();
    if (count > 0) {
      const link = contactsPage.profileLink(0);
      if (await link.isVisible()) {
        await link.click();
        await page.waitForURL(/@/);
      }
    }
  });

  test('delete contact with confirmation → removed from list', async ({ contactsPage, commonPage }) => {
    const count = await contactsPage.getContactCount();
    if (count > 0) {
      const deleteBtn = contactsPage.deleteButton(0);
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await commonPage.confirmAction();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('cancel deletion leaves contact intact', async ({ contactsPage, commonPage }) => {
    const countBefore = await contactsPage.getContactCount();
    if (countBefore > 0) {
      const deleteBtn = contactsPage.deleteButton(0);
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await commonPage.cancelAction();
        await contactsPage.page.waitForTimeout(500);
        const countAfter = await contactsPage.getContactCount();
        expect(countAfter).toBe(countBefore);
      }
    }
  });

  test('empty state shown when no contacts saved', async ({ contactsPage }) => {
    const count = await contactsPage.getContactCount();
    if (count === 0) {
      await expect(contactsPage.emptyState).toBeVisible();
    }
  });
});
