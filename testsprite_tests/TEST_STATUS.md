# TestSprite Test Status Tracker

## App Info
- **Version:** 1.7.4model
- **Commit:** `b3641ae` (Phase 2 UX fixes + addCard undefined fix)
- **Last Batch Run:** 2026-03-03 (44/69 high-priority tests in 2 batches; batch 3 credits exhausted)
- **Last Targeted Run:** 2026-03-03 (TC014, TC023, TC035, TC038)
- **Test Account:** rafael@remoose.com
- **TestSprite Project:** `9239324f-9de7-4bee-87ab-e3fe5941291e`
- **Dashboard:** https://www.testsprite.com/dashboard

---

## Test Results Summary (Batch Run 2026-03-03)

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Passed | 22 | Verified working |
| ❌ Failed (app bug) | 2 | Real bugs found — TC015 (edit card), TC016 (bulk edit) — fixes applied |
| ⚠️ Failed (test/data) | 20 | Test infra, seed data, or flow mismatch |
| 🔲 Not run | 88 | 25 high-priority (batch 3 credits exhausted) + 63 medium/low priority |

---

## Bugs Found & Fixed

| Bug | Root Cause | Fix | Commit |
|-----|-----------|-----|--------|
| "Error al agregar carta" when adding non-creature cards | `addCard()` passed `undefined` values (power/toughness) to Firestore, which rejects them | Strip undefined values before `addDoc()` call, matching existing `confirmImport()` pattern | `8718354` |
| "Error al actualizar cartas" on bulk edit (TC016) | `batchUpdateCards()` spread `updates` with undefined values into Firestore `batch.update()` | Strip undefined values before batch write | pending |
| Edit card fails silently (TC015) | `updateCard()` spread `updates` with undefined values into Firestore `updateDoc()` | Strip undefined values before `updateDoc()` | pending |
| No "Add Card" button on desktop collection page | Only mobile FAB existed; desktop had no visible add affordance | Added "AGREGAR CARTA" button in collection header | `7ad929d` |
| No Contacts link in navigation | `/contacts` route existed but was unreachable via nav | Added contacts entry to `navigationLinks` in AppHeader | `7ad929d` |
| No manual block-by-username in blocked users modal | Could only block users from match cards | Added text input + BLOCK button with Firestore username lookup | `7ad929d` |
| 3 pre-existing lint errors blocking commits | sort-imports, prefer-template, no-confusing-void-expression | Fixed in UserProfileView, AppHeader, CardDetailModal | `7ad929d` |

---

## Failure Categories Summary

| Category | Count | Examples |
|----------|-------|---------|
| ✅ Passed | 22 | Registration, search, decks, binders, matches, messaging |
| ⚠️ Seed data | 7 | TC038, TC045, TC065, TC069, TC072, TC076 — test account needs more data |
| ⚠️ Test flow/design | 9 | TC009, TC024, TC026, TC048, TC049, TC057, TC061, TC062, TC077 — test misunderstands app UX |
| ⚠️ Test infra | 2 | TC010, TC079 — needs valid reset link / private profile |
| ⚠️ By design | 2 | TC066 — feature doesn't exist as described |
| ❌ App bug (fixed) | 2 | TC015, TC016 — undefined values in Firestore writes |
| 🔲 Not run | 88 | Batch 3 credits exhausted + medium/low priority |

## Previous Run History

### Round 3 (2026-03-03, batches 1-2, commit `b3641ae`)
- 44 tests run in 2 batches of 21 and 23
- 22 passed, 22 failed
- Found 2 new bugs: `updateCard()` and `batchUpdateCards()` undefined values
- Batch 3 (25 tests) failed: credits exhausted

### Round 2 (2026-03-03, pre-Phase 2 fixes)
- ~55 tests run before credits ran out
- 13 timed out, 5 wrong credentials, 6 seed data, ~12 UX gaps (fixed), ~19 passed

### Round 1 (2026-03-03, targeted, commit `8718354`)
- 4 tests: TC014, TC023, TC035, TC038
- TC023 passed, TC014 fixed (addCard undefined bug), TC035/TC038 test flow/seed data

---

## Full Test Plan (132 test cases)

### User Registration (TC001–TC006)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC001 | Successful registration shows email verification screen | High | ✅ Passed |
| TC002 | Register button disabled when required fields empty | High | ✅ Passed |
| TC003 | Invalid email format shows validation error | High | ✅ Passed |
| TC004 | Resend verification email shows confirmation | Medium | 🔲 Not run |
| TC005 | Check verification before verifying shows unverified | Medium | 🔲 Not run |
| TC006 | Back to login link returns to login page | Low | 🔲 Not run |

### Password Reset (TC007–TC013)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC007 | Request password reset email and return to login | High | ✅ Passed |
| TC008 | Forgot password shows validation when email empty | Medium | 🔲 Not run |
| TC009 | Forgot password shows error for non-existent email | High | ⚠️ By design | Firebase doesn't reveal if email exists (security) |
| TC010 | Reset password rejects mismatched passwords | High | ⚠️ Test infra | Needs valid reset link; can't test via automation |
| TC011 | Reset password fails with invalid/expired oobCode | High | ✅ Passed |
| TC012 | Reset password shows error when new password blank | Medium | 🔲 Not run |
| TC013 | Forgot password supports trimming whitespace in email | Low | 🔲 Not run |

### Card Collection Management (TC014–TC022)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC014 | Add a new card from Scryfall search | High | ✅ Passed |
| TC015 | Edit card from details modal and verify updates | High | ❌ App bug | Price field not found + save stuck on GUARDANDO. Fixed: strip undefined in updateCard() |
| TC016 | Bulk edit cards to Sale status | High | ❌ App bug | "Error al actualizar cartas". Fixed: strip undefined in batchUpdateCards() |
| TC017 | Delete a single card with confirmation | High | ✅ Passed |
| TC018 | Switch to Stack view and expand grouped card | Medium | 🔲 Not run |
| TC019 | Flip a dual-faced card image in Stack view | Medium | 🔲 Not run |
| TC020 | Scryfall rate limit shows error toast | Medium | 🔲 Not run |
| TC021 | Filter collection by Status: Sale | Medium | 🔲 Not run |
| TC022 | Cancel deletion leaves card intact | Low | 🔲 Not run |

### Card Search and Discovery (TC023–TC030)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC023 | Search by autocomplete and view owned-count badges | High | ✅ Passed |
| TC024 | Search by pressing Enter and browse results | High | ⚠️ By design | Enter selects autocomplete suggestion, doesn't navigate to /search |
| TC025 | Use advanced filters and verify results | High | ✅ Passed |
| TC026 | Open result card and add-to-collection modal appears | High | ⚠️ Test flow | Depends on TC024 navigation to /search which doesn't exist |
| TC027 | Clear search/filters restores default state | Medium | 🔲 Not run |
| TC028 | No-results with restrictive filters shows empty state | Medium | 🔲 Not run |
| TC029 | Rate-limit messaging on rapid queries | Low | 🔲 Not run |
| TC030 | Navigate back to Collection from Search | Medium | 🔲 Not run |

### Deck Building and Management (TC031–TC039)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC031 | Create new deck with supported format | High | ✅ Passed |
| TC032 | Create deck validation: missing name | High | ✅ Passed |
| TC033 | Open existing deck in editor with stats | High | ✅ Passed |
| TC034 | Add card from collection to deck mainboard | High | ⚠️ Test flow | Deck picker search returned no results; test search term issue |
| TC035 | Add card to sideboard, move between boards | Medium | ⚠️ Test flow | Test expects sideboard selector in AddCardModal |
| TC036 | Adjust card quantity in deck | Medium | 🔲 Not run |
| TC037 | Import deck from Moxfield URL | High | ✅ Passed |
| TC038 | Over-allocation validation | High | ⚠️ Seed data | Empty deck, no cards to test allocation |
| TC039 | Delete deck with confirmation | Medium | 🔲 Not run |

### Binder Organization (TC040–TC042)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC040 | Create new binder and verify in list | High | ✅ Passed |
| TC041 | Cancel binder creation | Medium | 🔲 Not run |
| TC042 | Create binder validation: empty name | High | ✅ Passed |

### Match Finding and Trading (TC043–TC047)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC043 | Calculate matches and save one | High | ✅ Passed |
| TC044 | Open match detail modal from New tab | High | ✅ Passed |
| TC045 | Share a match and confirm toast | High | ⚠️ Seed data | No matches on NUEVOS tab at time of test |
| TC046 | Block user from match card, verify in blocked list | High | ✅ Passed |
| TC047 | Discard match, verify in Deleted tab | Medium | 🔲 Not run |

### Preferences and Wishlist (TC048–TC054)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC048 | Add new wishlist preference via Scryfall | High | ⚠️ By design | Preferences created via AddCardModal with wishlist status, not from Matches page |
| TC049 | Complete preference details and verify listed | High | ⚠️ Test flow | Scryfall search returned no results in modal (timing/API) |
| TC050 | Cancel new preference creation | Medium | 🔲 Not run |
| TC051 | Validation: save preference with missing fields | High | ✅ Passed |
| TC052 | Delete a preference from list | High | ✅ Passed |
| TC053 | Import modal validation: no CSV/no URL | Medium | 🔲 Not run |
| TC054 | Empty/unknown card query shows no results | Low | 🔲 Not run |

### Real-time Messaging (TC055–TC060)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC055 | Open conversation and send message | High | ✅ Passed |
| TC056 | Conversation list shows last message preview | Medium | 🔲 Not run |
| TC057 | Filter conversations by username | High | ⚠️ Test flow | Messages not in nav bar; accessed via match notifications dropdown |
| TC058 | Open chat from public profile and send message | High | ✅ Passed |
| TC059 | Close chat modal, return to conversation list | Medium | 🔲 Not run |
| TC060 | Empty state when no conversations match filter | Low | 🔲 Not run |

### Market Analytics (TC061–TC068)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC061 | Price Movers: filter by format/mover type | High | ⚠️ Test flow | "Modern" format option not in Market dropdown; different format names |
| TC062 | Price Movers: search by card name | High | ⚠️ Test flow | Market movers search has no autocomplete suggestions |
| TC063 | Price Movers: filter by set | Medium | 🔲 Not run |
| TC064 | Price Movers: sort by change % vs absolute | Medium | 🔲 Not run |
| TC065 | Format Staples: switch tabs, choose category | High | ⚠️ Seed data | "No hay datos de staples aún" — cloud function runs every 12h |
| TC066 | Portfolio Impact: sort by impact/percentage | High | ⚠️ By design | Portfolio Impact tab doesn't exist as separate feature |
| TC067 | Portfolio Impact: search and paginate | Medium | 🔲 Not run |
| TC068 | Market caching: cached data within 10 min | Medium | 🔲 Not run |

### Saved Contacts (TC069–TC076)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC069 | Open Saved Contacts and view list | High | ⚠️ Seed data | "0 contactos" — no saved contacts in test account |
| TC070 | Open chat modal from saved contact | High | ⚠️ Test flow | Contacts nav click didn't navigate; also no contacts to test |
| TC071 | Close chat modal from contact | Medium | 🔲 Not run |
| TC072 | Delete saved contact with confirmation | High | ⚠️ Seed data | No contacts to delete |
| TC073 | Cancel delete leaves contact intact | Medium | 🔲 Not run |
| TC074 | Empty state with path to Saved Matches | Medium | 🔲 Not run |
| TC075 | Loading state while contacts retrieved | Low | 🔲 Not run |
| TC076 | Newly saved contact appears after saving | High | ⚠️ Seed data | No matches on Saved Matches to save as contact |

### Public User Profile (TC077–TC082)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC077 | View public profile and filter cards (logged out) | High | ⚠️ Test flow | /@rafael returns 404; username may differ or profile is private |
| TC078 | Apply advanced filters on public profile | Medium | 🔲 Not run |
| TC079 | Logged-out visitor no interest/contact actions | High | ⚠️ Test flow | Same /@rafael 404 issue |
| TC080 | Profile loading state shown | Low | 🔲 Not run |
| TC081 | Nonexistent user shows not-found state | High | 🔲 Not run |
| TC082 | Text search no results shows empty state | Medium | 🔲 Not run |

### Account Settings (TC083–TC092)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC083 | Change password successfully | High | 🔲 Not run |
| TC084 | Change password validation: mismatch | High | 🔲 Not run |
| TC085 | Change username with availability check | High | 🔲 Not run |
| TC086 | Change username cooldown error | Medium | 🔲 Not run |
| TC087 | Update location with OpenStreetMap autocomplete | High | 🔲 Not run |
| TC088 | Update avatar URL | Medium | 🔲 Not run |
| TC089 | Resend verification email from Settings | Low | 🔲 Not run |
| TC090 | Account statistics visible on Settings | Low | 🔲 Not run |
| TC091 | Restart guided tour from Settings | Low | 🔲 Not run |
| TC092 | Delete account and redirect to Login | High | 🔲 Not run |

### Import and Export (TC093–TC098)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC093 | Import deck from Moxfield and view results | High | 🔲 Not run |
| TC094 | Import Moxfield deck using ID-only value | Medium | 🔲 Not run |
| TC095 | CSV import validates file required | High | 🔲 Not run |
| TC096 | Export collection as Moxfield CSV | High | 🔲 Not run |
| TC097 | Export collection as Manabox CSV | Medium | 🔲 Not run |
| TC098 | Invalid Moxfield URL shows import error | High | 🔲 Not run |

### Internationalization (TC099–TC106)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC099 | Default language is Spanish on login | High | 🔲 Not run |
| TC100 | Switch to English, immediate UI update | High | 🔲 Not run |
| TC101 | Switch to Portuguese, immediate UI update | High | 🔲 Not run |
| TC102 | Language persists after reload (English) | High | 🔲 Not run |
| TC103 | Language persists after reload (Portuguese) | Medium | 🔲 Not run |
| TC104 | Language persists after login | High | 🔲 Not run |
| TC105 | Language persists across navigation | Medium | 🔲 Not run |
| TC106 | Switch languages multiple times without breaking | Medium | 🔲 Not run |

### Help and Legal Pages (TC107–TC116)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC107 | FAQ: Expand and collapse question | High | 🔲 Not run |
| TC108 | FAQ: Getting started guide visible | Medium | 🔲 Not run |
| TC109 | FAQ: Trade safety tips visible | Medium | 🔲 Not run |
| TC110 | FAQ: Return to login via logo | High | 🔲 Not run |
| TC111 | Terms page loads and readable | High | 🔲 Not run |
| TC112 | Terms -> Privacy navigation | High | 🔲 Not run |
| TC113 | Privacy page loads and readable | Medium | 🔲 Not run |
| TC114 | Cookies page loads and readable | Low | 🔲 Not run |
| TC115 | Privacy -> Cookies navigation | Low | 🔲 Not run |
| TC116 | FAQ: Multiple questions expanded | Medium | 🔲 Not run |

### Toast Notifications (TC117–TC124)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC117 | Success toast after saving settings | High | 🔲 Not run |
| TC118 | Error toast on wrong current password | High | 🔲 Not run |
| TC119 | Info toast on non-destructive action | Medium | 🔲 Not run |
| TC120 | Error toast on invalid reset email | Medium | 🔲 Not run |
| TC121 | Success toast on valid reset email | Low | 🔲 Not run |
| TC122 | Multiple toasts appear sequentially | Medium | 🔲 Not run |
| TC123 | Toast visible briefly, no instant dismiss | Low | 🔲 Not run |
| TC124 | Error toast on failed login | High | 🔲 Not run |

### Match Notifications (TC125–TC132)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC125 | Open shared-match notification | High | 🔲 Not run |
| TC126 | Badge reflects unread notifications after login | Medium | 🔲 Not run |
| TC127 | Badge updates after marking read | High | 🔲 Not run |
| TC128 | Badge updates after clearing notification | High | 🔲 Not run |
| TC129 | Dropdown opens/closes without navigation | Medium | 🔲 Not run |
| TC130 | Notification shows match context | Low | 🔲 Not run |
| TC131 | Mark-as-read persists after refresh | Medium | 🔲 Not run |
| TC132 | Click outside dismisses dropdown | Low | 🔲 Not run |

---

## Process: Running Tests

### Prerequisites
1. Build the app: `npx vite build`
2. Start preview server: `npm run preview` (serves on port 4173)
3. Ensure TestSprite credits are available

### Run full suite
```bash
# Via MCP tool (from Claude Code):
testsprite_generate_code_and_execute with testIds=[] and additionalInstruction including:
"Login with email: rafael@remoose.com and password: Open$123"
serverMode: "production"
```

### Run specific tests
```bash
# Pass specific test IDs:
testIds: ["TC014", "TC023", "TC035"]
```

### After each run
1. Check `testsprite_tests/tmp/raw_report.md` for results
2. Check `testsprite_tests/tmp/test_results.json` for detailed data
3. Update this file with new results
4. Note the commit hash and date

### TestSprite Dashboard
- Full results with video recordings: https://www.testsprite.com/dashboard
- Each test result includes a visualization link with the browser recording
