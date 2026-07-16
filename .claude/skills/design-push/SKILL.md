---
name: design-push
description: Código → Design + Figma. Tras shippear un cambio de UI, regenera los cards HTML del prototipo desde los .vue reales, sincroniza a Claude Design y reconstruye los frames Figma correspondientes sin mover frames ajenos. Actualiza mapping.json y deja evidencia (screenshot/metadata).
user-invocable: true
disable-model-invocation: true
---

# design-push `<ruta|vista...>` — Llevar el código shipped a Design + Figma

Cierra el círculo del pipeline: después de que un cambio de UI se shippeó en la
app, este skill regenera los cards del prototipo desde los `.vue` reales y
reconstruye los frames de Figma para que Design y Figma reflejen lo que existe en
producción. Actualiza `mapping.json` y deja evidencia de la verificación.

**Input:** una o más rutas (`/collection`) o nombres de vista/entrada
(`11-collection`, `SavedMatchesView`).

## IDs y rutas concretas

- **Manifiesto:** `cranial-design/mapping.json` (resuelve ruta/vista → entrada).
- **Código:** `.vue` bajo `src/`; literales en `src/locales/es.json`.
- **Claude Design:** projectId `8d44c2c8-9cb3-4c60-bf52-4d9d320f746e`,
  `DesignSync` (`finalize_plan` + `write_files`).
- **Prototipo:** `cranial-design/prototype/*.html`.
- **Figma:** file `e3sqsTngAP72nkjqSpfmdO`. Lectura `mcp__figma__get_metadata` /
  `get_screenshot`; escritura `mcp__figma__use_figma`. Páginas: Screens `21:3`,
  Flujos/Modales `84:2`, Components `9:3`. **Convención de posición (page
  Flujos):** frame desktop en `x=0`, mobile en `x=1420`.

## Dónde corre cada paso

`DesignSync` **solo existe en la sesión principal**, no en subagentes: Paso 3 va
en la sesión que corre el skill. `use_figma` requiere haber cargado antes el
skill `/figma-use` (obligatorio). Podés delegar la lectura de código y de Figma;
la escritura (Design + Figma) la hace la sesión principal.

## Paso 1 — Resolver ruta/vista → entrada del manifiesto

1. Leé `cranial-design/mapping.json`.
2. Matcheá el input contra `ruta` (para pantallas) o contra el `id`/archivo en
   `vue[]` (para flujos/modales/componentes). Anotá por entrada: `id`, `kind`,
   `vue[]` (archivos fuente a leer), `designCards` (HTML a regenerar), `figma`
   (nodeIds a reconstruir) y `figma.page`.
3. Si el input no matchea ninguna entrada → **PARÁ y reportá**: es una vista nueva
   sin mapear (hay que crear la entrada + cards + frames primero, o revisar el
   input). No adivines.

**Check:** el input quedó resuelto a una o más entradas con sus `vue[]`,
`designCards` y `figma` nodeIds.

## Paso 2 — Regenerar el/los card HTML desde el código real

Para cada entrada, leé sus `vue[]` reales (+ `src/locales/es.json` para los
literales en español que muestran esos componentes) y regenerá los cards HTML
respetando el formato del prototipo:

- **Primera línea:** conservá/actualizá el marcador
  `<!-- @dsCard group="…" name="…" -->` (no lo borres; ajustá `name` si el título
  real de la vista cambió).
- **Cards mobile:** conservá el bloque device frame (columna 390px):
  `html{background:#050505}` + `body{max-width:390px;margin:0 auto;...}` +
  `.tabbar{...max-width:390px}`.
- **Autocontenido y paleta:** solo la fuente Open Sans como recurso externo;
  paleta del `:root` existente (`--bg` #000, `--silver`, `--neon` #5AC168,
  `--rust` #8B2E1F). Los literales visibles en español, tomados de `es.json`.
- Regenerá desktop **y** mobile de cada entrada afectada.

**Check:** `head -1` de cada card es el marcador `@dsCard`; los mobile conservan
el device frame; el contenido refleja el `.vue` shipped (no una versión vieja).

## Paso 3 — Sincronizar a Claude Design (solo los afectados)

1. `DesignSync` → `finalize_plan` con las escrituras. **Pasá `deletes: []`
   aunque no borres nada — el campo es obligatorio.**
2. `DesignSync` → `write_files` SOLO de los cards regenerados.

**Check:** `write_files` OK para exactamente los cards afectados; no se tocaron
cards de otras entradas.

## Paso 4 — Reconstruir los frames de Figma (sin mover frames ajenos)

Cargá primero el skill `/figma-use` (obligatorio antes de `use_figma`).

1. **Antes de escribir:** `mcp__figma__get_metadata` de la `figma.page` de la
   entrada para confirmar la posición y tamaño actuales de los frames a tocar
   (`figma.desktop`, `figma.mobile`). Anotá sus coordenadas.
2. `mcp__figma__use_figma` para reconstruir el contenido de ESOS frames desde el
   card HTML regenerado. Respetá la convención de posición (desktop `x=0`, mobile
   `x=1420` en la page Flujos) y el tamaño del frame existente.
3. **NUNCA muevas ni renombres frames ajenos.** Si necesitás un frame nuevo
   (inventario creció), creálo en espacio vacío de la página, sin desplazar los
   existentes.
4. **Cuidado con el auto-layout que colapsa:** al reescribir un frame con
   auto-layout, el contenido puede colapsar (alto 0, elementos recortados). Ya
   pasó en `98:48` (card-detail) y `98:427` (welcome-tour) y hubo que repararlos.

**Check:** después de escribir, `mcp__figma__get_metadata` de la página muestra
el **mismo conteo de frames** que antes (no se perdió ni duplicó ninguno) y los
frames ajenos siguen en su posición original.

## Paso 5 — Actualizar mapping.json

- Si cambiaron nodeIds (frame recreado con id nuevo), o se materializó un lado
  antes `null`, o un `estado: gap` se cerró → actualizá `figma.desktop/mobile`,
  `designCards.desktop/mobile`, `estado` (`gap` → `ok`) y la `nota` de la entrada.
- Si solo cambió el contenido de los mismos frames/cards (mismos ids) → no toques
  el inventario; a lo sumo actualizá la `nota`.

**Check:** `mapping.json` sigue siendo JSON válido y sus nodeIds coinciden con
los reales tras el push.

## Paso 6 — Evidencia de verificación

Dejá constancia de que Design y Figma quedaron correctos:
1. `mcp__figma__get_screenshot` de cada frame reconstruido (evidencia visual de
   que no colapsó).
2. `mcp__figma__get_metadata` de la página con el conteo de frames intacto
   (mismo número que antes del push).
Reportá ambos al humano como cierre del skill.

**Check:** screenshot(s) sin colapso + conteo de frames igual al inicial.

## Límites (qué NO hace)

- No modifica código Vue ni ningún archivo bajo `src/` — solo LEE el código para
  regenerar cards. Push es código→diseño, nunca al revés.
- No crea tickets (eso es parte del flujo de `/design-pull`).
- No hace commits de git.
- No rediseña: reproduce en Design/Figma lo que YA está shipped en la app.

## Errores conocidos

- **DesignSync ausente en subagentes:** corré `finalize_plan`/`write_files` en la
  sesión principal.
- **`finalize_plan` exige `deletes`:** pasá `deletes: []` siempre.
- **`use_figma` sin `/figma-use`:** cargá el skill `/figma-use` antes o la
  escritura falla / produce resultados pobres.
- **Auto-layout colapsa:** verificá SIEMPRE con screenshot post-escritura; frames
  `98:48` y `98:427` ya colapsaron una vez. Si colapsa, reparalo antes de cerrar.
- **Frames ajenos:** nunca los muevas/renombres; frames nuevos van a espacio
  vacío. Confirmá el conteo de frames con `get_metadata` antes y después.
- **Nodos basura en `84:2`:** `98:773` (optDivWrap) y `104:151` ("F") son ruido
  conocido pendiente de borrar (Fase 0); no los confundas con frames a reconstruir.
