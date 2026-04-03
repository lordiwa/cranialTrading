---
name: frontend-design
description: Design thinking process and aesthetic guidelines for building visually distinctive frontend interfaces
user-invocable: true
disable-model-invocation: false
---

# Frontend Design Skill

Before writing any frontend code, commit to a bold aesthetic direction. Generic-looking UIs waste the opportunity to create memorable experiences.

## Design Thinking Process

Before touching code, answer these questions:

1. **Purpose** — What feeling should this interface create? (e.g., "serious trading platform", "collector's pride")
2. **Tone** — Dark & premium? Playful? Minimal? Match the brand.
3. **Constraints** — What design tokens already exist? What must be preserved?
4. **Differentiation** — What makes this look unlike every other app built with Tailwind defaults?

Choose a clear conceptual direction and execute with precision. Avoid "a little of everything" — commit to a style.

## Frontend Aesthetics Guidelines

### Typography

- Use distinctive font pairings, not generic Inter/Arial/system defaults
- Create clear hierarchy: one font for headings (display/brand), another for body
- Use letter-spacing and font-weight to differentiate levels, not just font-size
- Limit to 3-4 type sizes per view to maintain rhythm

### Color & Theme

- Build a cohesive palette with CSS variables / Tailwind config — never inline hex values
- Choose a dominant surface color, then layer with opacity variants for depth
- Accent colors should be used sparingly and consistently — one primary accent, one for errors/warnings
- Dark themes need dark-on-dark layering: use opacity variants (5%, 10%, 15%) to create surface hierarchy on black
- Test contrast ratios: text must meet WCAG AA (4.5:1 for body, 3:1 for large text)

### Motion & Micro-Interactions

- Use CSS-only animations — `transition`, `@keyframes`, no JS animation libraries for simple effects
- Hover states: subtle `transform` + `box-shadow` changes (translateY -2 to -4px)
- Entry animations: fade + slight translate, 150-300ms, `ease-out`
- Exit animations: faster than entries (100-200ms)
- Always respect `prefers-reduced-motion` — wrap animations in `@media (prefers-reduced-motion: no-preference)`
- Scroll-triggered reveals via Intersection Observer, not scroll event listeners

### Spatial Composition

- Use generous negative space — don't fill every pixel
- Create visual rhythm with consistent spacing scale (4/8/16/24/32px)
- Consider asymmetric layouts for hero sections, symmetric grids for collections
- Card grids: `repeat(auto-fill, minmax(Xpx, 1fr))` adapts without breakpoints
- Group related items tightly, separate unrelated groups with more space

### Backgrounds & Visual Details

- Dark themes: layer surfaces with opacity variants, not flat identical blacks
- Subtle borders (`border-silver-5` or `border-silver-10`) separate surfaces without harsh lines
- Use `box-shadow` with brand-colored glows for interactive element focus states
- Skeleton/shimmer loading states over spinners — preserve layout structure during loads

## Project Design System Reference (Cranial Trading)

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `primary` | #000000 | Background surfaces |
| `silver` | #FFFFFF | Primary text |
| `silver-70` | rgba(255,255,255,0.85) | Secondary text |
| `silver-50` | rgba(255,255,255,0.7) | Tertiary text |
| `silver-30` | rgba(255,255,255,0.4) | Disabled text, subtle borders |
| `silver-20` | rgba(255,255,255,0.25) | Dividers |
| `silver-10` | rgba(255,255,255,0.15) | Surface borders |
| `silver-5` | rgba(255,255,255,0.08) | Elevated surface backgrounds |
| `neon` | #5AC168 | Primary accent (CTAs, success, active states) |
| `neon-40` | rgba(90,193,104,0.4) | Accent hover states |
| `neon-15` | rgba(90,193,104,0.15) | Accent surface backgrounds |
| `neon-10` | rgba(90,193,104,0.1) | Subtle accent tints |
| `rust` | #8B2E1F | Errors, destructive actions |

### Typography
| Level | Size | Weight | Font |
|-------|------|--------|------|
| h1 | 28px | 700 | Open Sans |
| h2 | 24px | 700 | Open Sans |
| h3 | 20px | 500 | Open Sans |
| h5 | 16px | 700 | Open Sans |
| body | 16px | 400 | Open Sans |
| small | 14px | 400 | Open Sans |
| brand | varies | varies | Brother |

### Spacing Scale
`xs: 4px` | `sm: 8px` | `md: 16px` | `lg: 24px` | `xl: 32px`

### Shadows
| Token | Value | Usage |
|-------|-------|-------|
| `subtle` | 0 2px 4px rgba(0,0,0,0.2) | Cards at rest |
| `medium` | 0 4px 12px rgba(0,0,0,0.3) | Cards on hover, dropdowns |
| `strong` | 0 8px 24px rgba(0,0,0,0.4) | Modals, overlays |
| `glow-strong` | 0 0 12px rgba(90,193,104,0.15) | Neon accent glow |

### Touch Targets
Minimum `min-h-44` (44px) and `min-w-44` (44px) for all interactive elements.

### Border Radius
`sm: 2px` | `DEFAULT: 3px` | `md: 4px` | `lg: 6px` | `xl: 8px`

## Anti-Patterns to Avoid

- **Generic card grid with no visual rhythm** — vary spacing, use group headers, add visual breaks
- **Loading spinners instead of skeleton states** — skeletons preserve layout and feel faster
- **Flat black surfaces** — use dark-on-dark layering with `silver-5`, `silver-10` for surface hierarchy
- **Overusing neon accent** — reserve for primary CTAs, active states, success. If everything glows, nothing stands out
- **Generic AI aesthetics** — no purple gradients, no cookie-cutter glassmorphism, no gratuitous blur effects
- **Hover-only interactions** — always provide touch/tap alternatives for mobile
- **Inconsistent spacing** — stick to the spacing scale, don't mix arbitrary pixel values
- **Text on images without contrast protection** — use gradient overlays or text-shadow for legibility
