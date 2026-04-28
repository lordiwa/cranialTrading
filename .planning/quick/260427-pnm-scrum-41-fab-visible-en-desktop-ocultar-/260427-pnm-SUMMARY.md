---
phase: 260427-pnm-scrum-41
plan: 01
status: complete
date: 2026-04-27
version: 1.28.1
jira: SCRUM-41
---

# SCRUM-41: FAB visible en desktop, ocultar placeholder `+` en grid

## Cambios aplicados

### `src/components/ui/FloatingActionButton.vue`
- Línea 18: eliminado token `md:hidden` del classlist del `<button>`. FAB ahora visible en mobile y desktop.

### `src/components/decks/DeckEditorGrid.vue`
- Línea ~494 (binder virtual scroll, header `+` placeholder): wrapper `<div class="mb-3">` → `<div class="hidden">`. Comentario actualizado a "hidden everywhere; FAB covers all viewports (SCRUM-41)".
- Línea ~631 (regular grouped grid, final-of-group `+` placeholder): wrapper `<div class="hidden md:block md:mt-3">` → `<div class="hidden">`. Comentario actualizado.
- Línea 482 (empty state placeholder): NO TOCADO. Sigue siendo CTA principal cuando `cards.length === 0`.

## Verificación

- `npx vite build` → ✅ built in 11.77s, sin errores
- `npm run test:unit` → ✅ 925/925 verdes
- Verificación visual local por Rafael → ✅ aprobada (deploy-dev invocado tras review)

## Vistas afectadas (heredan automáticamente del componente compartido)

- `src/views/DeckView.vue` — FAB visible ahora también desktop
- `src/views/BinderView.vue` — FAB visible ahora también desktop
- `src/views/CollectionView.vue` — FAB visible ahora también desktop

## Anti-Loop Rule 6

Los 3 sub-cambios siblings se aplicaron atómicamente en el mismo commit:
- A: FAB compartido sin `md:hidden`
- B: placeholder binder virtual scroll oculto
- C: placeholder grupo regular oculto

## Out of scope (confirmado)

- No tocado: empty state placeholder grande (línea 482).
- No tocado: posición/diseño del FAB (`fixed bottom-16 right-4`).
- No tocado: lógica `emit('addCard')`, `AddCardModal`, ni vistas DeckView/BinderView/CollectionView.

## Version bump

`package.json`: `1.28.0` → `1.28.1` (patch — UX tweak)

## Jira

- Ticket: https://cranialtrading.atlassian.net/browse/SCRUM-41
- Transición pendiente: Q/A tras push a develop
