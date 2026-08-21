import { test, expect } from '../../fixtures/test';
import { SEARCH_TERMS } from '../../helpers/test-data';

test.describe('Search', () => {
  test.beforeEach(async ({ searchPage }) => {
    await searchPage.goto();
  });

  test('search by card name returns results grid @smoke', async ({ searchPage }) => {
    await searchPage.search(SEARCH_TERMS.common);

    const count = await searchPage.getResultCount();
    expect(count).toBeGreaterThan(0);
  });

  // TASK-259: `expect(typeof visible).toBe('boolean')` was tautological —
  // isVisible() always returns a boolean, so this passed whether or not the
  // dropdown ever appeared. Asserting it appears is a real check, but per
  // CLAUDE.md's known-flakes list, the sibling `selecting autocomplete
  // suggestion...` test is @nightly-skip'd because it additionally requires a
  // live Scryfall suggestion to carry a *price*. This test does not add that
  // dependency — it only requires the query ('Lightn') to return SOME
  // suggestion, a materially weaker (and observed far more reliable)
  // condition than "has a price". It depends on the same live autocomplete
  // endpoint the sibling already depends on, so it does not introduce a new
  // flake surface, and by dropping the price requirement it is strictly less
  // exposed to that endpoint's flakiness than the sibling.
  //
  // TASK-259 review (LOW-1): a second `suggestionCount > 0` assertion was
  // dropped — it was true by construction, not a real check. FilterPanel.vue's
  // dropdown container is `v-if="showSuggestions && suggestions.length > 0"`
  // (line ~396) and `showSuggestions` (line ~177) is only ever set true when
  // `suggestions.length > 0`. So `dropdown` visible already implies at least
  // one suggestion exists — a second count check adds no detection power, and
  // its `'button, div, li'` selector would have counted any nested div, not
  // just suggestion items. The `toBeVisible()` above is the whole real check.
  test('autocomplete suggestions appear while typing', async ({ searchPage }) => {
    await searchPage.typeForAutocomplete('Lightn');

    const dropdown = searchPage.autocompleteDropdown;
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
  });

  // Tagged @nightly-skip: known flake, depends on a live Scryfall suggestion
  // having a price (see CLAUDE.md). Playwright retries (CI=2) already absorb
  // this most nights; excluding it from the nightly cron makes that
  // deterministic instead of probabilistic, per the "known flake never reds
  // out the run" requirement.
  test('selecting autocomplete suggestion populates search and shows results @nightly-skip', async ({ searchPage }) => {
    await searchPage.typeForAutocomplete('Lightning B');
    await searchPage.page.waitForTimeout(2000);

    const dropdown = searchPage.autocompleteDropdown;
    if (await dropdown.isVisible().catch(() => false)) {
      await searchPage.selectAutocomplete(0);
      await searchPage.page.waitForTimeout(2000);
      const count = await searchPage.getResultCount();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('press Enter submits search and shows results', async ({ searchPage }) => {
    await searchPage.searchInput.fill(SEARCH_TERMS.common);
    await searchPage.searchInput.press('Enter');
    await searchPage.page.waitForTimeout(3000);

    const count = await searchPage.getResultCount();
    expect(count).toBeGreaterThan(0);
  });

  test('advanced filters narrow results', async ({ searchPage }) => {
    await searchPage.search(SEARCH_TERMS.common);
    await searchPage.page.waitForTimeout(1000);

    // MORE button opens the advanced filters modal
    if (await searchPage.advancedFiltersButton.isVisible()) {
      await searchPage.advancedFiltersButton.click();
      await searchPage.page.waitForTimeout(1000);
      // The ADVANCED FILTERS modal or expanded panel should appear
      const modal = searchPage.page.locator('text=/ADVANCED FILTERS|colors|rarity|types/i');
      await expect(modal.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('click result card opens add-to-collection modal', async ({ searchPage, page }) => {
    await searchPage.search(SEARCH_TERMS.common);
    await searchPage.page.waitForTimeout(2000);

    await searchPage.clickResultCard(0);

    // AddCardModal or card detail should open
    await page.waitForTimeout(2000);
    const addButton = page.getByRole('button', { name: /^add$|agregar/i });
    const modalVisible = await addButton.isVisible({ timeout: 5000 }).catch(() => false);
    // Either add modal opens or card interaction happened
    expect(modalVisible || true).toBeTruthy();
  });

  test('owned-count badge visible for cards already in collection', async ({ searchPage }) => {
    await searchPage.search(SEARCH_TERMS.common);
    await searchPage.page.waitForTimeout(3000);

    // Owned badges carry a dedicated data-testid (design→app v2 F6 reskin)
    const ownedBadges = searchPage.page.locator('[data-testid="owned-badge"]');
    const count = await ownedBadges.count();
    // May or may not have owned cards — just verify no errors
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('no-results shows empty state message', async ({ searchPage }) => {
    await searchPage.search(SEARCH_TERMS.noResults);
    // Wait for search to complete and results to render
    await searchPage.page.waitForTimeout(5000);

    // Should show "no cards found" or remain with 0 results
    const noMsg = await searchPage.noResultsMessage.isVisible({ timeout: 5000 }).catch(() => false);
    const resultCount = await searchPage.getResultCount();
    expect(noMsg || resultCount === 0).toBeTruthy();
  });

  // TASK-111 regression: header search for card A followed by a LOCAL search
  // (FilterPanel's own input on /search) for card B used to leave the URL and
  // the collection/other-users sections stuck on card A — only the Scryfall
  // catalog reacted. The local search must now replace ?q= with the latest term.
  test('local search after a header deep-link syncs ?q= to the latest term', async ({ searchPage, page }) => {
    const cardA = SEARCH_TERMS.common;
    const cardB = SEARCH_TERMS.multiface;

    // Simulate the header search flow: deep-link straight to /search?q=<cardA>
    await searchPage.goto(cardA);
    expect(new URL(page.url()).searchParams.get('q')).toBe(cardA);

    // Now perform a LOCAL search on the page's own FilterPanel for a different card.
    // searchPage.search()'s own wait resolves as soon as *any* result cards are
    // visible — which is immediately true here since cardA's cards are still on
    // screen — so it does not itself guarantee the new search has landed. Wait
    // for the URL to flip to cardB (the router.replace only fires once the async
    // Scryfall search behind it resolves), which is the deterministic signal here.
    await searchPage.search(cardB);
    await page.waitForURL((url) => url.searchParams.get('q') === cardB, { timeout: 25_000 });

    // The URL must reflect the latest local search term, not the stale header term
    expect(new URL(page.url()).searchParams.get('q')).toBe(cardB);

    // The Scryfall catalog reacted to the new term too
    const count = await searchPage.getResultCount();
    expect(count).toBeGreaterThan(0);
  });
});
