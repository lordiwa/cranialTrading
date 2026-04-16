---
phase: 03-collectionview-decomposition
plan: E
type: execute
wave: 4
depends_on:
  - C
  - D
files_modified:
  - src/views/CollectionView.vue
  - src/views/DeckView.vue
  - src/views/BinderView.vue
  - package.json
  - CLAUDE.md
autonomous: false
requirements:
  - ARCH-02
  - ARCH-05
  - ARCH-06
  - NICE-07
  - NICE-08
  - NICE-09
  - NICE-10

must_haves:
  truths:
    - "CollectionView.vue is under 400 lines (D-06 primary target) or under 600 lines (D-06 acceptable range) after final cleanup"
    - "DeckView.vue is under 600 lines"
    - "BinderView.vue is under 400 lines"
    - "No dead imports, unused refs, or orphaned functions remain in any of the 3 views"
    - "All Phase 03 requirements are verified as delivered"
    - "Version bumped appropriately in package.json"
    - "CLAUDE.md updated to reflect new file structure"
    - "E2E test suite passes"
    - "User verifies on dev environment that navigation between views works correctly"
  artifacts:
    - path: "src/views/CollectionView.vue"
      provides: "Thinned collection-only view — under 600 lines"
    - path: "src/views/DeckView.vue"
      provides: "Standalone deck editor view — under 600 lines"
    - path: "src/views/BinderView.vue"
      provides: "Standalone binder editor view — under 400 lines"
    - path: "package.json"
      provides: "Version bumped for Phase 03 release"
  key_links:
    - from: "All 3 views"
      to: "src/composables/useCollectionImport.ts + useDeckDeletion.ts + useCollectionFilterUrl.ts"
      via: "Composable wiring verified via import grep"
    - from: "src/components/collection/CollectionGridCard.vue"
      to: "CollectionGridCardCompact.vue + CollectionGridCardFull.vue"
      via: "Routing shell delegates correctly"
---

<objective>
Final cleanup, verification, and release for Phase 03. Verify all views are within line targets, remove dead code, run full test suite including E2E, bump version, and get user sign-off on dev environment.

Purpose: Closeout plan ensures no loose ends from the 4 preceding plans. Confirms every requirement is delivered and every decision is honored. User verifies the live decomposition works on the dev environment before any production consideration.

Output: Clean views within line targets, version bumped, CLAUDE.md updated, phase SUMMARY.
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
@.planning/phases/03-collectionview-decomposition/03-A-SUMMARY.md
@.planning/phases/03-collectionview-decomposition/03-B-SUMMARY.md
@.planning/phases/03-collectionview-decomposition/03-C-SUMMARY.md
@.planning/phases/03-collectionview-decomposition/03-D-SUMMARY.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Final cleanup — dead code audit, line count verification, version bump</name>
  <files>
    src/views/CollectionView.vue,
    src/views/DeckView.vue,
    src/views/BinderView.vue,
    package.json,
    CLAUDE.md
  </files>
  <action>
**Step 1: Dead code audit on all 3 views**

Read each view in full. For every import statement, verify it is used in the file. For every function/computed/ref, verify it has a consumer (either in the template or another function in the same file).

```bash
# Check for unused imports in all 3 views
npx vue-tsc --noEmit 2>&1 | grep -i "unused\|declared but"
```

Remove any dead imports, unused refs, or orphaned functions found. This is common after large extractions.

**Step 2: Line count verification**

```bash
wc -l src/views/CollectionView.vue src/views/DeckView.vue src/views/BinderView.vue
wc -l src/components/collection/CollectionGridCard.vue
```

Targets per D-06:
- CollectionView.vue: under 400 lines (ideal) or under 600 lines (acceptable)
- DeckView.vue: under 600 lines
- BinderView.vue: under 400 lines
- CollectionGridCard.vue routing shell: under 30 lines

If any view exceeds its target, identify what can be further extracted. Possible candidates:
- Keyboard shortcuts (~40 lines in CollectionView) could become an inline composable or be left as-is
- Bulk selection machinery (~200 lines) could become useCollectionBulkActions if needed
- Modal visibility refs are too small to extract meaningfully — leave

If CollectionView is between 400-600 lines after honest cleanup, that meets D-06's acceptable range. Do NOT force artificial splits.

**Step 3: Requirements verification checklist**

Run these verification commands and document results:
```bash
# ARCH-02: CollectionView decomposed into composables
wc -l src/views/CollectionView.vue  # < 600

# ARCH-05: CollectionGridCard split
wc -l src/components/collection/CollectionGridCard.vue  # < 30 (shell)
ls src/components/collection/CollectionGridCardCompact.vue src/components/collection/CollectionGridCardFull.vue

# ARCH-06: No inline touch handlers
grep -c "@touchstart\|@touchmove\|@touchend" src/components/collection/CollectionGridCardFull.vue  # 0
grep -c "useSwipe" src/components/collection/CollectionGridCardFull.vue  # 1+

# NICE-07: No redundant computed
grep -c "computed(() => props.cards)" src/components/collection/CollectionGrid.vue  # 0

# NICE-08: Store call at setup
grep -c "const collectionStore = useCollectionStore()" src/composables/useCollectionTotals.ts  # 1

# NICE-09: collectionSummary is computed
grep "const collectionSummary = computed\|const collectionSummary = ref" src/stores/collection.ts

# NICE-10: URL filter sync
grep -c "useCollectionFilterUrl" src/views/CollectionView.vue  # 1+

# D-01: Route split
grep "DeckView\|BinderView" src/router/index.ts  # routes exist

# D-03: viewMode eliminated
grep -c "viewMode" src/views/CollectionView.vue  # 0

# D-05: Module-scoped flags in composables
grep -c "let isImportRunning" src/composables/useCollectionImport.ts  # 1
grep -c "let isDeleteRunning" src/composables/useDeckDeletion.ts  # 1
grep -c "let isImportRunning\|let isDeleteRunning" src/views/CollectionView.vue  # 0

# D-12: No parallel siblings in same file
grep -c "handleDeckGrid\|handleBinderGrid" src/views/CollectionView.vue  # 0

# localStorage keys preserved
grep -rn "cranial_deck_import_progress" src/  # only in useCollectionImport.ts
grep -rn "cranial_delete_deck_progress" src/  # only in useDeckDeletion.ts
```

**Step 4: Version bump**

```bash
npm version minor --no-git-tag-version
```

This is a minor bump: new route-level views, new composables, new component variants — all new feature surface.

**Step 5: CLAUDE.md updates**

Update CLAUDE.md to reflect new file structure:
- Add DeckView.vue and BinderView.vue to the "Files Often Modified Together" section
- Update the Architecture section if it references CollectionView's internal modes
- Update any references to CollectionGridCard swipe handling to note useSwipe usage
- Add note about the 3-view architecture: "CollectionView (card grid), DeckView (deck editor), BinderView (binder editor) are separate route-level views — no shared viewMode state"

**Step 6: Full test suite**

```bash
npm run test:unit
npx vue-tsc --noEmit
npx vite build
npm run e2e  # Full E2E suite — per CLAUDE.md, must run before pushing
```

Fix any failures. E2E tests may need updates if they navigate via /collection?deck=X (now /decks/X) or reference viewMode-specific selectors.
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -5 && wc -l src/views/CollectionView.vue src/views/DeckView.vue src/views/BinderView.vue src/components/collection/CollectionGridCard.vue</automated>
  </verify>
  <done>All views within line targets. No dead code. Version bumped. CLAUDE.md updated. Full test suite (unit + E2E) passes. Build succeeds.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: User verification of Phase 03 decomposition on dev environment</name>
  <files></files>
  <action>
Present the Phase 03 completion summary to the user and request verification on the dev environment. The user needs to confirm:

1. Navigation between Collection, Decks, and Binders tabs works via route changes (not internal state)
2. Direct linking to /decks/:id and /binders/:id loads the correct content
3. Filter state persists in URL and survives page refresh
4. Card swipe on mobile still works (left=delete, right=cycle status)
5. Import and delete-deck operations work from DeckView
6. Binder operations work from BinderView

Wait for user response before marking phase complete.
  </action>
  <verify>User confirms functionality works on dev environment</verify>
  <done>User has verified all Phase 03 deliverables on the dev environment. Phase is ready for production merge consideration.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| No new boundaries | Closeout plan only cleans up and verifies existing work |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03E-01 | Denial of Service | E2E tests may fail due to route changes | mitigate | Fix E2E selectors and navigation paths to match new route structure |
| T-03E-02 | Information Disclosure | Version bump exposes Phase 03 changes to users | accept | This is intentional — new routes are a feature |
</threat_model>

<verification>
After all tasks complete:

1. **Unit tests:** `npm run test:unit` — all pass (542+ original + ~30 new Phase 03 tests)
2. **Type check:** `npx vue-tsc --noEmit` — 0 errors
3. **Build:** `npx vite build` — succeeds
4. **E2E:** `npm run e2e` — all pass
5. **Line counts:**
   - CollectionView.vue < 600 lines
   - DeckView.vue < 600 lines
   - BinderView.vue < 400 lines
   - CollectionGridCard.vue < 30 lines (shell)
6. **Requirements verified:** All 7 requirements (ARCH-02, ARCH-05, ARCH-06, NICE-07, NICE-08, NICE-09, NICE-10) confirmed delivered
7. **User sign-off:** Dev environment verified working
</verification>

<success_criteria>
- All views within D-06 line targets
- Zero dead code in any view
- Version bumped (minor)
- CLAUDE.md updated with new architecture
- Full test suite passes (unit + E2E)
- User verifies on dev environment
- Phase 03 SUMMARY written
</success_criteria>

<output>
After completion, create `.planning/phases/03-collectionview-decomposition/03-E-SUMMARY.md`
</output>
