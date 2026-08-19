# Informe AC1 — TASK-247

## 1. Camino de escritura de `public_cards`

**LEÍDO** (`src/services/publicCards.ts`): hay **3 caminos de escritura distintos para cartas**, todos client-side (SDK web, no Cloud Function), cada uno con su propio literal de objeto que define qué campos lleva el doc:

1. `syncCardToPublic` (línea 133) — un doc, invocado en `collection.ts:1657` (alta de carta) y `:1753` (edición de carta).
2. `batchSyncCardsToPublic` (línea 185) — `writeBatch` de 400, invocado en `collection.ts:1978` (operación bulk).
3. `syncAllUserCards` (línea 291) — `writeBatch` de 400, invocado en `collection.ts:2531` (resync completo del perfil, p.ej. al cambiar username/avatar).

Los tres literales son casi idénticos pero están escritos por separado (no hay una función única `buildPublicCardDoc`). Ninguno lee `scryfall_cache`; todos copian campos directo del objeto `Card` que ya tiene el cliente en memoria. Esto importa: si ese `Card` no trae `type_line`/`colors`/etc. (el defecto que TASK-245 acaba de corregir para `card_index`), `public_cards` heredaría el mismo vacío.

**LEÍDO**: no hay ninguna Cloud Function que escriba `public_cards` — el único hit en `functions/index.js` es una lectura de conteo (`db.collection('public_cards').count().get()`, línea 183) para un dashboard admin. No existe trigger `onWrite`/`onUpdate` sobre `users/{uid}/cards` que sincronice `public_cards`; todo depende de que el cliente llame a uno de los 3 caminos de arriba en el momento correcto.

Conclusión: **3 caminos de escritura, sin dueño único, 100% cliente.** Esto es exactamente el patrón que TASK-228 ya marcó como problema (copia derivada sin reconciliación) — y agregarle más campos denormalizados multiplica por 3 el lugar donde hay que mantenerlos sincronizados.

## 2. Opción (b) — `queryCardIndex` como referencia

**LEÍDO** (`functions/index.js:1802-1877` + `functions/lib/cardIndexEntry.js`):

- `queryCardIndex` lee **todos** los chunks de `users/{uid}/card_index`, los expande en memoria (`expandIndexCards`), filtra (`filterIndexCards`) y pagina. La búsqueda de texto ya es **substring real**: `c.n.toLowerCase().includes(q)` (línea 1662) — no hay limitación de prefijo porque el filtrado ocurre en RAM del lado servidor, no en una query de Firestore.
- Cuesta 1 lectura por chunk (no por carta) — pero el costo de memoria es alto: corre con `memory: '2GiB'` porque antes con 512 MiB moría por OOM en cuentas de ~59k cartas (comentario TASK-187 en el propio código). Es decir: el patrón "traer todo el índice a RAM y filtrar" ya mostró su techo con UNA cuenta grande de las que hoy existen.
- **Autorización, y por qué NO se puede reusar tal cual**: `targetUserId = request.auth.uid` — la función fue **deliberadamente** cambiada (TASK-214) para que SOLO pueda leer el índice del propio caller. El comentario en el código lo dice explícito: *"la public-profile flow serves from /public_cards, not card_index"*. La regla de Firestore (`firestore.rules:155-157`) también es owner-only, y hay evidencia medida en vivo (`scripts/query-card-index-authz-probe.mjs`) de que la versión anterior — leer el índice de OTRO usuario — era un agujero de seguridad real, explotado por una cuenta atacante contra una víctima descartable en dev.

Montar el perfil público sobre `card_index` (relajar la regla, o pasarle un `userId` ajeno a `queryCardIndex`) **reabriría exactamente el agujero que TASK-214 cerró** — y esta vez peor, porque expondría cartas `collection`/`wishlist` privadas, no solo `sale`/`trade`. `card_index` no distingue público de privado; contiene TODO el inventario del dueño. No es una opción descartable por complejidad — es una opción descartada por seguridad, salvo que se construya un índice **separado** que solo contenga lo público (ver recomendación).

**Herencia de los bugs conocidos de `card_index`** (memoria del proyecto: `project_card_index_redesign_v3`, `project_index_version_no_repara`, `project_card_index_self_duplication`): si se clona la arquitectura de chunks-por-posición para un índice público nuevo, se hereda la misma familia de fragilidad — chunks que pierden entradas, reconstrucción parcial que no repara sola. **MEDIDO/LEÍDO** parcialmente mitigado desde TASK-245: ahora hay una única función `buildIndexEntry` que arma cada entrada (antes `buildCardIndex` y `applyCardIndexDelta` divergían), así que reusar esa función reduce el riesgo de divergencia de contenido — pero no elimina el riesgo estructural de chunking por posición si el índice nuevo copia ese diseño.

## 3. Costos de (a) — denormalizar en `public_cards`

**MEDIDO** (campos reales hoy, del ticket): 0/6.647 docs de la cuenta de referencia tienen `colors` o `type_line`. **LEÍDO**: `useCardFilter` (`src/composables/useCardFilter.ts`) consume, además de los que ya están: `colors`, `type_line`, `rarity`, `cmc`, `foil` (ya está), `setCode` (ya está), `oracle_text`, `keywords`, `legalities`, `power`, `toughness`, `full_art`, `produced_mana`.

Dos formas de agregarlos, con costo muy distinto:

**(a-naive)** — copiar los campos de Scryfall tal cual (como llegan del doc `scryfall_cache`/Card, no compactados): `legalities` es un objeto con ~20-25 formatos (`{standard: "legal", modern: "not_legal", ...}`), del orden de 300-500 bytes en JSON. `oracle_text` puede ser 100-500 caracteres. Sumando `type_line`, `colors`, `keywords`, `produced_mana`, el crecimiento por doc es del orden de **+0.5 a 1 KB por carta**. Un doc de `public_cards` individual sigue muy por debajo del límite de 1 MB (no es el límite que se toca), pero:
  - `writeBatch` (10 MiB, límite ya golpeado 5 veces en este proyecto por otra razón): a 400 docs/batch (como ya hace `batchSyncCardsToPublic`/`syncAllUserCards`) y ~1-1.5 KB/doc, un batch pesa ~400-600 KB — lejos del límite de 10 MiB. **No es un riesgo real con el tamaño de batch actual**, incluso a 100k cartas por cuenta (solo aumenta el número de batches, no su peso).
  - El riesgo real de (a-naive) no es de límites de Firestore sino de **cantidad de escrituras y drift**: cada uno de los 3 caminos client-side tendría que agregar los mismos ~10 campos nuevos, y si el `Card` en memoria del cliente no los trae (mismo defecto que TASK-245 corrigió para `card_index`), el backfill se escribe vacío otra vez.

**(a-compacta)** — imitar el esquema de `card_index` (`cardIndexEntry.js`): claves cortas, `rarity` a 1 char, `legalities` como lista de formatos legales (no el mapa completo), sin `oracle_text` (usar `keywords` como proxy, igual que ya hace `card_index`). Ese esquema mide **~170 bytes por entrada** (comentario medido en el propio código, TASK-245). Aplicado a `public_cards` el crecimiento sería de ese orden, no de 1 KB.

**Backfill**: **LEÍDO/MEDIDO** (dato del ticket): 8.221 documentos globales hoy — backfill barato en términos absolutos (≈21 batches de 400). El dato a favor (**MEDIDO** del ticket) es que `scryfall_cache` tiene el 100% de los `scryfallId` de la cuenta de referencia, así que el backfill no necesita pedir nada a Scryfall.

**Escalado a 25k/100k cartas por cuenta** (proyecto: 80% del mercado tiene 25k+, 30% tiene 100k+): el cuello de botella NO es el tamaño de doc ni el writeBatch — es que **cada carta pública individual sigue siendo 1 documento Firestore**, y el perfil público sigue necesitando traer todos los que hagan falta para filtrar. Si el filtro se resuelve leyendo `public_cards` doc por doc del lado servidor (como hoy hace el cliente, pero para TODO el catálogo), a 100k cartas eso son decenas de miles de lecturas facturadas por cada visita a un perfil grande — carísimo y lento, sin importar cuánto pesen los campos.

## 4. AC3/AC5 — búsqueda por substring

Firestore no soporta `contains` de forma nativa; range query (`>=`/`<=`) solo hace prefijo — es justo la limitación medida hoy en `searchUserPublicCards`. Opciones dentro de lo que el proyecto ya usa:

- **Filtrado en memoria del lado servidor (Cloud Function), sobre `public_cards` cargado por chunks** — el mismo patrón que `filterIndexCards` ya usa con éxito para `card_index` (`c.n.toLowerCase().includes(q)`). Costo de escritura: ninguno extra sobre lo que ya cuesta escribir `public_cards`; costo de lectura: 1 lectura por *chunk*, no por carta, **si** se chunkea (ver recomendación) — si no se chunkea, 1 lectura por carta pública del vendedor, cosa cara a 100k.
- **N-gramas/tokens denormalizados + `array-contains`**: viable con Firestore nativo, sin infra nueva. Costo de escritura: por cada carta hay que precalcular y guardar un array de tokens (p.ej. trigramas del nombre) — esto SÍ puede crecer el doc de forma notoria (nombres de 20-30 caracteres generan 15-25 trigramas) y necesita índices compuestos nuevos (`userId + token`, `array-contains` + otro filtro no es combinable libremente en Firestore sin índices dedicados). Es más trabajo de mantenimiento que la opción de arriba para un beneficio menor (sigue sin ser substring completo si se usan trigramas fijos en vez de generar todas las subcadenas).
- **Algolia/Typesense**: fuera de alcance salvo pedido explícito de Rafael (regla del proyecto: fuentes nuevas cerradas para precios; extiendo el mismo criterio conservador acá, es infra externa nueva).

**AC5** (tope de 50): si la búsqueda se mueve a una Cloud Function paginada (mismo modelo `page`/`pageSize`/`mode` que `queryCardIndex`), el tope deja de ser un límite duro sobre el total de resultados y pasa a ser tamaño de página — se resuelve solo, sin decisión de producto pendiente.

## 5. Recomendación

**No** reusar `card_index` para perfiles públicos (sección 2: reabre TASK-214). **No** hacer denormalización naive de todos los campos de Scryfall en 3 lugares client-side distintos (sección 3: multiplica el problema de TASK-228, cada campo nuevo puede llegar vacío igual que hoy).

Recomiendo una combinación, tratada como su propio ticket de alcance medio (no un fix chico):

1. **Consolidar los 3 caminos de escritura en uno solo, server-side**: reemplazar `syncCardToPublic`/`batchSyncCardsToPublic`/`syncAllUserCards` por un único punto que arme el doc de `public_cards` haciendo el join contra `scryfall_cache` (igual que `mergeScryfallMetadata`/`buildIndexEntry` ya hacen para `card_index`), preferentemente un trigger de Cloud Function sobre `users/{uid}/cards/{cardId}` en vez de 3 llamadas client-side. Esto ataca directamente la falta de dueño que TASK-228 señala.
2. **Denormalizar con el esquema compacto de `card_index`** (claves cortas, sin `oracle_text` completo, `legalities` como lista), no el esquema "campo por campo" de `useCardFilter`. Reduce el crecimiento por doc de ~1 KB a ~170 bytes.
3. **Chunkear `public_cards` por vendedor** (agrupar en documentos de ~400 cartas, como `card_index`) para que el filtro/búsqueda del perfil público lea unos pocos documentos grandes en vez de miles de documentos chicos — esto es lo que hace viable el costo a 100k cartas.
4. **Una Cloud Function nueva, separada de `queryCardIndex`**, que acepte llamadas sin auth pero scopeadas a `userId` y lea SOLO esos chunks públicos (nunca `card_index`), filtre y busque por substring en memoria (igual que `filterIndexCards`), y pagine igual que `queryCardIndex`. Resuelve AC1 y AC3 a la vez, y AC5 cae solo.

**Riesgos que quedan abiertos, dichos explícitamente:**
- Esto agrega una TERCERA copia derivada de los datos de carta (`card_index`, `public_cards` hoy, `public_cards` chunkeado mañana), en un proyecto que ya tiene sin resolver la reconciliación de las dos que existen (TASK-228, TASK-208). Si se hace, el backfill/reconciliación de esta nueva estructura debe diseñarse desde el día uno, no como deuda técnica futura — de lo contrario es el mismo patrón de bug otra vez, con un nombre distinto.
- El paso 1 (mover el join a un trigger server-side) es el cambio de mayor riesgo de romper algo existente: los 3 call sites en `collection.ts` tienen timing distinto (alta, edición, bulk, resync) — hay que verificar que ninguno depende de que el `setDoc`/`writeBatch` de `public_cards` sea síncrono con la operación del usuario (p.ej., toast de éxito antes de que el trigger corra).
- No pude medir el tamaño real en bytes de un doc `public_cards` compacto propuesto (ni el tiempo real de una Cloud Function leyendo N chunks) — son estimaciones a partir del código de `card_index`, no una medición directa contra Firestore.

**Mediciones que pediría al orquestador**, si hay Bash/Firestore disponible:
- Tamaño real en bytes de 10-20 docs de `public_cards` de la cuenta de referencia (`getDoc` + `JSON.stringify(...).length`), para calibrar el crecimiento real en vez de estimarlo.
- Correr un `queryCardIndex`-like en memoria (script Node, sin desplegar nada) contra un `card_index` real de una cuenta grande y medir tiempo/memoria de expandir+filtrar 100k entradas, para validar si 2GiB alcanza también para un índice público chunkeado del mismo tamaño.

**Confianza: 5/10.** Alta confianza (8-9/10) en la sección 1 (caminos de escritura) y sección 2 (por qué (b) tal cual reabre TASK-214) — está todo leído directo del código con comentarios explícitos del propio proyecto. Confianza más baja en los números de costo de la sección 3 (son estimaciones de tamaño de payload, no mediciones contra Firestore real) y en la recomendación final, que es un diseño nuevo no validado con ninguna medición en vivo.