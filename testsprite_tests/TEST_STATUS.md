# TestSprite Test Status Tracker

## App Info
- **Version:** 1.7.4model
- **Commit:** `8718354` (fix: strip undefined values in addCard)
- **Last Full Run:** 2026-03-03 (partial — credits exhausted mid-run)
- **Last Targeted Run:** 2026-03-03 (TC014, TC023, TC035, TC038)
- **Test Account:** rafael@remoose.com
- **TestSprite Project:** `9239324f-9de7-4bee-87ab-e3fe5941291e`
- **Dashboard:** https://www.testsprite.com/dashboard

---

## Test Results Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Passed | 1 | Verified working |
| ❌ Failed (app bug) | 1 | Real bug found and fixed this session |
| ⚠️ Failed (test issue) | 2 | Test infra/data/flow problem, not app bug |
| 🔲 Not run | 128 | Awaiting credits for full suite run |

---

## Tested Cases (2026-03-03, commit `8718354`)

| TC | Title | Category | Priority | Status | Notes |
|----|-------|----------|----------|--------|-------|
| TC014 | Add a new card to the collection from Scryfall search | Card Collection Mgmt | High | ⚠️ Test timing | Card saves (GUARDANDO...) but test doesn't wait for toast. Pre-existing Lightning Bolts confuse assertion. App works correctly. |
| TC023 | Search by card name using autocomplete selection and view results with owned-count badges | Card Search | High | ✅ Passed | — |
| TC035 | Add a card to sideboard and move it between mainboard and sideboard | Deck Building | Medium | ⚠️ Test flow mismatch | Test expects sideboard selector in AddCardModal. Actual flow: add card to collection → open deck editor → manage mainboard/sideboard from there. |
| TC038 | Over-allocation validation | Deck Building | High | ⚠️ Seed data | Test created empty "Automation Test Deck" instead of using existing deck with cards. Needs pre-populated deck to trigger validation. |

---

## Bugs Found & Fixed This Session

| Bug | Root Cause | Fix | Commit |
|-----|-----------|-----|--------|
| "Error al agregar carta" when adding non-creature cards | `addCard()` passed `undefined` values (power/toughness) to Firestore, which rejects them | Strip undefined values before `addDoc()` call, matching existing `confirmImport()` pattern | `8718354` |
| No "Add Card" button on desktop collection page | Only mobile FAB existed; desktop had no visible add affordance | Added "AGREGAR CARTA" button in collection header | `7ad929d` |
| No Contacts link in navigation | `/contacts` route existed but was unreachable via nav | Added contacts entry to `navigationLinks` in AppHeader | `7ad929d` |
| No manual block-by-username in blocked users modal | Could only block users from match cards | Added text input + BLOCK button with Firestore username lookup | `7ad929d` |
| 3 pre-existing lint errors blocking commits | sort-imports, prefer-template, no-confusing-void-expression | Fixed in UserProfileView, AppHeader, CardDetailModal | `7ad929d` |

---

## Previous Run Results (2026-03-03, Round 2 — pre-fixes)

These were from the earlier round before phase 2 fixes. 132 total test cases in the plan; ~55 were executed before credits ran out.

### Known failure categories from earlier runs:
- **13 tests** — Timed out (test infrastructure)
- **5 tests** — Wrong login credentials (`example@gmail.com` instead of `rafael@remoose.com`)
- **6 tests** — Needed seed data in test account
- **~12 tests** — UX discoverability gaps (fixed in `7ad929d`)
- **~19 tests** — Passed

---

## Full Test Plan (132 test cases)

### User Registration (TC001–TC006)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC001 | Successful registration shows email verification screen | High | 🔲 Not run |
| TC002 | Register button disabled when required fields empty | High | 🔲 Not run |
| TC003 | Invalid email format shows validation error | High | 🔲 Not run |
| TC004 | Resend verification email shows confirmation | Medium | 🔲 Not run |
| TC005 | Check verification before verifying shows unverified | Medium | 🔲 Not run |
| TC006 | Back to login link returns to login page | Low | 🔲 Not run |

### Password Reset (TC007–TC013)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC007 | Request password reset email and return to login | High | 🔲 Not run |
| TC008 | Forgot password shows validation when email empty | Medium | 🔲 Not run |
| TC009 | Forgot password shows error for non-existent email | High | 🔲 Not run |
| TC010 | Reset password rejects mismatched passwords | High | 🔲 Not run |
| TC011 | Reset password fails with invalid/expired oobCode | High | 🔲 Not run |
| TC012 | Reset password shows error when new password blank | Medium | 🔲 Not run |
| TC013 | Forgot password supports trimming whitespace in email | Low | 🔲 Not run |

### Card Collection Management (TC014–TC022)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC014 | Add a new card from Scryfall search | High | ⚠️ Test timing |
| TC015 | Edit card from details modal and verify updates | High | 🔲 Not run |
| TC016 | Bulk edit cards to Sale status | High | 🔲 Not run |
| TC017 | Delete a single card with confirmation | High | 🔲 Not run |
| TC018 | Switch to Stack view and expand grouped card | Medium | 🔲 Not run |
| TC019 | Flip a dual-faced card image in Stack view | Medium | 🔲 Not run |
| TC020 | Scryfall rate limit shows error toast | Medium | 🔲 Not run |
| TC021 | Filter collection by Status: Sale | Medium | 🔲 Not run |
| TC022 | Cancel deletion leaves card intact | Low | 🔲 Not run |

### Card Search and Discovery (TC023–TC030)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC023 | Search by autocomplete and view owned-count badges | High | ✅ Passed |
| TC024 | Search by pressing Enter and browse results | High | 🔲 Not run |
| TC025 | Use advanced filters and verify results | High | 🔲 Not run |
| TC026 | Open result card and add-to-collection modal appears | High | 🔲 Not run |
| TC027 | Clear search/filters restores default state | Medium | 🔲 Not run |
| TC028 | No-results with restrictive filters shows empty state | Medium | 🔲 Not run |
| TC029 | Rate-limit messaging on rapid queries | Low | 🔲 Not run |
| TC030 | Navigate back to Collection from Search | Medium | 🔲 Not run |

### Deck Building and Management (TC031–TC039)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC031 | Create new deck with supported format | High | 🔲 Not run |
| TC032 | Create deck validation: missing name | High | 🔲 Not run |
| TC033 | Open existing deck in editor with stats | High | 🔲 Not run |
| TC034 | Add card from collection to deck mainboard | High | 🔲 Not run |
| TC035 | Add card to sideboard, move between boards | Medium | ⚠️ Test flow |
| TC036 | Adjust card quantity in deck | Medium | 🔲 Not run |
| TC037 | Import deck from Moxfield URL | High | 🔲 Not run |
| TC038 | Over-allocation validation | High | ⚠️ Seed data |
| TC039 | Delete deck with confirmation | Medium | 🔲 Not run |

### Binder Organization (TC040–TC042)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC040 | Create new binder and verify in list | High | 🔲 Not run |
| TC041 | Cancel binder creation | Medium | 🔲 Not run |
| TC042 | Create binder validation: empty name | High | 🔲 Not run |

### Match Finding and Trading (TC043–TC047)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC043 | Calculate matches and save one | High | 🔲 Not run |
| TC044 | Open match detail modal from New tab | High | 🔲 Not run |
| TC045 | Share a match and confirm toast | High | 🔲 Not run |
| TC046 | Block user from match card, verify in blocked list | High | 🔲 Not run |
| TC047 | Discard match, verify in Deleted tab | Medium | 🔲 Not run |

### Preferences and Wishlist (TC048–TC054)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC048 | Add new wishlist preference via Scryfall | High | 🔲 Not run |
| TC049 | Complete preference details and verify listed | High | 🔲 Not run |
| TC050 | Cancel new preference creation | Medium | 🔲 Not run |
| TC051 | Validation: save preference with missing fields | High | 🔲 Not run |
| TC052 | Delete a preference from list | High | 🔲 Not run |
| TC053 | Import modal validation: no CSV/no URL | Medium | 🔲 Not run |
| TC054 | Empty/unknown card query shows no results | Low | 🔲 Not run |

### Real-time Messaging (TC055–TC060)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC055 | Open conversation and send message | High | 🔲 Not run |
| TC056 | Conversation list shows last message preview | Medium | 🔲 Not run |
| TC057 | Filter conversations by username | High | 🔲 Not run |
| TC058 | Open chat from public profile and send message | High | 🔲 Not run |
| TC059 | Close chat modal, return to conversation list | Medium | 🔲 Not run |
| TC060 | Empty state when no conversations match filter | Low | 🔲 Not run |

### Market Analytics (TC061–TC068)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC061 | Price Movers: filter by format/mover type | High | 🔲 Not run |
| TC062 | Price Movers: search by card name | High | 🔲 Not run |
| TC063 | Price Movers: filter by set | Medium | 🔲 Not run |
| TC064 | Price Movers: sort by change % vs absolute | Medium | 🔲 Not run |
| TC065 | Format Staples: switch tabs, choose category | High | 🔲 Not run |
| TC066 | Portfolio Impact: sort by impact/percentage | High | 🔲 Not run |
| TC067 | Portfolio Impact: search and paginate | Medium | 🔲 Not run |
| TC068 | Market caching: cached data within 10 min | Medium | 🔲 Not run |

### Saved Contacts (TC069–TC076)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC069 | Open Saved Contacts and view list | High | 🔲 Not run |
| TC070 | Open chat modal from saved contact | High | 🔲 Not run |
| TC071 | Close chat modal from contact | Medium | 🔲 Not run |
| TC072 | Delete saved contact with confirmation | High | 🔲 Not run |
| TC073 | Cancel delete leaves contact intact | Medium | 🔲 Not run |
| TC074 | Empty state with path to Saved Matches | Medium | 🔲 Not run |
| TC075 | Loading state while contacts retrieved | Low | 🔲 Not run |
| TC076 | Newly saved contact appears after saving | High | 🔲 Not run |

### Public User Profile (TC077–TC082)
| TC | Title | Priority | Status |
|----|-------|----------|--------|
| TC077 | View public profile and filter cards (logged out) | High | 🔲 Not run |
| TC078 | Apply advanced filters on public profile | Medium | 🔲 Not run |
| TC079 | Logged-out visitor no interest/contact actions | High | 🔲 Not run |
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
