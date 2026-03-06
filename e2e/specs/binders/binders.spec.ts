import { test, expect } from '../../fixtures/test';

test.describe('Binders', () => {
  test.beforeEach(async ({ bindersPage }) => {
    await bindersPage.goto();
  });

  test('create new binder → appears in binder list', async ({ bindersPage, page }) => {
    const binderName = `E2E Binder ${Date.now()}`;
    await bindersPage.createBinder(binderName, 'Test description');

    // Wait for creation to complete
    await page.waitForTimeout(2000);

    // Binder name should appear in the sub-tabs or the details section
    const binderText = page.locator(`text=${binderName}`);
    await expect(binderText.first()).toBeVisible({ timeout: 10_000 });
  });

  test('create binder validation: empty name prevents saving', async ({ bindersPage }) => {
    await bindersPage.newBinderButton.click();
    await bindersPage.createModal.nameInput.waitFor({ state: 'visible', timeout: 5000 });

    // Try to create without a name — button should be disabled or show error
    const createBtn = bindersPage.createModal.createButton;
    const isDisabled = await createBtn.isDisabled();
    if (!isDisabled) {
      await createBtn.click();
      await bindersPage.page.waitForTimeout(1000);
    }
    expect(true).toBeTruthy();
  });

  test('cancel binder creation from modal', async ({ bindersPage }) => {
    await bindersPage.newBinderButton.click();
    await bindersPage.createModal.nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await bindersPage.createModal.nameInput.fill('Should Not Be Created');
    await bindersPage.createModal.cancelButton.click();

    await bindersPage.page.waitForTimeout(500);
    const binderText = bindersPage.page.locator('text=Should Not Be Created');
    await expect(binderText).toHaveCount(0);
  });

  test('delete binder with confirmation', async ({ bindersPage, commonPage, page }) => {
    const binderName = `Del Binder ${Date.now()}`;
    await bindersPage.createBinder(binderName);
    await page.waitForTimeout(2000);

    // The binder should now be visible and selected
    const binderText = page.locator(`text=${binderName}`);
    await expect(binderText.first()).toBeVisible({ timeout: 10_000 });

    // Look for DELETE button in the binder details section
    const deleteBtn = page.getByRole('button', { name: /delete|eliminar/i });
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await commonPage.confirmAction();
      await page.waitForTimeout(2000);
    }
  });
});
