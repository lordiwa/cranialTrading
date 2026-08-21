import { type Page, type Locator } from '@playwright/test';

export class UserProfilePage {
  readonly page: Page;
  readonly avatar: Locator;
  readonly username: Locator;
  readonly location: Locator;
  readonly contactButton: Locator;
  readonly wishlistLink: Locator;
  readonly searchInput: Locator;
  readonly cardGrid: Locator;
  readonly notFoundMessage: Locator;
  // TASK-256: resolveUsernameToUid trusts the /usernames/{norm} index pointer
  // without checking the resolved doc's `username` field still matches —
  // measured live on dev: /usernames/rafael points at an orphaned doc whose
  // username field is now something else entirely, and the profile renders
  // it anyway. `username` alone (any <h1> visible) does not catch that; a
  // test needs the actual text.
  readonly resultTotal: Locator;
  readonly filteredEmptyState: Locator;
  // TASK-256 AC1/own-profile: the header.profile.viewPublicProfile i18n string
  // ("View my public profile") is reused by BOTH the popover trigger button
  // and the link inside it (UserPopover.vue) — the two are distinguished by
  // ARIA role, not text. e2e/auth.setup.ts fixes the locale to English.
  readonly viewPublicProfileLabel = 'View my public profile';

  constructor(page: Page) {
    this.page = page;
    this.avatar = page.locator('img[class*="rounded-full"]');
    this.username = page.locator('h1').first();
    // v2 redesign (design→app v2 F8) — profile header dropped the 📍 emoji glyph
    // per cranial-design/prototype/22-user-profile-*.html; select by test id instead.
    this.location = page.locator('[data-testid="profile-location"]').first();
    // TASK-256: scoped to <main> for both. The global nav header ALSO has a
    // persistent "Wishlist" link (same href, always visible while logged in,
    // on ANY profile) — an unscoped locator matched it too, so it never
    // actually distinguished "own profile" from "someone else's profile".
    this.contactButton = page.locator('main').getByRole('button', { name: /contact|contactar/i });
    this.wishlistLink = page.locator('main a', { hasText: /wishlist|deseado/i });
    // TASK-256: scoped to <main> — the header's global card-search combobox
    // is ALSO `input[type="text"]` and sits before this one in DOM order, so
    // an unscoped `.first()` silently typed into the wrong box.
    this.searchInput = page.locator('main input[type="text"]').first();
    this.cardGrid = page.locator('.grid').first();
    this.notFoundMessage = page.locator('text=/not found|no encontrad/i');
    this.resultTotal = page.locator('[data-testid="profile-result-total"]');
    this.filteredEmptyState = page.locator('[data-testid="profile-filtered-empty"]');
  }

  async goto(username: string) {
    await this.page.goto(`/@${username}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterCards(searchTerm: string) {
    await this.searchInput.fill(searchTerm);
  }
}
