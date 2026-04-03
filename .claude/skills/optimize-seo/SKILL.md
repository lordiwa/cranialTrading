---
name: optimize-seo
description: Run an SEO audit via the seo agent, categorize findings, and generate an actionable implementation plan with optional fix execution
user-invocable: true
disable-model-invocation: true
---

# Optimize SEO Workflow

You drive the end-to-end SEO optimization process: audit, categorize, plan, and optionally implement. This skill orchestrates the SEO agent for analysis and the dev agent for fixes.

## Step 1: Audit Current State

Spawn the **seo** agent to perform a full audit of the app's SEO posture.

Pass this prompt to the agent:
> "Perform a full SEO audit across all 9 dimensions. Scope: all public routes and the app shell. Include SEO score calculation."

Wait for the audit report. Summarize the key findings to the user:

```
SEO Audit Complete
==================
Overall Score: X/100

Critical (P0): {count} findings
High (P1):     {count} findings
Medium (P2):   {count} findings

Top 3 issues:
1. <finding>
2. <finding>
3. <finding>
```

## Step 2: Categorize Findings

Organize all findings from the audit into an actionable matrix:

### Critical (P0) — Blocks indexing or causes penalties
These must be fixed before any SEO benefit is possible.

| # | Finding | Files to change | Effort |
|---|---------|----------------|--------|
| 1 | ... | ... | S/M/L |

### High (P1) — Meaningful ranking improvement
These provide the most SEO value for effort invested.

| # | Finding | Files to change | Effort |
|---|---------|----------------|--------|
| 1 | ... | ... | S/M/L |

### Medium (P2) — Competitive advantage
Nice-to-have improvements for a polished SEO posture.

| # | Finding | Files to change | Effort |
|---|---------|----------------|--------|
| 1 | ... | ... | S/M/L |

Present this matrix to the user and ask: "Which priority level should we plan implementation for? (Critical only / Critical + High / All)"

## Step 3: Generate Implementation Plan

For each finding the user wants to address, provide specific implementation guidance:

```
Finding: <description>
Priority: P0/P1/P2
Effort: S (< 30 min) / M (30 min - 2 hours) / L (2+ hours)

Files to create:
- path/to/new-file — purpose

Files to modify:
- path/to/file.ts:line — what to change

Implementation:
1. <specific step>
2. <specific step>
3. <specific step>

Dependencies:
- <npm package to install, if any>
- <other findings that must be done first>

Verification:
- <how to confirm this fix works>
```

### Common implementation patterns for this project:

#### Install @unhead/vue (foundation for all meta tag work)
```bash
npm install @unhead/vue
```
- Register in `src/main.ts` with `createHead()` and `app.use(head)`
- Use `useHead()` in views for per-route meta
- Use `useSeoMeta()` for structured SEO fields

#### Create robots.txt
- File: `public/robots.txt`
- Allow public routes, disallow protected routes
- Reference sitemap URL

#### Create sitemap.xml
- File: `public/sitemap.xml` (static for fixed routes)
- For dynamic routes (`/@:username`): consider a Cloud Function that generates the sitemap from Firestore user data

#### Add per-route titles
- In `src/router/index.ts`: add `meta.title` and `meta.description` to each route
- In `src/App.vue` or a `router.afterEach()`: use `useHead()` to set title from route meta
- Pattern: `{pageTitle} | Cranial Trading`

#### Add OG tags for public pages
- In each public view: use `useSeoMeta()` with `og:title`, `og:description`, `og:image`, `og:url`
- Create a default OG image in `public/og-default.png` (1200x630)

#### Add hreflang tags
- In `src/App.vue` or a composable: generate `<link rel="alternate" hreflang="es" href="...">` for each locale
- Watch locale changes and update dynamically

#### Add structured data
- Create a composable `src/composables/useStructuredData.ts`
- Use `useHead()` to inject `<script type="application/ld+json">` blocks
- Add WebSite schema on root, FAQPage on `/faq`, ProfilePage on `/@:username`

#### Set up prerendering for static public pages
- Install `vite-plugin-prerender` or use `vite-ssg`
- Configure routes to prerender: `/faq`, `/terms`, `/privacy`, `/cookies`, `/login`, `/register`
- For `/@:username`: use Firebase Cloud Function for dynamic prerendering to crawler user agents

### i18n considerations (CLAUDE.md Rule 3 & 6):
- Any new i18n keys for meta descriptions MUST be added to all 3 locale files (`en.json`, `es.json`, `pt.json`)
- Meta descriptions should be properly translated, not just copied
- Page titles should follow the same `{translatedTitle} | Cranial Trading` pattern in all languages

## Step 4: Estimate Total Effort

Sum up the effort for all planned fixes and present a timeline:

```
Implementation Plan Summary
============================

Phase 1: Foundations (estimated: X hours)
-----------------------------------------
1. [S] Install @unhead/vue and register plugin
2. [S] Create robots.txt
3. [S] Create sitemap.xml (static routes)
4. [S] Add fallback meta tags to index.html
5. [M] Add per-route titles and descriptions

Phase 2: Social & Structured Data (estimated: X hours)
------------------------------------------------------
6. [M] Add OG tags to all public views
7. [M] Add Twitter Card tags
8. [M] Add JSON-LD structured data (WebSite, FAQPage)
9. [S] Create default OG image

Phase 3: i18n & Advanced (estimated: X hours)
----------------------------------------------
10. [M] Implement hreflang tags
11. [S] Dynamic <html lang=""> attribute
12. [L] Set up prerendering for static public pages
13. [L] Dynamic rendering for /@:username via Cloud Function

Total estimated effort: X hours
Recommended: Complete Phase 1 first, then Phase 2, then Phase 3.
```

Ask the user: "Ready to start implementation? Which phase should we begin with?"

## Step 5: Implement Fixes (with user approval)

For each fix, follow this workflow:

1. **Confirm scope** — Tell the user exactly which files will be created/modified
2. **Get approval** — Wait for explicit "yes" before touching any code
3. **Implement** — Follow TDD where applicable (pure functions, composables)
4. **Verify** — After implementation, run these checks:
   - `npx vite build` — build still succeeds
   - `npm run test:unit` — tests still pass
   - Read modified files to confirm changes are correct
5. **Report** — Show what was implemented and what remains

### Implementation order rules:
- `@unhead/vue` installation MUST come before any `useHead()`/`useSeoMeta()` usage
- `robots.txt` and `sitemap.xml` can be done independently
- Per-route meta requires `@unhead/vue` to be installed first
- OG tags require per-route meta to be set up first
- Structured data can be done independently after `@unhead/vue`
- Prerendering is a Phase 3 item that requires all other meta to be in place

## Step 6: Post-Implementation Verification

After all fixes are implemented:

1. **Re-run SEO audit** — Spawn the seo agent again to verify improvements
2. **Compare scores** — Show before/after comparison
3. **Check live site** (if deployed) — Use `WebFetch` to verify meta tags render on the live site
4. **Report**:

```
SEO Optimization Complete
=========================

Before: X/100
After:  Y/100 (+Z points)

Fixes implemented: {count}
Fixes remaining:   {count}

Dimension improvements:
| Dimension | Before | After |
|-----------|--------|-------|
| Head Management | Missing -> Good | +20 |
| ... | ... | ... |

Next steps:
- Deploy to dev and verify: cranial-trading-dev.web.app
- Test social sharing previews (paste URL in Twitter/Facebook/LinkedIn)
- Submit sitemap to Google Search Console
- Monitor indexation over next 2 weeks
```

## Key Project Context

### Deployed URLs
- Production: `cranial-trading.web.app`
- Dev: `cranial-trading-dev.web.app`

### Public routes (SEO-relevant)
| Route | View | Auth | SEO priority |
|-------|------|------|-------------|
| `/@:username` | `UserProfileView.vue` | None | Critical |
| `/faq` | `FaqView.vue` | None | High |
| `/terms` | `TermsView.vue` | None | Medium |
| `/privacy` | `PrivacyView.vue` | None | Medium |
| `/cookies` | `CookiesView.vue` | None | Medium |
| `/login` | `LoginView.vue` | Guest only | Low |
| `/register` | `RegisterView.vue` | Guest only | Low |

### Protected routes (should be noindex)
`/collection`, `/search`, `/market`, `/saved-matches`, `/messages`, `/settings`, `/contacts`

### i18n
- 3 languages: es (default), en, pt
- Locale files: `src/locales/{es,en,pt}.json`
- Locale stored in `localStorage` as `cranial_locale`
