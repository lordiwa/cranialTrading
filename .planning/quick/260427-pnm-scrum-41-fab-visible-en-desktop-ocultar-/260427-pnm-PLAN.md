---
phase: 260427-pnm-scrum-41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ui/FloatingActionButton.vue
  - src/components/decks/DeckEditorGrid.vue
autonomous: true
requirements:
  - SCRUM-41
must_haves:
  truths:
    - "FAB con icono '+' es visible en desktop (md+) en DeckView, BinderView y CollectionView"
    - "FAB sigue visible en mobile (sin regresión vs comportamiento previo)"
    - "Click en FAB sigue abriendo el AddCardModal en las 3 vistas"
    - "El placeholder '+' arriba del grid de binder virtual scroll (DeckEditorGrid líneas ~492-505) ya NO se ve en ningún viewport"
    - "El placeholder '+' al final de cada grupo del grid regular (DeckEditorGrid línea ~631) ya NO se ve en ningún viewport"
    - "El empty state placeholder grande (DeckEditorGrid línea ~479-489, cuando cards.length === 0) SIGUE visible como CTA principal en mobile y desktop"
  artifacts:
    - path: "src/components/ui/FloatingActionButton.vue"
      provides: "FAB compartido sin md:hidden"
      contains: "fixed bottom-16 right-4"
    - path: "src/components/decks/DeckEditorGrid.vue"
      provides: "Grid de cartas con placeholders inline ocultos en todos los viewports"
      contains: "decks.editorGrid.emptyBoard"
  key_links:
    - from: "src/components/ui/FloatingActionButton.vue"
      to: "src/views/DeckView.vue, src/views/BinderView.vue, src/views/CollectionView.vue"
      via: "componente compartido — el cambio de md:hidden propaga a las 3 vistas automáticamente"
      pattern: "FloatingActionButton"
---

<objective>
SCRUM-41: Hacer el FAB ('+') visible también en desktop (actualmente solo mobile via `md:hidden`) y, como consecuencia, ocultar los placeholders inline `+` del grid del editor (binder virtual scroll header + final de cada grupo) en todos los viewports. Mantener el empty state placeholder grande cuando `cards.length === 0` porque sirve como CTA principal cuando no hay cartas.

Purpose: El FAB ya cubre el caso de "agregar carta" en mobile. Extenderlo a desktop unifica la UX entre viewports y elimina los placeholders inline duplicados que ahora compiten visualmente con el FAB.

Output: Cambio CSS/template puro en 2 archivos. Sin cambios de lógica, sin tests nuevos (CLAUDE.md "When to Skip TDD" → UI/styling only).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/components/ui/FloatingActionButton.vue
@src/components/decks/DeckEditorGrid.vue
@src/views/DeckView.vue
@src/views/BinderView.vue
@src/views/CollectionView.vue

<interfaces>
<!-- Estado actual relevante extraído del código (executor no necesita re-explorar) -->

`src/components/ui/FloatingActionButton.vue` línea 18 (estado actual):
```
class="fixed bottom-16 right-4 z-50 w-12 h-12 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all md:hidden"
```
→ Debe quedar (sin `md:hidden`):
```
class="fixed bottom-16 right-4 z-50 w-12 h-12 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all"
```

`src/components/decks/DeckEditorGrid.vue`:
- Línea 479-489: empty state cuando `cards.length === 0` → NO TOCAR. Sigue siendo CTA visible en mobile y desktop.
- Línea 494-505 (binder virtual scroll, header `+` placeholder): el `<div class="mb-3">` envuelve un `<div class="cursor-pointer group inline-block">` que dispara `emit('addCard')`. Actualmente NO tiene clase de ocultamiento. Debe ocultarse en todos los viewports → cambiar el wrapper externo a `class="hidden"` (o eliminar el bloque completo dentro del `<!-- Add card placeholder (top) -->` comentario; preferir `class="hidden"` para minimizar diff).
- Línea 630-642 (regular grouped grid, final-of-group `+` placeholder): el `<div class="hidden md:block md:mt-3">` debe pasar a `<div class="hidden">` para ocultarse también en desktop.

Vistas que usan el FAB compartido (sin cambios necesarios — heredan el cambio del componente):
- `src/views/DeckView.vue` ~línea 1276-1284
- `src/views/BinderView.vue` ~línea 796-804
- `src/views/CollectionView.vue` línea 28 (import) — el FAB se usa más abajo en el template

Los 3 archivos pasan el FAB con `<Teleport to="body">` y reciben `:style="fabBottomStyle"` para offset por footer/stats. Ese comportamiento se preserva.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Quitar `md:hidden` del FAB compartido y ocultar placeholders inline del DeckEditorGrid (atomic — Anti-Loop Rule 6)</name>
  <files>src/components/ui/FloatingActionButton.vue, src/components/decks/DeckEditorGrid.vue</files>
  <action>
Aplicar los 3 sub-cambios atómicamente (todos los siblings en paralelo per CLAUDE.md Anti-Loop Rule 6):

**Sub-cambio A — `src/components/ui/FloatingActionButton.vue` línea 18:**
Eliminar el token `md:hidden` del classlist del `<button>`. Resto del classlist se mantiene intacto.

Antes:
```
class="fixed bottom-16 right-4 z-50 w-12 h-12 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all md:hidden"
```

Después:
```
class="fixed bottom-16 right-4 z-50 w-12 h-12 bg-neon text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-neon/90 active:scale-95 transition-all"
```

Esto propaga a DeckView, BinderView y CollectionView (todas usan este componente compartido — ver `<interfaces>`).

**Sub-cambio B — `src/components/decks/DeckEditorGrid.vue` placeholder del binder virtual scroll (~línea 494):**

Antes (líneas ~493-505):
```vue
<!-- Add card placeholder (top) -->
<div class="mb-3">
  <div
    class="cursor-pointer group inline-block"
    @click="emit('addCard')"
  >
    <div
      class="w-20 md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px] aspect-[3/4] border-2 border-dashed border-silver-30 hover:border-neon flex items-center justify-center transition-all duration-150"
    >
      <span class="text-h1 font-light text-silver-30 group-hover:text-neon transition-colors">+</span>
    </div>
  </div>
</div>
```

Después: cambiar el wrapper externo `<div class="mb-3">` a `<div class="hidden">` (mantener el bloque interno completo intacto — no eliminar nada para minimizar diff y permitir revert fácil si Rafael quiere recuperar el placeholder en algún caso futuro). Actualizar también el comentario para reflejar el nuevo comportamiento.

Resultado:
```vue
<!-- Add card placeholder (top) — hidden everywhere; FAB covers all viewports (SCRUM-41) -->
<div class="hidden">
  <div
    class="cursor-pointer group inline-block"
    @click="emit('addCard')"
  >
    <div
      class="w-20 md:w-[85px] lg:w-[105px] xl:w-[130px] 2xl:w-[182px] aspect-[3/4] border-2 border-dashed border-silver-30 hover:border-neon flex items-center justify-center transition-all duration-150"
    >
      <span class="text-h1 font-light text-silver-30 group-hover:text-neon transition-colors">+</span>
    </div>
  </div>
</div>
```

**Sub-cambio C — `src/components/decks/DeckEditorGrid.vue` placeholder del grid regular (~línea 631):**

Antes:
```vue
<!-- Add card placeholder (hidden on mobile — FAB covers; visible md+ where there is no FAB) -->
<div class="hidden md:block md:mt-3">
```

Después:
```vue
<!-- Add card placeholder — hidden everywhere; FAB covers all viewports (SCRUM-41) -->
<div class="hidden">
```

Solo cambia el classlist del wrapper y el comentario. El bloque interno (`<div class="inline-block cursor-pointer group">` con su `@click="emit('addCard')"`) queda intacto.

**NO TOCAR:**
- Empty state placeholder en líneas 479-489 (`v-if="cards.length === 0"`). Sigue siendo CTA principal cuando no hay cartas.
- Lógica del FAB (`emit('click')`, `:label`, `:icon`, `:style="fabBottomStyle"`).
- DeckView, BinderView, CollectionView — heredan el cambio del FAB compartido. NO modificar esas vistas.
- Cualquier otro placeholder o handler de `addCard` no listado arriba.

**Verificación final post-edit:**
1. Grep en `src/components/decks/DeckEditorGrid.vue` para `addCard` — debe haber exactamente 3 emits: el del empty state (visible), el del binder virtual scroll (oculto), el del grid regular (oculto).
2. Grep en `src/components/ui/FloatingActionButton.vue` para `md:hidden` — no debe haber matches.
  </action>
  <verify>
    <automated>npx vite build</automated>
  </verify>
  <done>
- `FloatingActionButton.vue` línea 18 ya no contiene `md:hidden`.
- `DeckEditorGrid.vue` línea ~494 wrapper es `<div class="hidden">` (era `<div class="mb-3">`).
- `DeckEditorGrid.vue` línea ~631 wrapper es `<div class="hidden">` (era `<div class="hidden md:block md:mt-3">`).
- Empty state (~líneas 479-489) intacto.
- `npx vite build` pasa sin errores nuevos.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verificación visual local por Rafael (NO commitear hasta confirmación — feedback_no_commit_without_local_verify)</name>
  <what-built>
- FAB ('+') visible en desktop además de mobile.
- Placeholders inline `+` del grid (binder virtual scroll header y final-of-group del grid regular) ocultos en todos los viewports.
- Empty state placeholder grande (cuando el deck/binder está vacío) sigue visible.
  </what-built>
  <how-to-verify>
1. `npm run dev` → abrir la app.
2. **Desktop (≥768px / md+):**
   - Ir a `/collection` → confirmar que el FAB '+' verde aparece abajo a la derecha.
   - Click en el FAB → debe abrir AddCardModal.
   - Ir a `/decks/:algunDeck` con cartas → confirmar FAB visible, y que NO hay placeholder `+` inline al final de cada grupo de cartas (era visible antes en md+).
   - Ir a `/binders/:algunBinder` con muchas cartas (>50, para activar virtual scroll si aplica) → confirmar FAB visible y que NO hay placeholder `+` inline arriba del grid.
   - Ir a un deck/binder VACÍO → confirmar que el empty state placeholder grande (cuadrado dashed con `+` y texto "decks.editorGrid.emptyBoard") SIGUE visible y clickable.
3. **Mobile (<768px, DevTools responsive):**
   - Repetir las 4 vistas anteriores → FAB visible (no regresión), placeholders inline ocultos (no regresión vs estado SCRUM-38), empty state visible cuando vacío.
4. Click en el FAB en cada vista → AddCardModal abre correctamente.
5. Si todo OK, responder "funciona en local" o "approved".
6. Si algo falla, describir el problema (preferentemente con screenshot/console error) — el executor no debe commitear hasta confirmación per `feedback_no_commit_without_local_verify`.
  </how-to-verify>
  <resume-signal>Rafael responde "funciona en local" / "approved" → executor procede a commit + push a develop. Si responde con problema → executor diagnostica antes de tocar más código (Anti-Loop Rule 5).</resume-signal>
</task>

</tasks>

<verification>
- `npx vite build` pasa.
- `npm run test:unit` pasa (no debe romper nada — cambio puramente CSS/template).
- Verificación visual manual en las 3 vistas (DeckView, BinderView, CollectionView) en mobile y desktop completada por Rafael.
- Empty state placeholder mantiene su comportamiento.
</verification>

<success_criteria>
- FAB visible en desktop en las 3 vistas (DeckView, BinderView, CollectionView).
- FAB visible en mobile (sin regresión).
- Placeholder inline del binder virtual scroll header oculto en todos los viewports.
- Placeholder inline del final-of-group del grid regular oculto en todos los viewports.
- Empty state placeholder visible cuando `cards.length === 0` en mobile y desktop.
- Build pasa sin errores nuevos.
- Rafael confirmó "funciona en local" antes del commit.
- Version bump apropiado (patch — UX tweak, no nueva funcionalidad ni breaking change).
</success_criteria>

<output>
After completion, create `.planning/quick/260427-pnm-scrum-41-fab-visible-en-desktop-ocultar-/260427-pnm-SUMMARY.md` con:
- Cambios exactos aplicados (3 sub-cambios listados).
- Confirmación de verificación visual por Rafael.
- Version bump aplicado en `package.json` (patch).
- Commit hash y referencia a SCRUM-41.
</output>
