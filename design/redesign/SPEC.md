# Cranial Landing Redesign — implementation spec (TASK-086)

Source: Claude Design project "Mobile search-first redesign" → `Cranial Landing Redesign.dc.html`
(+ sub-components Brand / LoginCard / CardResults / Marketing).

## HARD CONSTRAINT from Rafael (2026-06-30)
**Copy the STRUCTURE/layout of the mockup ONLY. Do NOT change fonts or colors.**
- Keep the existing brand font **Brother** for the wordmark (NOT Metal Mania from the mockup).
- Keep existing Tailwind theme tokens for ALL colors: `bg-primary` (#000), `text-silver`/`silver-*`,
  `text-neon`/`neon-*` (#5AC168), `rust`, etc. Do NOT hardcode the mockup hex (#050505, #0b0e0b, #06080a…).
  Map mockup colors to the nearest existing token (mockup is already basically our palette).
- Open Sans stays the body font.

## Goal
Replace the current two-column `LoginView.vue` (search-at-top-of-left-column + right login form)
with a **marketplace, search-first landing** (Card Kingdom style). Full replace, anonymous-facing.

## Reuse (do NOT reinvent)
- Catalog search: the TASK-084 logic already in the tree — `src/utils/loginCardSearch.ts`
  (`applyPricedFirstFilter`, `toMinimalResult`) + `useSearchStore().search({name})`. The existing
  `src/components/search/LoginCardSearch.vue` may be refactored/absorbed into the new results section.
- Auth: existing `authStore.login(email,password)` and `authStore.loginWithGoogle()` + the handlers
  already in LoginView (`handleLogin`, `handleGoogleLogin`). Move the SAME form into the header dropdown.
- Marketing content + i18n: existing keys `landing.*`, `auth.login.*`, `landing.howItWorks.*`,
  `landing.subtitle`, etc. The mockup "Marketing" block == existing How-It-Works (3 steps) — reuse it.
- Router: `/login` stays `requiresGuest`. No guard changes. Deeper actions still gate to `/register`.

## New structure (desktop)
Marketplace header (replaces the two columns):
- **Header row 1** (`bg-primary`, bottom border `neon`-tinted): `[Brother wordmark "CRANIAL TRADING"]`
  · **centered full-width search** (neon border, rounded, magnifier icon, input, `BUSCAR` filled-neon button,
  max-width ~560px) · right cluster: **"Iniciar sesión"** (person icon → toggles a dropdown showing the
  login form card) + **"Quiero"** (heart icon, optional — can gate to register).
- **Header row 2** (categories): links `CATÁLOGO`, `CÓMO FUNCIONA`, `COMUNIDAD` + right-aligned
  `CREAR CUENTA GRATIS` button (filled neon). Defaults for targets: CATÁLOGO → focus the search input;
  CÓMO FUNCIONA → scroll to the marketing/how-it-works section; COMUNIDAD → for now scroll-to-footer or
  hide (pick the lightest; note it). CREAR CUENTA → RouterLink `/register`.
- **Body** = toggle on `hasSearched/active`:
  - **idle** → hero banner ("From Trash to Treasures", badge "Sin cuenta · Sin comisiones · Sin
    intermediarios", primary CTA "EMPEZÁ A BUSCAR ↑" that focuses search, secondary "Crear Cuenta Gratis",
    popular-search chips) → Marketing (How It Works) → footer strip CTA.
  - **active** (query non-empty) → "Resultados para «q»" + the real catalog results grid.

## Login dropdown (from "Iniciar sesión")
The existing login form (email, password, INGRESAR, divider "o continúa con", Google button,
forgot-password link, register link), restyled compact in a `neon`-bordered card, shown in an absolute
dropdown under the header button. Same handlers/behavior. Close on outside-click.

## Results grid (CardResults)
Three states (reuse `loginCardSearch` results):
- **empty** (no query): prompt "Buscá cualquier carta de Magic" + popular chips.
- **no results** (query, 0 results): "Sin resultados. Probá con otro nombre."
- **grid** (query, >0): responsive grid `minmax(132px,1fr)`, each card = image/art + name + set·type +
  price (priced-first, `toFixed(2)`) + **"Quiero esta"** button → opens the registration-prompt modal.

## Registration-prompt modal (gate)
Replaces the plain toast+redirect for "Quiero esta"/trade intent. Centered modal: heart icon, title
"Creá tu cuenta para tradear", body "Para proponer un intercambio por «card» necesitás una cuenta…",
primary "CREAR CUENTA GRATIS" → `/register`, secondary "Ya tengo cuenta — Iniciar sesión" → opens login
dropdown (or `/login` focus), close on backdrop. Use existing modal patterns if convenient; keep light.

## Mobile (search-first, the whole point)
- Sticky header: `[hamburger]` · centered Brother wordmark · `[person icon]`.
- **Full-width search bar directly under the header row** (first content).
- Hamburger → dropdown with the category links. Person icon → inline sign-in sheet (the login card).
- Body: same idle (mobile hero + marketing + CTA) vs active (results) toggle. Search is the first thing.
- This resolves the prior mobile problem (login form was `order-first`); now login is a header action, search is first.

## Behavior / logic to TDD
- The idle↔active toggle derived from query (`active = q.trim().length>0`) — pure, testable.
- Popular-search chips: clicking sets the query and runs search.
- "Quiero esta" → sets `regCard` + opens modal (no auth side effects).
- Keep priced-first filter + `toMinimalResult` (already unit-tested).
Add unit tests for any NEW pure helper; reuse existing tests for loginCardSearch.

## i18n (Rule 3)
All visible strings via `t()` in en/es/pt. Reuse existing keys where they exist; add new ones
(header search placeholder, category labels, hero badge, "Quiero esta", reg-modal copy, popular chips
label) to ALL THREE locales in the same step. Verify before use.

## Gates (Rule 7)
`npm run test:unit` green · `npm run type-check` (vue-tsc exit 0) · `npx vite build` ok.
No commit — leave in working tree for orchestrator review.
