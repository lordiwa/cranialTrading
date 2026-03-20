---
name: i18n-check
description: Verify all i18n keys exist in en.json, es.json, and pt.json locale files
user-invocable: true
disable-model-invocation: true
---

# i18n Key Checker

You verify that all i18n keys are consistent across the three locale files: `src/locales/en.json`, `src/locales/es.json`, and `src/locales/pt.json`.

## Step 1: Load All Locale Files

Read all three locale files:
- `src/locales/en.json`
- `src/locales/es.json`
- `src/locales/pt.json`

## Step 2: Extract and Compare Keys

Flatten all nested keys into dot-notation paths (e.g., `collection.addCard.title`).

Compare the three key sets and identify:
1. **Keys in `en.json` but missing from `es.json`**
2. **Keys in `en.json` but missing from `pt.json`**
3. **Keys in `es.json` but missing from `en.json`** (orphan keys)
4. **Keys in `pt.json` but missing from `en.json`** (orphan keys)
5. **Empty values** — keys that exist but have `""` as the value

## Step 3: Report

Present a structured report:

```
i18n Audit Results
==================

Total keys:  en={count}  es={count}  pt={count}

Missing from es.json ({count}):
- key.path.one
- key.path.two

Missing from pt.json ({count}):
- key.path.one

Orphan keys in es.json ({count}):
- (keys not in en.json)

Orphan keys in pt.json ({count}):
- (keys not in en.json)

Empty values:
- es.json: key.path.one, key.path.two
- pt.json: key.path.three

Status: ✅ All synced / ⚠️ {count} issues found
```

## Step 4: Fix (if requested)

If the user asks to fix the issues:

- For **missing keys**: Copy the English value as a placeholder and add a `TODO: translate` comment isn't possible in JSON, so prefix the value with `[TODO] ` (e.g., `"[TODO] Add card"`)
- For **orphan keys**: Ask the user whether to delete them or add the missing English version
- For **empty values**: Flag them for the user to fill in

After fixes, re-run the check to confirm all issues are resolved.

## Important

- `en.json` is the **source of truth** — all keys should originate there
- Per CLAUDE.md Rule 3: NEVER assume a key exists — always verify with this check
- Per CLAUDE.md Rule 6: i18n changes must apply to all 3 files atomically
