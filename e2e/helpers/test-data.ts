/**
 * Shared test data and constants for E2E tests.
 */

export const TEST_USER = {
  email: process.env.TEST_USER_A_EMAIL ?? '',
  password: process.env.TEST_USER_A_PASSWORD ?? '',
};

/** Route paths */
export const ROUTES = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/dashboard',
  collection: '/collection',
  search: '/search',
  market: '/market',
  savedMatches: '/saved-matches',
  messages: '/messages',
  settings: '/settings',
  contacts: '/contacts',
  decks: '/decks',
  faq: '/faq',
  terms: '/terms',
  privacy: '/privacy',
  cookies: '/cookies',
} as const;

/** Card conditions used in the app */
export const CONDITIONS = ['M', 'NM', 'LP', 'MP', 'HP', 'PO'] as const;

/** Card statuses used in the app */
export const STATUSES = ['collection', 'sale', 'trade', 'wishlist'] as const;

/** Deck formats */
export const FORMATS = ['vintage', 'modern', 'commander', 'standard', 'custom'] as const;

/** Well-known Scryfall search terms that return results */
export const SEARCH_TERMS = {
  common: 'Lightning Bolt',
  multiface: 'Delver of Secrets',
  noResults: 'zzznonexistentcardxxx',
} as const;

/** Timeouts */
export const TIMEOUTS = {
  toast: 5_000,
  apiResponse: 15_000,
  animation: 500,
} as const;
