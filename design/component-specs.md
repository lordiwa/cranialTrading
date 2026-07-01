# Cranial Trading — Component Specs (Figma build sheet)

Build-ready specs derived 1:1 from the source components. Every color/type/shadow
references a **Figma style** already imported from `design-tokens.json`
(`color/…`, `typography/…`, `boxShadow/…`).

**Global conventions**
- Font: **Open Sans** everywhere (logo wordmark uses **Brother**, not in components).
- Corner radius tokens: `sm` = 2px, `DEFAULT` = 3px, `md` = 4px, `lg` = 6px, `xl` = 8px, `full` = 9999px.
- Spacing tokens (px): `xs` 4 · `sm` 8 · `md` 16 · `lg` 24 · `xl` 32.
- Min interactive target: **44px** height (buttons).
- Default border width is **1px** unless noted **2px**.
- Transition: 150ms ease-out (visual only; not needed in Figma).
- Build each as a **Component Set** with Variant properties listed below.

---

## 1) Button — `BaseButton`

**Component Set properties:** `Variant` (primary | secondary | danger | filled) × `Size` (normal | small) × `State` (default | hover | active | disabled).

**Base (all buttons)**
- Auto-layout, horizontal, center/center.
- Min height **44px**, corner radius **3px** (`DEFAULT`).
- Text weight **Bold (700)**.

**Size → padding & text style**
| Size | Padding X | Padding Y | Text style |
|---|---|---|---|
| normal | 24 (`lg`) | 16 (`md`) | desktop `typography/body` (16) · mobile `typography/small` (14) |
| small | 16 (`md`) | 10 | desktop `typography/small` (14) · mobile `typography/tiny` (14) |

> Build at the desktop size (normal = body/16, small = small/14). Note the mobile step-down if you make responsive variants.

**Variant → fill / border / text (by State)**
Border width **2px** on primary; 1px on secondary/danger (→2px on hover).

| Variant | State | Fill | Border | Text color |
|---|---|---|---|---|
| **primary** | default | none | 2px `color/accent/neon` | `color/accent/neon` |
| | hover | `color/accent/neon/10` | 2px `color/accent/neon` | `color/accent/neon` |
| | active | `color/accent/neon/10` | 2px `color/accent/neon` | `color/accent/neon` |
| | disabled | none | 2px `color/text/silver/50` | `color/text/silver/50` |
| **secondary** | default | none | 1px `color/text/silver` | `color/text/silver` |
| | hover | `color/text/silver/5` | 2px `color/text/silver` | `color/text/silver` |
| | active | `color/text/silver/10` | 2px `color/text/silver` | `color/text/silver` |
| | disabled | none | 1px `color/text/silver/50` | `color/text/silver/50` |
| **danger** | default | none | 1px `color/error/rust` | `color/error/rust` |
| | hover | `color/error/rust/5` | 2px `color/error/rust` | `color/error/rust` |
| | active | `color/error/rust/5` | 2px `color/error/rust` | `color/error/rust` |
| | disabled | none | 1px `color/text/silver/50` | `color/text/silver/50` |
| **filled** | default | `color/accent/neon` | none | `color/bg/primary` (#000) |
| | hover | `color/accent/neon` @ brightness 110% | none | `color/bg/primary` |
| | active | `color/accent/neon` @ brightness 90% | none | `color/bg/primary` |
| | disabled | `color/text/silver/50` | none | `color/bg/primary` |

> "brightness 110/90%" isn't a Figma style — approximate hover with a slightly lighter neon (#6FD07C) and active with a slightly darker neon (#4FAE5C), or just reuse `color/accent/neon` if you don't need the hover frames.

---

## 2) Input — `BaseInput` (`.input-base`)

**Component Set properties:** `State` (default | focus | disabled | error). Optional boolean `Clearable`.

**Base**
- Width: fill container. **Height: 40px** (fixed).
- Padding: X **12px**, Y **8px**.
- Fill: `color/bg/primary` (#000).
- Border: **1px** `color/text/silver/10`.
- Corner radius: **3px** (`DEFAULT`).
- Text style: `typography/small` (14) desktop → `typography/body` (16); text color `color/text/silver`.
- Placeholder text color: `color/accent/neon` at **40% opacity** (neon/40).

**States**
| State | Change |
|---|---|
| default | as base |
| focus | border **2px** `color/accent/neon` |
| disabled | opacity **50%**, no interaction |
| error | border **2px** `color/error/rust` + helper text below |

**Error helper text** (below field): margin-top 4px, `typography/tiny` (14) desktop → `typography/small`, color `color/error/rust`.

**Clearable add-on** (when `Clearable=true` and has value): a ✕ button, **24×24**, positioned right 12px, vertically centered; icon color `color/text/silver/50`, hover `color/text/silver`, hover background `color/text/silver/20`, shape circle (`full`). Add **right padding 40px** to the input so text doesn't overlap.

---

## 3) Badge — `BaseBadge`

**Component Set property:** `Variant` (9 values below).

**Base (all badges)**
- Auto-layout, inline. Padding X **8px** (`px-2`), Y **4px** (`py-1`).
- Text style: `typography/tiny` (14), weight **Medium (500)**.
- Corner radius: **2px** (`sm`).
- Border **1px** unless the fill implies otherwise (all have 1px border).

| Variant | Border (1px) | Fill | Text color |
|---|---|---|---|
| **busco** | `color/accent/neon` | none | `color/accent/neon` |
| **cambio** | `color/text/silver` | none | `color/text/silver` |
| **vendo** | `color/error/rust` | none | `color/error/rust` |
| **success** | `color/accent/neon` | `color/accent/neon/5` | `color/accent/neon` |
| **solo** | `color/text/silver` | none | `color/text/silver/70` |
| **deseado** | `color/warning` | `color/warning/5` | `color/warning` |
| **error** | `color/error/rust` | `color/error/rust/5` | `color/error/rust` |
| **info** | `color/info` | `color/info/5` | `color/info` |
| **warning** | `color/warning` | `color/warning/5` | `color/warning` |

> CLEANUP applied: `deseado` + `warning` use **`color/warning`** (#FACC15) — they were the orphan amber #F59E0B in code. `info` uses **`color/info`** (#60A5FA), promoted from inline blue-400. `deseado` and `warning` are now visually identical; keep both names for semantics or merge if you prefer.

---

## Suggested Figma page layout
1. **Foundations** — swatches for every color style, the 7 type styles, the 4 shadows.
2. **Components** — the 3 Component Sets above, each with a variants matrix.
3. **Patterns** — (later) login/landing using these components.

## Source of truth
- Tokens: `design/design-tokens.json`
- Code: `src/components/ui/BaseButton.vue`, `BaseInput.vue` (+ `.input-base` in `src/style.css:178`), `BaseBadge.vue`, `tailwind.config.js`.
