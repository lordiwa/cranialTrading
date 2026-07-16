---
name: design-pull
description: Figma → Design → ticket. Dado nodeId(s) que el diseñador tocó en Figma, actualiza el/los card HTML del prototipo, sincroniza a Claude Design y crea un ticket en tasks/ con ACs derivados del diff visual. NUNCA toca código Vue.
user-invocable: true
disable-model-invocation: true
---

# design-pull `<nodeId...>` — Traer un cambio de Figma al prototipo + ticket

El diseñador editó uno o más frames en Figma. Este skill trae ese cambio al
prototipo HTML (Claude Design) y **crea un ticket** para que el flujo normal de
desarrollo lo implemente en Vue. **Este skill NO toca código Vue** — solo cards
HTML, `mapping.json` y el ticket.

**Input:** uno o más nodeIds de Figma (ej. `98:48`, `106:806`).

## IDs y rutas concretas

- **Manifiesto:** `cranial-design/mapping.json` (resuelve nodeId → entrada).
- **Figma:** file `e3sqsTngAP72nkjqSpfmdO`. Lectura:
  `mcp__figma__get_metadata`, `mcp__figma__get_design_context`,
  `mcp__figma__get_screenshot`. Páginas: Screens `21:3`, Flujos/Modales `84:2`,
  Components `9:3`.
- **Claude Design:** projectId `8d44c2c8-9cb3-4c60-bf52-4d9d320f746e`,
  herramienta `DesignSync` (`finalize_plan` + `write_files`).
- **Prototipo:** `cranial-design/prototype/*.html`.
- **Task store del repo principal:** `tasks/TASK-NNN.json` + `tasks/index.json`.

## Dónde corre cada paso

`DesignSync` **solo existe en la sesión principal**, no en subagentes: corré el
Paso 4 en la sesión que ejecuta el skill. La lectura de Figma (Pasos 2–3) puede
delegarse; la escritura de HTML y del ticket la hace la sesión principal.

## Paso 1 — Resolver nodeId(s) → entrada del manifiesto

1. Leé `cranial-design/mapping.json`.
2. Para cada nodeId de entrada, buscá la entrada cuyo `figma.desktop` o
   `figma.mobile` lo contenga. Anotá: `id`, `lado` (desktop/mobile), `figma.page`,
   los `designCards` (archivo HTML a editar) y los `vue[]` (para los ACs del
   ticket, NO para editarlos).
3. Si un nodeId no matchea ninguna entrada → es un frame nuevo/sin mapear.
   **PARÁ y reportá**: probablemente haya que crear la entrada primero (o el
   diseñador tocó un frame ajeno). No adivines a qué card corresponde.

**Check:** cada nodeId de entrada quedó asociado a exactamente un `id` + `lado` +
archivo HTML de `prototype/`.

## Paso 2 — Leer el estado actual del frame en Figma

Para cada nodeId:
1. `mcp__figma__get_design_context` (file `e3sqsTngAP72nkjqSpfmdO`, nodeId) para
   estructura, texto y estilos.
2. `mcp__figma__get_screenshot` del mismo nodeId para la referencia visual.

**Check:** tenés contexto + screenshot de cada frame tocado.

## Paso 3 — Diff visual contra el card HTML actual

1. Leé el/los `.html` de `prototype/` correspondientes.
2. Compará el screenshot/contexto de Figma contra el HTML actual y listá los
   cambios concretos (texto, layout, colores, componentes añadidos/quitados).
   Este diff es el insumo de los ACs del ticket — sé específico.

## Paso 4 — Actualizar el/los card HTML del prototipo

Editá SOLO los `.html` de las entradas afectadas, respetando el formato del
prototipo:

- **Primera línea intacta:** el marcador `<!-- @dsCard group="…" name="…" -->`
  NO se toca (define grupo y nombre del card en Claude Design). Si el diseñador
  renombró el frame, actualizá solo el atributo `name` — nunca borres el marcador.
- **Cards mobile:** conservá el bloque device frame (columna teléfono 390px):
  `html{background:#050505}` + `body{max-width:390px;margin:0 auto;...}` y el
  ajuste `.tabbar{...max-width:390px}`. No lo elimines al reescribir el body.
- **Autocontenido:** el card no debe depender de assets externos salvo la fuente
  Open Sans (link ya presente). Mantené la paleta (`--bg`, `--silver`, `--neon`,
  `--rust`) del `:root` existente.
- Aplicá el cambio a desktop **y** mobile si el diseñador tocó ambos lados
  (revisá si pasaron ambos nodeIds; si solo uno, editá solo ese lado y anótalo).

**Check:** `head -1` de cada card sigue siendo el marcador `@dsCard`; los cards
mobile conservan el bloque device frame.

## Paso 5 — Sincronizar a Claude Design (solo los cards afectados)

1. `DesignSync` → `finalize_plan` con la lista de escrituras. **`finalize_plan`
   exige el campo `deletes` aunque esté vacío — pasá `deletes: []`.**
2. `DesignSync` → `write_files` SOLO de los cards que cambiaron (nombre de archivo
   = ruta del card en el proyecto, a la raíz). No reescribas cards no afectados.

**Check:** `write_files` devolvió OK para exactamente los cards editados.

## Paso 6 — Crear el ticket en tasks/ (sin tocar Vue)

El código Vue lo cambia el flujo normal de tickets, NO este skill. Creá un ticket
con los ACs derivados del diff visual del Paso 3.

- **Preferido:** herramienta MCP
  `mcp__plugin_hivemind_hivemind-tasks__create_task` (asigna el próximo
  `TASK-NNN` y actualiza el índice sola).
- **Fallback a mano** (si el MCP no está disponible): escaneá `tasks/index.json`
  para el `TASK-NNN` más alto, incrementá, creá `tasks/TASK-<N+1>.json` con el
  schema del store (mirá `tasks/TASK-085.json` de ejemplo: `key`, `title`,
  `description`, `acceptance_criteria[]`, `status: "todo"`, `priority`, `labels`,
  `depends_on`, `created_at`, `updated_at`) y agregá la fila en
  `tasks/index.json` (`key`, `title`, `status`, `priority`).

Contenido del ticket:
- **title:** qué cambió, corto (ej. "Aplicar rediseño de CardDetailModal desde
  Figma (flujo 71)").
- **description:** qué frames tocó el diseñador (nodeIds), qué card(s) HTML se
  actualizaron, y el resumen del diff visual.
- **acceptance_criteria:** derivados del diff — cada cambio visual concreto que
  el dev debe reflejar en los `vue[]` de la entrada (listá esos archivos .vue
  como referencia, ej. `src/components/collection/CardDetailModal.vue`).
- **labels:** incluí `design-pull` y `ui`.

**Check:** el ticket existe con `status: todo` y ACs específicos y verificables;
`tasks/index.json` lo lista.

## Paso 7 — Actualizar mapping.json si cambió el inventario

- Si el diseñador **renombró** un frame → actualizá el `name` del `@dsCard` (Paso
  4) y, si aplica, la `nota` de la entrada.
- Si aparecieron **nuevos** frames/cards (ej. se materializó un lado antes
  `null`, o un `estado: gap` se cerró) → actualizá `figma.desktop/mobile`,
  `designCards.desktop/mobile` y `estado` (`gap` → `ok`) de la entrada.
- Si NO cambió el inventario (solo contenido del mismo frame), no toques
  `mapping.json`.

**Check:** `mapping.json` sigue siendo JSON válido y refleja los nodeIds/cards
reales tras el pull.

## Límites (qué NO hace)

- **NUNCA toca código Vue** ni ningún archivo bajo `src/`. Solo cards HTML de
  `prototype/`, `mapping.json` y el ticket. El cambio en Vue lo hace el flujo de
  tickets.
- No crea frames nuevos en Figma (eso es `/design-push`). Este skill trae Figma
  → prototipo, no al revés.
- No hace commits de git.

## Errores conocidos

- **DesignSync ausente en subagentes:** corré `finalize_plan`/`write_files` en la
  sesión principal.
- **`finalize_plan` exige `deletes`:** pasá `deletes: []` aunque no borres nada,
  o falla.
- **NodeId sin entrada en el manifiesto:** no inventes el card destino; pará y
  reportá (frame nuevo o ajeno).
- **No romper el marcador `@dsCard` ni el device frame:** son lo que hace que el
  card entre bien a Claude Design y se vea como teléfono en mobile.
- **Frames ajenos:** solo leés de Figma aquí; aun así, nunca uses `use_figma` en
  este skill — es read-only sobre Figma.
