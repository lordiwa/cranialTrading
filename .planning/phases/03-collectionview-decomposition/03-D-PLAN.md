---
phase: 03-collectionview-decomposition
plan: D
type: execute
wave: 2
depends_on:
  - A
files_modified:
  - src/components/collection/CollectionGridCard.vue
  - src/components/collection/CollectionGridCardCompact.vue
  - src/components/collection/CollectionGridCardFull.vue
  - tests/unit/components/CollectionGridCard.test.ts
  - tests/unit/components/CollectionGridCardFull.test.ts
  - tests/unit/composables/useSwipe.test.ts
autonomous: true
requirements:
  - ARCH-05
  - ARCH-06

must_haves:
  truths:
    - "CollectionGridCard.vue is a thin routing shell (~25 lines) that delegates to Compact or Full based on the compact prop (ARCH-05 per D-09)"
    - "CollectionGridCardCompact.vue renders the compact variant (~120 lines) — minimal button with image and info"
    - "CollectionGridCardFull.vue renders the full variant (~450 lines) with all interactive features"
    - "CollectionGridCardFull uses useSwipe.ts composable — no inline @touchstart/@touchmove/@touchend handlers remain (ARCH-06 per D-10)"
    - "Swipe threshold is 80px (matching current inline value), offset clamped to plus/minus 120px via computed wrapper"
    - "Right swipe cycles status through STATUS_ORDER (collection → trade → sale → wishlist → collection)"
    - "Left swipe emits delete event"
    - "Swipe is disabled when props.readonly or props.isBeingDeleted is true"
    - "CollectionGrid.vue requires NO changes — the routing shell preserves the same component API"
    - "useSwipe.ts composable has unit tests (currently untested)"
  artifacts:
    - path: "src/components/collection/CollectionGridCard.vue"
      provides: "Thin routing shell — delegates to Compact or Full based on compact prop"
      min_lines: 15
    - path: "src/components/collection/CollectionGridCardCompact.vue"
      provides: "Compact card variant with image, name, price info"
    - path: "src/components/collection/CollectionGridCardFull.vue"
      provides: "Full card variant with swipe, status bar, selection, context menu, price sparkline"
    - path: "tests/unit/components/CollectionGridCard.test.ts"
      provides: "Shell routing test — compact=true renders Compact, compact=false renders Full"
    - path: "tests/unit/components/CollectionGridCardFull.test.ts"
      provides: "Full variant tests — swipe behavior via useSwipe, status cycling"
    - path: "tests/unit/composables/useSwipe.test.ts"
      provides: "useSwipe composable unit tests (previously untested)"
  key_links:
    - from: "src/components/collection/CollectionGridCard.vue"
      to: "src/components/collection/CollectionGridCardCompact.vue"
      via: "<CollectionGridCardCompact v-if=\"compact\" />"
    - from: "src/components/collection/CollectionGridCard.vue"
      to: "src/components/collection/CollectionGridCardFull.vue"
      via: "<CollectionGridCardFull v-else />"
    - from: "src/components/collection/CollectionGridCardFull.vue"
      to: "src/composables/useSwipe.ts"
      via: "const { isSwiping, swipeOffset } = useSwipe(cardRef, { threshold: 80, onSwipeLeft, onSwipeRight })"
    - from: "src/components/collection/CollectionGrid.vue"
      to: "src/components/collection/CollectionGridCard.vue"
      via: "<CollectionGridCard :card=\"card\" :compact=\"compact\" ... /> (unchanged)"
---

<objective>
Split CollectionGridCard.vue (704 lines) into a thin routing shell + CollectionGridCardCompact + CollectionGridCardFull, and wire CollectionGridCardFull to use the existing useSwipe.ts composable instead of inline touch handlers.

Purpose: ARCH-05 (split) and ARCH-06 (swipe composable) are self-contained changes that only touch component files — no CollectionView.vue edits needed. This plan runs in Wave 2 parallel with Plan B (different file set, zero overlap).

Output: 3 component files (shell + 2 variants), 3 test files. CollectionGrid.vue unchanged (consumer API preserved).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-collectionview-decomposition/03-CONTEXT.md
@.planning/phases/03-collectionview-decomposition/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- From src/components/collection/CollectionGridCard.vue (704 lines — read before splitting) -->

Props interface (lines 16-37):
```typescript
defineProps<{
  card: Card
  compact?: boolean      // <-- THE routing switch
  readonly?: boolean
  showInterest?: boolean
  isInterested?: boolean
  showCart?: boolean
  isInCart?: boolean
  isBeingDeleted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
}>()
```

Emits interface (lines 39-45):
```typescript
defineEmits<{
  cardClick: [card: Card]
  delete: [card: Card]
  interest: [card: Card]
  addToCart: [card: Card]
  toggleSelect: [cardId: string]
}>()
```

Template structure:
- Compact branch: lines 376-416 (~40 lines) — minimal button with image + 2 info lines
- Full branch: lines 418-697 (~280 lines) — status bar, swipe handlers, selection checkbox, split-card flip, status overlay, delete overlay, deck allocation row, name, edition, prices, sparkline, ELIMINAR button, interest/cart buttons, context menu

Shared script logic used by BOTH:
- IntersectionObserver price lazy-fetch (lines 195-216)
- parsedImage, getCardImage, hasImage, imageLoaded
- CK prices, split-card detection, sparkline
- ~15 refs and computeds (lines 58-376)

Script logic ONLY used by Full:
- cardRef, swipeOffset, isSwiping, startX, SWIPE_THRESHOLD, handleTouchStart/Move/End (lines 58-127) — REPLACED by useSwipe
- swipeStyle, swipeIndicator computeds (lines 130-142)
- STATUS_ORDER, setStatus, togglePublic (lines 69-152)
- allocationInfo, isCardAllocated, getStatusColor, getStatusIconName (various)
- priceChangeData, context menu items
- ~150 lines of script only active when compact===false

From src/composables/useSwipe.ts (existing — 78 lines):
```typescript
export function useSwipe(elementRef: Ref<HTMLElement | null>, options: SwipeOptions): {
  isSwiping: Ref<boolean>
  swipeOffset: Ref<number>
}
interface SwipeOptions {
  threshold?: number  // default 50px
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}
```

From src/components/collection/CollectionGrid.vue (line 75 — sole consumer):
```typescript
<CollectionGridCard
  :card="item"
  :compact="compact"
  :readonly="readonly"
  :show-interest="showInterest"
  :is-interested="interestedCards.has(item.id)"
  :show-cart="showCart"
  :is-in-cart="cartItemIds.has(item.id)"
  :is-being-deleted="deletingCardIds.has(item.id)"
  :selection-mode="selectionMode"
  :is-selected="selectedCardIds.has(item.id)"
  @card-click="emit('cardClick', item)"
  @delete="emit('delete', item)"
  @interest="emit('interest', item)"
  @add-to-cart="emit('addToCart', item)"
  @toggle-select="emit('toggleSelect', item.id)"
/>
```
The shell must preserve this exact prop/event API.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add useSwipe unit tests + create routing shell and Compact variant</name>
  <files>
    tests/unit/composables/useSwipe.test.ts,
    src/components/collection/CollectionGridCard.vue,
    src/components/collection/CollectionGridCardCompact.vue,
    tests/unit/components/CollectionGridCard.test.ts
  </files>
  <behavior>
    useSwipe tests:
    - Returns isSwiping (initially false) and swipeOffset (initially 0)
    - After touchstart + touchmove right, swipeOffset is positive
    - After touchstart + touchmove left, swipeOffset is negative
    - After touchend with offset > threshold, onSwipeRight is called
    - After touchend with offset < -threshold, onSwipeLeft is called
    - After touchend with offset within threshold, neither callback fires
    - After touchend, isSwiping resets to false and swipeOffset resets to 0

    Routing shell tests:
    - With compact=true, renders CollectionGridCardCompact (not Full)
    - With compact=false, renders CollectionGridCardFull (not Compact)
    - Props are passed through to child component
    - Events are re-emitted from child component
  </behavior>
  <action>
**RED phase:**
1. Create `tests/unit/composables/useSwipe.test.ts` with tests for the composable's touch event handling. Use `@vue/test-utils` mount helper with a wrapper component that calls `useSwipe`. Simulate touch events via `element.dispatchEvent(new TouchEvent(...))`.
2. Create `tests/unit/components/CollectionGridCard.test.ts` with tests for the routing shell behavior (compact prop routing).

Run `npm run test:unit` — confirm RED for shell tests (component doesn't exist yet), GREEN for useSwipe tests (composable exists, tests should pass — if not, investigate).

**GREEN phase:**

1. Create `src/components/collection/CollectionGridCardCompact.vue`:
   - Extract from current CollectionGridCard.vue lines 376-416 (template compact branch).
   - Extract the shared script logic that compact needs: `parsedImage`, `getCardImage`, `hasImage`, `imageLoaded`, IntersectionObserver price fetch (lines 195-216), CK prices, split-card detection.
   - Same props interface as the parent (all props passed through from shell).
   - Same emits interface (re-emit events).
   - Target: ~120 lines (80 script + 40 template).

2. Rewrite `src/components/collection/CollectionGridCard.vue` as a routing shell:
   ```vue
   <script setup lang="ts">
   import CollectionGridCardCompact from './CollectionGridCardCompact.vue'
   import CollectionGridCardFull from './CollectionGridCardFull.vue'
   import type { Card } from '../../types/card'

   const props = withDefaults(defineProps<{
     card: Card
     compact?: boolean
     readonly?: boolean
     showInterest?: boolean
     isInterested?: boolean
     showCart?: boolean
     isInCart?: boolean
     isBeingDeleted?: boolean
     selectionMode?: boolean
     isSelected?: boolean
   }>(), {
     compact: false, readonly: false, showInterest: false, isInterested: false,
     showCart: false, isInCart: false, isBeingDeleted: false,
     selectionMode: false, isSelected: false,
   })

   const emit = defineEmits<{
     cardClick: [card: Card]
     delete: [card: Card]
     interest: [card: Card]
     addToCart: [card: Card]
     toggleSelect: [cardId: string]
   }>()
   </script>
   <template>
     <CollectionGridCardCompact v-if="compact" v-bind="props"
       @card-click="emit('cardClick', $event)"
       @delete="emit('delete', $event)"
       @interest="emit('interest', $event)"
       @add-to-cart="emit('addToCart', $event)"
       @toggle-select="emit('toggleSelect', $event)" />
     <CollectionGridCardFull v-else v-bind="props"
       @card-click="emit('cardClick', $event)"
       @delete="emit('delete', $event)"
       @interest="emit('interest', $event)"
       @add-to-cart="emit('addToCart', $event)"
       @toggle-select="emit('toggleSelect', $event)" />
   </template>
   ```

Note: CollectionGridCardFull.vue does not exist yet — it will be created in Task 2. The build may fail until Task 2 completes. That's acceptable for TDD RED→GREEN flow within the same plan.

Run tests that can pass (useSwipe tests, shell routing with mocked Full).
  </action>
  <verify>
    <automated>npm run test:unit -- useSwipe && npm run test:unit -- CollectionGridCard.test</automated>
  </verify>
  <done>useSwipe has unit tests. CollectionGridCardCompact exists. CollectionGridCard.vue is a thin routing shell. Shell test passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create CollectionGridCardFull with useSwipe wired (ARCH-06)</name>
  <files>
    src/components/collection/CollectionGridCardFull.vue,
    tests/unit/components/CollectionGridCardFull.test.ts
  </files>
  <behavior>
    - Full card renders status bar, card image, name, edition, prices, action buttons
    - Swipe right cycles status through STATUS_ORDER (collection → trade → sale → wishlist)
    - Swipe left emits delete event
    - Swipe is disabled when readonly=true or isBeingDeleted=true
    - swipeOffset is clamped to plus/minus 120px for visual indicator
    - No inline @touchstart/@touchmove/@touchend in template
    - Context menu items render correctly
  </behavior>
  <action>
**RED phase:** Write failing tests in `tests/unit/components/CollectionGridCardFull.test.ts`:
- Renders card name and edition
- Does NOT have inline touch event listeners in template
- Uses useSwipe composable (mock it and verify it's called with threshold: 80)
- swipeStyle uses clamped offset

**GREEN phase:**

Create `src/components/collection/CollectionGridCardFull.vue`:

1. **Extract from current CollectionGridCard.vue:**
   - Template: lines 418-697 (the full branch, ~280 lines). Remove the `v-else` — this is now the root template.
   - Script: ALL script logic that the full variant uses but compact does NOT:
     - `cardRef` ref (line 58)
     - `STATUS_ORDER`, `setStatus` (lines 69-84)
     - `togglePublic` (lines 144-165)
     - `allocationInfo`, `isCardAllocated` (allocation computeds)
     - `getStatusColor`, `getStatusIconName` functions
     - `priceChangeData`, `showSparkline` computeds
     - Context menu setup (useContextMenu)
   - Script: Shared logic that BOTH variants need (duplicate in Full):
     - IntersectionObserver price lazy-fetch
     - `parsedImage`, `getCardImage`, `hasImage`, `imageLoaded`
     - CK prices, split-card detection

2. **Wire useSwipe (ARCH-06):**
   Replace the inline touch handlers (current lines 86-127) with:
   ```typescript
   import { useSwipe } from '../../composables/useSwipe'

   const cycleStatus = async () => {
     if (props.readonly || props.isBeingDeleted) return
     const currentIndex = STATUS_ORDER.indexOf(props.card.status)
     const nextIndex = (currentIndex + 1) % STATUS_ORDER.length
     const nextStatus = STATUS_ORDER[nextIndex] ?? 'collection'
     try {
       await collectionStore.updateCard(props.card.id, { status: nextStatus })
       toastStore.show(t('cards.grid.statusChanged', { status: nextStatus ?? '' }), 'success')
     } catch {
       toastStore.show(t('cards.grid.statusError'), 'error')
     }
   }

   const { isSwiping, swipeOffset } = useSwipe(cardRef, {
     threshold: 80,
     onSwipeLeft: () => {
       if (props.readonly || props.isBeingDeleted) return
       emit('delete', props.card)
     },
     onSwipeRight: () => { void cycleStatus() },
   })

   // Clamped offset for visual indicator (matching current ±120 clamp)
   const clampedOffset = computed(() => Math.max(-120, Math.min(120, swipeOffset.value)))
   const swipeStyle = computed(() =>
     isSwiping.value ? { transform: `translateX(${clampedOffset.value}px)`, transition: 'none' } : {}
   )
   const swipeIndicator = computed(() => {
     if (clampedOffset.value < -40) return 'delete'
     if (clampedOffset.value > 40) return 'status'
     return null
   })
   ```

3. **Remove inline touch handlers from template:**
   The current template at line ~424 has `@touchstart="handleTouchStart" @touchmove="handleTouchMove" @touchend="handleTouchEnd"`. These MUST be removed. useSwipe attaches listeners via `addEventListener` in `onMounted` on the `cardRef` element.

4. **Delete the inline `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` functions** — replaced by useSwipe.

5. **Delete the inline `startX` ref** — useSwipe manages its own state.

6. **Delete `SWIPE_THRESHOLD` constant** — threshold is passed to useSwipe option.

Run `npm run test:unit` — confirm GREEN. Run `npx vite build` — confirm no type errors.

**Post-implementation verification:**
```bash
grep -n "@touchstart\|@touchmove\|@touchend" src/components/collection/CollectionGridCardFull.vue
# Must return 0 matches — no inline touch handlers
grep -n "handleTouchStart\|handleTouchMove\|handleTouchEnd" src/components/collection/CollectionGridCardFull.vue
# Must return 0 matches — inline handlers deleted
grep -n "useSwipe" src/components/collection/CollectionGridCardFull.vue
# Must return 1+ matches — composable is wired
```
  </action>
  <verify>
    <automated>npm run test:unit && npx vite build 2>&1 | tail -5 && grep -c "@touchstart\|@touchmove\|@touchend" src/components/collection/CollectionGridCardFull.vue | grep "^0$" && grep -c "useSwipe" src/components/collection/CollectionGridCardFull.vue</automated>
  </verify>
  <done>CollectionGridCardFull exists with useSwipe wired. No inline touch handlers remain. Swipe behavior preserved (threshold 80, clamp ±120, left=delete, right=cycle status). All tests pass. Build succeeds. ARCH-05 and ARCH-06 delivered.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Touch events → card state mutation | Swipe gestures trigger status changes and delete events |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03D-01 | Tampering | Swipe could trigger unintended status change | mitigate | readonly/isBeingDeleted guard in onSwipeRight/Left callbacks. Same guards as current inline handlers. |
| T-03D-02 | Denial of Service | Rapid swipes could spam updateCard calls | accept | Existing behavior — useSwipe resets state on touchend, preventing overlapping swipes. No regression. |
</threat_model>

<verification>
After both tasks complete:

1. `npm run test:unit` — all tests pass including new useSwipe, shell, and Full tests
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **ARCH-05 verification:**
   - `wc -l src/components/collection/CollectionGridCard.vue` — under 30 lines (routing shell)
   - CollectionGridCardCompact.vue exists
   - CollectionGridCardFull.vue exists
5. **ARCH-06 verification:**
   - `grep -c "@touchstart\|@touchmove\|@touchend" src/components/collection/CollectionGridCardFull.vue` → 0
   - `grep -c "handleTouchStart\|handleTouchMove\|handleTouchEnd" src/components/collection/CollectionGridCardFull.vue` → 0
   - `grep -c "useSwipe" src/components/collection/CollectionGridCardFull.vue` → 1+
6. **Consumer API preserved:**
   - `grep -n "CollectionGridCard" src/components/collection/CollectionGrid.vue` — same import, same usage
7. **E2E:** existing `e2e/specs/collection/` tests should pass unchanged (DOM structure preserved for the grid selectors).
</verification>

<success_criteria>
- CollectionGridCard.vue is a thin routing shell under 30 lines
- CollectionGridCardCompact.vue renders compact variant
- CollectionGridCardFull.vue renders full variant with useSwipe (no inline touch handlers)
- Swipe threshold is 80px, offset clamped ±120px
- CollectionGrid.vue unchanged (zero consumer API changes)
- useSwipe.ts has unit tests
- All tests pass, build succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/03-collectionview-decomposition/03-D-SUMMARY.md`
</output>
