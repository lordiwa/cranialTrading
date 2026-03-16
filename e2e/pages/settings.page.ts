import { ensureLoggedIn } from '../helpers/auth';
import { type Page, type Locator } from '@playwright/test';

export class SettingsPage {
  readonly page: Page;

  // Password change
  readonly password: {
    toggleButton: Locator;
    currentInput: Locator;
    newInput: Locator;
    confirmInput: Locator;
    submitButton: Locator;
    cancelButton: Locator;
    mismatchError: Locator;
  };

  // Username change
  readonly username: {
    toggleButton: Locator;
    input: Locator;
    availableIndicator: Locator;
    unavailableIndicator: Locator;
    submitButton: Locator;
  };

  // Location change
  readonly location: {
    toggleButton: Locator;
    input: Locator;
    suggestions: Locator;
    detectButton: Locator;
    submitButton: Locator;
  };

  // Avatar
  readonly avatar: {
    preview: Locator;
    urlInput: Locator;
    fileInput: Locator;
    submitButton: Locator;
  };

  // Data management
  readonly data: {
    exportMoxfieldButton: Locator;
    exportManaboxButton: Locator;
    resendVerificationButton: Locator;
    restartTourButton: Locator;
    clearDataButton: Locator;
  };

  constructor(page: Page) {
    this.page = page;

    // The "CHANGE" button is a secondary/small button near the password section
    // Settings page has sections with title and a CHANGE button next to each
    this.password = {
      toggleButton: page.locator('text=/CHANGE PASSWORD/i').locator('..').locator('..').getByRole('button', { name: /change|cambiar/i }),
      currentInput: page.locator('input[placeholder*="urrent"]'),
      newInput: page.locator('input[placeholder*="ew pass"]'),
      confirmInput: page.locator('input[placeholder*="onfirm"]'),
      submitButton: page.getByRole('button', { name: /save|guardar/i }),
      cancelButton: page.getByRole('button', { name: /cancel|cancelar/i }),
      mismatchError: page.locator('text=/don.*t match|no coinciden/i'),
    };

    this.username = {
      toggleButton: page.locator('text=/CHANGE USERNAME|CAMBIAR USUARIO/i').locator('..').locator('..').getByRole('button', { name: /change|cambiar/i }),
      input: page.locator('input[type="text"]').first(),
      availableIndicator: page.locator('text=✓'),
      unavailableIndicator: page.locator('text=✗'),
      submitButton: page.getByRole('button', { name: /save|guardar/i }),
    };

    this.location = {
      toggleButton: page.locator('text=/LOCATION|UBICACIÓN/i').locator('..').locator('..').getByRole('button', { name: /change|cambiar/i }),
      input: page.locator('input[type="text"]').first(),
      suggestions: page.locator('.absolute.z-10'),
      detectButton: page.getByRole('button', { name: /detect|detectar/i }),
      submitButton: page.getByRole('button', { name: /save|guardar/i }),
    };

    this.avatar = {
      preview: page.locator('img[class*="rounded-full"]'),
      urlInput: page.locator('input[type="url"]'),
      fileInput: page.locator('input[type="file"]'),
      submitButton: page.getByRole('button', { name: /update|actualizar|save|guardar/i }),
    };

    this.data = {
      exportMoxfieldButton: page.getByRole('button', { name: /moxfield/i }),
      exportManaboxButton: page.getByRole('button', { name: /manabox/i }),
      resendVerificationButton: page.getByRole('button', { name: /resend|reenviar/i }),
      restartTourButton: page.getByRole('button', { name: /tour|guía/i }),
      clearDataButton: page.getByRole('button', { name: /delete|eliminar|clear|borrar/i }).last(),
    };
  }

  async goto() {
    await this.page.goto('/settings');
    await ensureLoggedIn(this.page, '/settings');
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for settings content to render (not just loading spinner)
    await this.page.locator('text=/CHANGE PASSWORD|CAMBIAR|PASSWORD|USERNAME|USUARIO/i')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});
  }
}
