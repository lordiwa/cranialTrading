# Phase 1: Global A11y & CSS Sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 01-global-a11y-css-sweep
**Mode:** --auto (all decisions auto-selected with recommended defaults)
**Areas discussed:** Focus ring style, Transition property lists, Icon button labeling, Modal ARIA approach

---

## Focus Ring Style

| Option | Description | Selected |
|--------|-------------|----------|
| Neon green ring matching brand | `focus-visible:ring-2 ring-neon ring-offset-2 ring-offset-primary` — consistent with existing neon accent color | ✓ |
| Browser default focus | Remove outline-none, let browser handle — least work but inconsistent | |
| Custom outline | Custom outline style instead of ring — different visual approach | |

**User's choice:** [auto] Neon green ring matching brand (recommended default)
**Notes:** Consistent with existing `border-neon` focus pattern used across inputs. Upgrading from border to ring for better visibility.

---

## Transition Property Lists

| Option | Description | Selected |
|--------|-------------|----------|
| Enumerate per utility class | Each utility gets only the properties it actually animates | ✓ |
| Single global list | One transition property list shared by all utilities | |
| Remove transitions entirely | Strip all transitions for simplicity | |

**User's choice:** [auto] Enumerate per utility class (recommended default)
**Notes:** Most specific and correct approach. Each utility class knows what it animates.

---

## Icon Button Labeling

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic with i18n keys | Create `common.aria.*` keys in all 3 locales — proper multilingual support | ✓ |
| Static English strings | Hardcode English aria-labels — simpler but not multilingual | |
| Tooltip-based | Use existing title attributes as aria-label source | |

**User's choice:** [auto] Dynamic with i18n keys (recommended default)
**Notes:** App already uses vue-i18n with en/es/pt. Consistency requires i18n for all user-facing strings.

---

## Modal ARIA Approach

| Option | Description | Selected |
|--------|-------------|----------|
| BaseModal as single source | Add role/aria-modal/aria-labelledby to BaseModal — all consumers inherit | ✓ |
| Per-modal implementation | Add ARIA attributes individually to each modal | |
| Headless UI library | Adopt a headless dialog component with built-in ARIA | |

**User's choice:** [auto] BaseModal as single source (recommended default)
**Notes:** Most modals use BaseModal. The 4 standalone modals (Confirm, Prompt, Welcome, HelpCarousel) need direct additions.

---

## Claude's Discretion

- Exact ring offset values
- BaseSpinner extraction vs inline ARIA
- Avatar image dimensions per context

## Deferred Ideas

None
