---
name: design-status
description: Diff read-only app (rutas Vue) ↔ Claude Design (cards HTML) ↔ Figma (frames) usando cranial-design/mapping.json — reporta gaps, deriva, deprecated/orphan conocidos y discrepancias de nodeIds. No escribe nada.
user-invocable: true
disable-model-invocation: true
---

# design-status — Diagnóstico de cobertura app ↔ Design ↔ Figma

Automatiza el diagnóstico manual que se hizo a mano el 2026-07-06
(`cranial-design/PLAN-BUSCADORES-SYNC.md`). Comparás el inventario que declara
`mapping.json` contra las tres fuentes reales (código, Claude Design, Figma) y
reportás gaps y deriva. **Este skill es READ-ONLY: NO escribe nada en Claude
Design, ni en Figma, ni en el repo.**

## IDs y rutas concretas (no adivinar)

- **Manifiesto (contrato):** `cranial-design/mapping.json` — LÉELO ENTERO antes de nada.
- **Claude Design:** proyecto "Cranial Trading — Site", projectId
  `8d44c2c8-9cb3-4c60-bf52-4d9d320f746e`. Herramienta **`DesignSync`**
  (método `list_files`).
- **Figma:** file `e3sqsTngAP72nkjqSpfmdO`. MCP `mcp__figma__get_metadata`.
  Tres páginas: Screens `21:3`, Flujos/Modales `84:2`, Components `9:3`.
- **Router de la app:** `src/router/index.ts`.
- **Prototipo (cards fuente):** `cranial-design/prototype/*.html`.

## Dónde corre cada paso (IMPORTANTE)

`DesignSync` **solo está disponible en la sesión principal**, NO en subagentes.
Ejecutá los pasos de DesignSync en la sesión que corre este skill; no los
delegues a un subagente. Los pasos de Figma y de filesystem sí pueden delegarse.

## Paso 1 — Cargar el manifiesto y derivar el inventario esperado

1. Leé `cranial-design/mapping.json` completo.
2. Para cada entrada armá el inventario esperado:
   - `id`, `kind` (screen | flow | component), `ruta`, `vue[]`, `estado`.
   - Cards esperados: `designCards.desktop`, `designCards.mobile` (un `null`
     significa "no se espera card" — NO es un gap salvo que `estado` lo indique).
   - Frames esperados: `figma.desktop`, `figma.mobile`, `figma.page`.
3. Agrupá las entradas por `estado`: `ok`, `gap`, `deprecated-nav`, `orphan-code`.
   Las de estado ≠ `ok` son hallazgos **conocidos** (ya documentados en el
   manifiesto), NO deriva nueva. Guardá esa lista aparte.

**Check:** el manifiesto tiene ~54 entradas (pantallas 01–38, flujos 60–85,
componentes). Si `list_files`/metadata devuelven cantidades muy distintas del
esperado, es señal de deriva real, no de error de lectura.

## Paso 2 — Comparar contra las rutas reales del router (fuente A)

1. Leé `src/router/index.ts` y extraé las rutas reales (`path:` de cada `route`),
   incluidos redirects (`/`, `/contacts`, `/dashboard`, legacy `/decks/*`).
2. Para cada entrada con `kind: screen` y `ruta` no nula, verificá que esa ruta
   exista en el router.
3. Cazá deriva de ruta:
   - **Ruta en el router sin entrada en el manifiesto** → deriva (pantalla nueva
     sin mapear).
   - **Entrada con `ruta` no nula que ya no existe en el router** → deriva
     (mapa desactualizado), salvo que `estado` sea `deprecated-nav`/`orphan-code`
     (esos ya están anotados; ver nota del manifiesto).

**Check:** hoy la app tiene 22 vistas ruteadas. `/market` existe pero está fuera
del nav (`estado: deprecated-nav`) — es conocido, no deriva. `/contacts`
redirige a `/saved-matches?tab=contacts` — conocido.

## Paso 3 — Comparar contra Claude Design (fuente B)

1. `DesignSync` → `list_files` sobre projectId
   `8d44c2c8-9cb3-4c60-bf52-4d9d320f746e`. Obtenés la lista de cards del proyecto.
2. Para cada `designCards.desktop`/`.mobile` no nulo del manifiesto, verificá que
   el card exista en Design.
3. Cazá deriva de card:
   - **Card en el manifiesto que no está en Design** → gap (falta card).
   - **Card en Design que no aparece en ningún `designCards` del manifiesto** →
     deriva (card sin mapear).
4. Cruzá también con `cranial-design/prototype/*.html` (los HTML fuente): un card
   listado en el manifiesto cuyo `.html` no existe en `prototype/` es una
   inconsistencia de fuente.

**Check:** en el diagnóstico del 06-jul había ~98 cards (46 pantallas + 52
flujos + 3 componentes + shell-reference). Los componentes (`component-*`) y
`shell-reference` tienen `designCards` parcialmente `null` — no los reportes como
gap (el manifiesto anota que su card HTML no está documentado o es compuesto).

## Paso 4 — Comparar contra Figma (fuente C)

1. `mcp__figma__get_metadata` sobre el file `e3sqsTngAP72nkjqSpfmdO`, una vez por
   página: `21:3` (Screens), `84:2` (Flujos/Modales), `9:3` (Components).
2. Para cada entrada con `figma.desktop`/`.mobile` no nulo, verificá que el
   nodeId exista en la página `figma.page` declarada.
3. Cazá:
   - **NodeId del manifiesto ausente en la página** → discrepancia de inventario
     (frame borrado/movido).
   - **Frame en la página sin nodeId correspondiente en el manifiesto** → deriva
     (frame sin mapear).
   - **NodeId presente pero en página distinta a la declarada** → discrepancia
     de nodeId.

**Check:** el 06-jul se verificaron 46/46 frames en `21:3`, 52/52 en `84:2` y
Badge/Button/Input + shell en `9:3`.

## Paso 5 — Reporte (4 secciones)

Presentá exactamente estas cuatro secciones. NO inventes severidades nuevas ni
mezcles hallazgos conocidos con deriva nueva.

```
design-status — <fecha>
========================
Manifiesto: cranial-design/mapping.json (<N> entradas)
Fuentes: router (src/router/index.ts) · Claude Design (list_files) · Figma (get_metadata 21:3 / 84:2 / 9:3)

1) GAPS (falta card o frame para algo mapeado)
   - <id> · <ruta> · falta: <card desktop|mobile / frame desktop|mobile>

2) DERIVA NUEVA (existe pero no está en el manifiesto)
   - Ruta en router sin entrada: <path>
   - Card en Design sin mapear: <archivo>
   - Frame en Figma sin mapear: <nodeId> (página <pág>)

3) CONOCIDOS (leídos del manifiesto — NO son hallazgos nuevos)
   - gap:            <id> — <nota>
   - deprecated-nav: <id> — <nota>
   - orphan-code:    <id> — <nota>

4) DISCREPANCIAS DE nodeIds
   - <id> · <lado> · manifiesto=<nodeId> · figma=<ausente | otra página | otro nodeId>

Veredicto: <inventario completo / N gaps reales / N derivas>
```

**Regla de oro para no producir falsos positivos:** una entrada con `estado`
`gap`, `deprecated-nav` u `orphan-code` va SIEMPRE a la sección 3 (Conocidos),
nunca a Gaps ni a Deriva. Ejemplo: `01b-login-results` tiene `estado: gap` y sus
cards/frames en `null` porque otro agente lo construye en paralelo (TASK-085,
prod v1.37) — reportalo como gap conocido, no como deriva nueva, incluso si ya
apareció un `01b-login-results-*.html` en `prototype/` (en ese caso anotá
"gap en cierre — pendiente actualizar mapping.json", ver Errores conocidos).

**Paridad con el diagnóstico manual del 06-jul (criterio de aceptación):** el
veredicto debe coincidir con `PLAN-BUSCADORES-SYNC.md` §1 — inventario ≈ completo
en ambos destinos; único gap funcional real = estado landing-resultados
(`01b-login-results`); higiene Figma pendiente (2 nodos basura, ver abajo); IA
post-RED (Contacts→tab, Market→fuera de nav) ya anotada como `deprecated-nav`.

## Límites (qué NO hace)

- No escribe cards en Claude Design ni frames en Figma.
- No modifica `mapping.json`, ni el prototipo, ni el código.
- No verifica **fidelidad visual** frame-a-frame (contenido, píxeles) — solo
  inventario (existencia y nodeIds). La fidelidad fina vive en
  `cranial-design/audit/` (auditoría del 03-jul), no en este skill.
- No crea tickets. Si detecta deriva accionable, la reporta para que el humano
  decida (típicamente `/design-push` o `/design-pull`).

## Errores conocidos

- **DesignSync ausente en subagentes:** si delegaste el Paso 3 a un subagente,
  `DesignSync` no estará disponible allí. Corré ese paso en la sesión principal.
- **Nodos basura en Figma `84:2`:** `98:773` (optDivWrap) y `104:151` ("F") son
  ruido conocido pendiente de borrar (Fase 0 higiene). Si aparecen como frames
  sin mapear, marcalos como "basura conocida (Fase 0)", NO como deriva nueva.
- **`01b-login-results` en cierre:** el manifiesto lo declara `gap` con cards
  `null`, pero puede que ya exista `01b-login-results-desktop.html` (y mobile) en
  `prototype/`. Eso es un gap cerrándose por el agente paralelo — anótalo como
  "pendiente actualizar mapping.json", no como deriva.
- **Componentes y shell:** `component-badge/button/input` y `shell-reference`
  tienen `designCards`/`figma` parcialmente `null` a propósito (viven en page
  `9:3` como component-sets, no como frame único). Nunca los reportes como gap.
