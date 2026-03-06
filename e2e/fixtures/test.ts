import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { RegisterPage } from '../pages/register.page';
import { ForgotPasswordPage } from '../pages/forgot-password.page';
import { ResetPasswordPage } from '../pages/reset-password.page';
import { CollectionPage } from '../pages/collection.page';
import { SearchPage } from '../pages/search.page';
import { DecksPage } from '../pages/decks.page';
import { BindersPage } from '../pages/binders.page';
import { PreferencesPage } from '../pages/preferences.page';
import { MatchesPage } from '../pages/matches.page';
import { MessagesPage } from '../pages/messages.page';
import { MarketPage } from '../pages/market.page';
import { ContactsPage } from '../pages/contacts.page';
import { SettingsPage } from '../pages/settings.page';
import { UserProfilePage } from '../pages/user-profile.page';
import { NavigationPage } from '../pages/navigation.page';
import { CommonPage } from '../pages/common.page';

type Fixtures = {
  loginPage: LoginPage;
  registerPage: RegisterPage;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  collectionPage: CollectionPage;
  searchPage: SearchPage;
  decksPage: DecksPage;
  bindersPage: BindersPage;
  preferencesPage: PreferencesPage;
  matchesPage: MatchesPage;
  messagesPage: MessagesPage;
  marketPage: MarketPage;
  contactsPage: ContactsPage;
  settingsPage: SettingsPage;
  userProfilePage: UserProfilePage;
  navigationPage: NavigationPage;
  commonPage: CommonPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  registerPage: async ({ page }, use) => { await use(new RegisterPage(page)); },
  forgotPasswordPage: async ({ page }, use) => { await use(new ForgotPasswordPage(page)); },
  resetPasswordPage: async ({ page }, use) => { await use(new ResetPasswordPage(page)); },
  collectionPage: async ({ page }, use) => { await use(new CollectionPage(page)); },
  searchPage: async ({ page }, use) => { await use(new SearchPage(page)); },
  decksPage: async ({ page }, use) => { await use(new DecksPage(page)); },
  bindersPage: async ({ page }, use) => { await use(new BindersPage(page)); },
  preferencesPage: async ({ page }, use) => { await use(new PreferencesPage(page)); },
  matchesPage: async ({ page }, use) => { await use(new MatchesPage(page)); },
  messagesPage: async ({ page }, use) => { await use(new MessagesPage(page)); },
  marketPage: async ({ page }, use) => { await use(new MarketPage(page)); },
  contactsPage: async ({ page }, use) => { await use(new ContactsPage(page)); },
  settingsPage: async ({ page }, use) => { await use(new SettingsPage(page)); },
  userProfilePage: async ({ page }, use) => { await use(new UserProfilePage(page)); },
  navigationPage: async ({ page }, use) => { await use(new NavigationPage(page)); },
  commonPage: async ({ page }, use) => { await use(new CommonPage(page)); },
});

export { expect };
