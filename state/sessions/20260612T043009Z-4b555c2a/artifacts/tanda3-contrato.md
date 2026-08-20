# TASK-247 — Tanda 3: contrato de diseño de la CAPA DE CONSULTA

Documento de diseño. No es código. Escrito por el researcher (read-only) el 2026-08-19,
medido contra el código que ya existe en `develop` (commit `0038950`).

Convención de etiquetas, obligatoria en este proyecto:
- **LEÍDO** — está escrito literalmente en el código/archivo que se cita.
- **MEDIDO** — lo ejecuté yo en esta sesión y pego el número.
- **SUPUESTO** — inferencia mía. No lo verifiqué. Está separado en §8.

---

## 0. Confirmación pedida explícitamente: `firestore.rules`

**LEÍDO — confirmado, y es como esperabas.** `firestore.rules` (289 líneas) NO tiene ningún
`match` para `public_card_index`. Los `match` bajo `/users/{userId}` son, uno por uno:
`decks`, `cards`, `preferences`, `savedMatches`, `savedContacts`, `priceHistory`,
`cardPriceHistory`, `matches_nuevos`, `matches_guardados`, `matches_eliminados`,
`contactos_guardados`, `binders`, `card_index`, `buyRequests`. `public_card_index` no está.

`match /users/{userId} { allow read: if true; }` (línea 22-23) **no cascadea** a
subcolecciones: en Firestore un `match` sin `{document=**}` sólo cubre el documento en sí.
Por lo tanto `users/{uid}/public_card_index/**` cae en el catch-all de la línea 284:

```
match /{document=**} { allow read, write: if false; }
```

**Consecuencia de diseño, firme: la consulta DEBE ir por Cloud Function.** El navegador no
puede leer el índice ni con sesión iniciada.

Hay un segundo motivo, independiente y también LEÍDO, que refuerza lo mismo:
`match /scryfall_cache/{cardId} { allow read: if request.auth != null; }` (línea 277-278).
Un visitante **anónimo** no puede leer `scryfall_cache` ni aunque quisiera enriquecer en el
cliente — es exactamente lo que hoy hace `enrichPublicCardsInMemory` (via Scryfall HTTP,
no via caché) y es el motivo de que el filtro de color de hoy sea de juguete.

---

## 1. FORMA DE LA ENTRADA DEL ÍNDICE

Fuente: `functions/lib/publicCardEntry.js`, `buildPublicEntry()` (LEÍDO).
Ruta de almacenamiento: `users/{uid}/public_card_index/{chunkId}` con forma
`{ id: number, entries: object[] }`, más `users/{uid}/public_card_index/_meta`
(LEÍDO — `functions/lib/publicCardIndexReconciler.js:161-162`).

| Campo | Origen | Significado | ¿Sirve para filtrar? |
|---|---|---|---|
| `s` | `public_cards.scryfallId` | scryfallId. Identidad de hash del chunk | Clave de imagen y de dedupe |
| `i` | `public_cards.cardId` | id del doc de la carta del dueño | Identidad de la fila / cart |
| `n` | `public_cards.cardName` | nombre visible (incluye `//` en cartas partidas) | Mostrar + búsqueda |
| `nl` | `public_cards.cardNameLower` | nombre en minúsculas | **SÍ — búsqueda substring** |
| `q` | `quantity` (`?? 1`) | copias | Sí (orden) |
| `p` | `price` (`|| 0`) | precio | **SÍ — rango de precio, orden** |
| `st` | `status` | `sale` \| `trade` | **SÍ — chips venta/cambio** |
| `f` | `foil` | booleano | **SÍ — filtro foil** |
| `cn` | `condition` (`|| 'NM'`) | estado físico | **SÍ** |
| `sc` | `setCode` | código de set (máquina) | **SÍ — filtro de sets** |
| `ed` | `edition` | nombre humano del set | **SÍ — búsqueda (paridad con hoy)** |
| `t` | cache `type_line` → `card_faces[].type_line` unidos con `" // "` | línea de tipo | **SÍ — tipo, y clasificación de tierras** |
| `cm` | cache `cmc` (`?? 0`) | coste convertido | **SÍ — filtro de valor de maná** |
| `co` | cadena AC9 (§3) | colores | **SÍ — filtro de color** |
| `pm` | cache `produced_mana` | maná que produce | **SÍ — color de TIERRAS** (`useCardFilter` lo exige) |
| `r` | cache `rarity.charAt(0)` | `c`/`u`/`r`/`m` | **SÍ — rareza** |
| `kw` | cache `keywords` | palabras clave | **SÍ — filtro avanzado** |
| `lg` | cache `legalities`, sólo los `legal` | formatos legales | **SÍ — filtro avanzado de formatos** |
| `ca` | `updatedAt` → epoch ms | "fecha" para ordenar | Sí (orden). **Es "última edición", no "alta"** (LEÍDO, limitación declarada) |
| `x` | flag | no existe doc en `scryfall_cache` | Bandera, no filtro (§3) |
| `cu` | flag | color irresoluble | Bandera, no filtro (§3) |

**Tamaño MEDIDO por mí** (nodo real, `buildPublicEntry` con un doc y un cache realistas —
Marauding Blight-Priest, 13 legalities, `co:['B']`):
- entrada completa serializada: **406 bytes**
- subconjunto "lo que la grilla realmente muestra" (`s,i,n,q,p,st,f,cn,sc,ed,co,r,t`): **231 bytes**
- mínimo absoluto (`s,i,n,q,p,st,f,cn,sc`): **159 bytes**

(La cabecera de `publicCardEntry.js` dice "~230 B/entrada" y la de `publicCardIndex.js` dice
"441 bytes medidos". Los tres números son consistentes entre sí: 231 B es el subconjunto,
406 B la entrada completa de una carta con pocas keywords, 441 B el promedio con `kw`
poblado. Uso **406 B** como número de trabajo y **441 B** como techo.)

### Lo que NO está en la entrada y hace falta

| Falta | ¿Quién lo necesita? | Resolución propuesta |
|---|---|---|
| `image` | `publicCardToCard` lo mapea a `Card.image` (LEÍDO, `src/utils/publicCardMapping.ts`) | **No agregarlo al índice.** Se deriva de `s` con `cardImageProxyUrl(scryfallId, ...)` (`src/utils/cardImageUrl.ts`, TASK-241). Ahorra ~90 B/entrada en la respuesta |
| `username`, `avatarUrl`, `location`, `email` | ficha del vendedor | **Constantes por perfil.** Van UNA vez en el sobre de la respuesta, nunca por carta |
| `power` / `toughness` / `oracle_text` / `full_art` | filtros avanzados de `useCardFilter` (`advPowerMin`, `advFullArtOnly`, subtipos de criatura) | **HUECO REAL.** No están en la entrada. Ver §8 (riesgo R1) — hay que decidir: agregarlos (coste en bytes de chunk) o aceptar que esos 4 filtros avanzados dejen de funcionar en el perfil público |
| `card_faces` / índice de cara | el toggle ↔ de cartas partidas | `t` ya trae `" // "`; el cliente puede detectar carta partida por `n.includes(' // ')`. **SUPUESTO** que alcanza para la UI actual |

---

## 2. FIRMA DE LA CLOUD FUNCTION

### Nombre y tipo

```
exports.queryPublicCardIndex = onCall(
  { maxInstances: 10, timeoutSeconds: 60, memory: '2GiB' },
  async (request) => { ... }
);
```

`onCall`, no `onRequest`. Motivos:
1. Todo el resto del proyecto que devuelve datos estructurados al cliente es `onCall`
   (`queryCardIndex`, `loadCardPage`, `loadCollectionChunk`, `buildCardIndex`,
   `reconcilePublicCardIndex` — LEÍDO). `onRequest` sólo se usa para cosas que NO son
   respuestas JSON a la app (`moxfieldDeck`, `cardImage`, `refreshMarketData`).
2. `src/services/cloudFunctions.ts` ya tiene el patrón `httpsCallable<Req, Res>` listo
   (LEÍDO, línea 376: `queryCardIndex`).
3. `memory: '2GiB'` no es opcional: `queryCardIndex` tiene un parche LEÍDO textual —
   *"con 512MiB la funcion moria por OOM ... en CASI TODAS las busquedas de una cuenta de
   ~59k cartas, porque lee el indice entero y lo filtra y ordena en RAM"*. Esta función hace
   exactamente lo mismo. Nacer con 512 MiB es repetir ese incidente.

### Parámetros

```ts
interface QueryPublicCardIndexRequest {
  userId: string            // OBLIGATORIO. El vendedor cuyo perfil se mira.
  filters?: {
    search?: string         // substring, min 2 chars (paridad con MIN_SEARCH_LEN=2)
    status?: ('sale'|'trade')[]
    color?: string[]        // ['B'] | ['White','Multicolor'] — ver §3 sobre el vocabulario
    exactColorMode?: boolean
    rarity?: ('common'|'uncommon'|'rare'|'mythic')[]
    type?: string[]         // substring sobre `t`
    manaValue?: (number|'10+')[]
    edition?: string[]      // sobre `sc`
    keywords?: string[]     // sobre `kw`
    formats?: string[]      // sobre `lg`
    foil?: boolean
    condition?: string[]
    minPrice?: number
    maxPrice?: number
  }
  sort?: { field: 'name'|'price'|'edition'|'quantity'|'dateAdded'; direction: 'asc'|'desc' }
  page?: number             // 0-based
  pageSize?: number         // default 60, clamp [1, 120] — ver §5
  mode?: 'cards' | 'facets' // 'facets' devuelve SÓLO los conteos, sin cartas
}
```

### Respuesta

```ts
interface QueryPublicCardIndexResponse {
  cards: PublicIndexCard[]   // el subconjunto de 231 B, no la entrada de 406 B
  total: number              // documentos que pasan el filtro — ESTE es el 1.412 del AC2
  page: number
  pageSize: number
  hasMore: boolean
  facets: {                  // conteos sobre el filtro APLICADO menos su propia dimensión
    color: Record<string, number>
    status: Record<string, number>
    rarity: Record<string, number>
    type: Record<string, number>
  }
  seller: { userId: string; username: string; avatarUrl?: string; location?: string }
  indexState: {
    schemaVersion: number
    totalChunks: number
    count: number            // meta.count — cuántas cartas cree el índice que hay
    reconciling: boolean     // §6: hay una reconciliación en vuelo
    partial: boolean         // §6: la lectura salió inconsistente, el total NO es de fiar
    missing: number          // entradas con x:1 o cu:1 excluidas por un filtro de color
  }
}

interface PublicIndexCard {   // 231 B medidos
  s: string; i: string; n: string; q: number; p: number
  st: 'sale'|'trade'; f: boolean; cn: string; sc: string; ed: string
  co: string[]; r: string; t: string
}
```

### AUTORIZACIÓN — cómo NO se convierte `userId` en el octavo agujero

Este proyecto tiene 7 apariciones de la misma familia de authz
(`project_authz_family_seven_appearances`), y dos están LEÍDAS en este mismo archivo:
TASK-214 (`queryCardIndex` aceptaba un `userId` del cliente y leía el `card_index` ajeno) y
TASK-211 (lo mismo en `buildCardIndex`). La cabecera de `reconcilePublicCardIndex` dice
textualmente que reintroducir un `targetUserId` opcional "sería la tercera aparición de esa
familia exacta".

**Esta función es la excepción legítima, y la excepción tiene que estar argumentada, no
asumida.** La diferencia estructural:

| | `queryCardIndex` (privado) | `queryPublicCardIndex` (esta) |
|---|---|---|
| Colección leída | `users/{uid}/card_index` | `users/{uid}/public_card_index` |
| Qué contiene | **TODO** el inventario del usuario | **Sólo** lo que él publicó |
| Regla equivalente en `firestore.rules` para la fuente | `cards`: `auth.uid == userId` | `public_cards`: `allow read: if true` (línea 186) |
| `userId` del cliente | **Prohibido** (TASK-214) | **Obligatorio** — es un perfil público |

**Las cinco defensas concretas que el developer DEBE implementar, y son testeables:**

1. **La función NUNCA lee `users/{uid}/cards` ni `users/{uid}/card_index`.** Debe existir
   un test que grepee el cuerpo de la función y falle si aparecen esas rutas. Es la
   defensa que hace irrelevante el `userId` ajeno: aunque el atacante ponga cualquier uid,
   lo único que puede alcanzar es un índice derivado de `public_cards`, que ya es
   `allow read: if true` (AC6 se cumple por construcción, no por vigilancia).
2. **Validación estricta del parámetro**: `typeof userId === 'string'`, longitud 1..128,
   `/^[A-Za-z0-9_-]+$/`. Sin esto, un `userId` con `/` inyecta segmentos de ruta
   (`db.collection(\`users/${userId}/public_card_index\`)` es interpolación de string —
   LEÍDO, así está escrito en el reconciler línea 161). Un `userId` de
   `x/public_card_index/../../otro` cambia la colección. **Esto es un agujero real y
   concreto, no teórico**, y es la razón #1 por la que este parámetro necesita una regex,
   no un `if (!userId) throw`.
3. **La respuesta nunca reexpone campos que no estén en la entrada del índice.** El índice
   sólo se construye desde `public_cards` (`buildPublicCardsQuerySpec` — LEÍDO), así que no
   hay nada privado que filtrar. Pero `email` sí está en el tipo `PublicCard` del cliente:
   **el sobre `seller` NO lleva `email`** (`contact_info` requiere auth — línea 200 de las
   reglas).
4. **La función NO requiere `request.auth`** (un visitante anónimo mira perfiles públicos —
   es el caso de uso), y por lo tanto **no debe tener ninguna rama que haga algo distinto
   según `request.auth`**, ni escribir nada. Es estrictamente de lectura.
5. **Cuota**: `maxInstances: 10` + un límite de `pageSize` (§5). Sin auth no hay
   rate-limiting por usuario; ver riesgo R4 en §8.

---

## 3. SEMÁNTICA DEL FILTRO DE COLOR

### Cómo salen 1.412 y no 1.049 ni 2.658

**MEDIDO, leyendo el script de verificación que ya existe**
(`state/sessions/.../artifacts/scratch-verify-entry.mjs`, línea 29-31):

```js
for (const [l, esperado] of [['B',1412],['W',1457],['U',1354],['R',1619],['G',1161]]) {
  const n = entries.filter((e) => co(e).includes(l)).length;
```

Es decir, el número objetivo del AC2 se produce con **exactamente esta regla**:

> Contá **una unidad por documento de `public_cards`** (= una entrada del índice)
> cuya `co` **contenga** la letra del color. Sin `sum(q)`, sin dedupe por `s`.

Los tres números del AC2 se explican así:
- **1.412** = entradas (documentos) con `'B' ∈ co` ← **este es el que devuelve `total`**
- **1.049** = `new Set(entradas.map(e => e.s)).size` — scryfallId únicos. NO es el objetivo.
- **2.658** = `sum(e.q)` — copias. NO es el objetivo. Puede mostrarse como dato aparte.

Que sea `includes` y no "categoría" tiene una consecuencia que hay que decir en voz alta:
**una carta B/G cuenta como negra Y como verde.** La suma de los cinco controles negativos
(1.412+1.457+1.354+1.619+1.161 = 7.003) supera los 6.647 documentos del perfil, y eso es
correcto y esperado bajo semántica OR-inclusiva.

### CONTRADICCIÓN QUE TENGO QUE REPORTAR, NO RESOLVER EN SILENCIO

La UI de hoy **no** usa esa semántica. `src/composables/useCardFilter.ts` (LEÍDO):

- `categorizeManaColors()` devuelve **`'Multicolor'`** para cualquier carta con ≥2 colores.
  Una carta B/G **no** cae en `'Black'`.
- `getCardColorCategory()` devuelve `'Lands'` (o el color producido) para tierras, mirando
  `produced_mana` en vez de `colors`.
- `passesColorFilter(card, selected, exact)` combina ambas cosas.
- El vocabulario del chip es `'White'|'Blue'|'Black'|'Red'|'Green'|'Multicolor'|'Colorless'|'Lands'`,
  no `W/U/B/R/G`.

O sea: **el número 1.412 del AC2 y el chip "Negro" que ve el usuario hoy no significan lo
mismo.** Bajo la semántica de `useCardFilter`, el chip "Black" daría *menos* de 1.412
(excluye multicolor) y además metería tierras que producen B en "Black" en vez de en "Lands".

**Mi recomendación, para que el developer no elija en silencio:**

- La Cloud Function implementa **las dos** semánticas y el parámetro las distingue:
  `filters.color: ['B']` (letras) = OR-inclusiva, la del AC2. `filters.color: ['Black']`
  (nombres) = categoría `useCardFilter`, la de la UI de hoy.
- El **AC2 se valida contra la variante de letras** (`total === 1412`), que es lo que la
  medición del ticket definió.
- **Rafael decide** cuál de las dos manda el chip de la UI en la tanda 4. Yo no la elijo.
  Es una decisión de producto ("¿la carta B/G aparece cuando filtro por negro?"), no técnica.
- La función debe traer `pm` y `t` a memoria igualmente, porque la variante de categoría los
  necesita para tierras.

### Qué pasa con `x` / `cu` — decisión YA escrita, la respeto

`publicCardEntry.js` (LEÍDO, sección "AC9 DECISION"):

> *un entry marcado es EXCLUIDO de cualquier resultado filtrado por color (nunca debe contar
> silenciosamente como "incoloro" sólo porque `co` es `[]`), pero sigue INCLUIDO en un
> listado sin filtrar y en la búsqueda por nombre/substring.*

Traducción a reglas de implementación, sin reinventar nada:

```
si (hay filtro de color activo) y (entry.x === 1 || entry.cu === 1)  → EXCLUIR
en cualquier otro caso                                              → INCLUIR
```

Y —esto es agregado mío, no contradice la decisión— la respuesta lleva
`indexState.missing` = cuántas entradas quedaron excluidas por esta regla, para que la UI
pueda decir "474 cartas sin datos de color" en vez de que desaparezcan sin explicación.
**MEDIDO en el ticket**: 474 de 6.647 (7,1%) y 17 scryfallId sin doc en `scryfall_cache`.

Ojo con un detalle que sí puede morder: `cu` sólo se emite cuando `resolveColors` devuelve
`null`. Una carta **genuinamente incolora** trae `co: []` **sin** `cu`, y debe seguir siendo
alcanzable por el chip "Colorless"/"C". Un `if (entry.co.length === 0) return false` —que es
literalmente lo que hace `filterIndexCards` en `functions/index.js` línea 1688, LEÍDO— haría
invisible toda carta incolora. **No copiar esa línea.**

---

## 4. SEMÁNTICA DE LA BÚSQUEDA SUBSTRING

### Por qué no hay opción

Firestore sólo sabe hacer prefijo (`>= term` + `<= term + ''`). Eso es lo que hace hoy
`searchUserPublicCards` (LEÍDO, `src/services/publicCards.ts:619-645`; el `''` está
ahí — lo verifiqué a nivel de bytes: `EF A3 BF`). Da 9 de los 14 documentos del AC3.

**No existe operador de substring en Firestore.** Las tres salidas reales son: (a) filtrar en
memoria dentro de la función, (b) un índice invertido de n-gramas/trigramas, (c) un servicio
de búsqueda externo (Algolia/Typesense). (c) está fuera de alcance y de presupuesto. (b) es
un ticket propio. **(a) es lo que corresponde a esta tanda**, y es exactamente lo que ya hace
`queryCardIndex` para la colección privada (LEÍDO, línea 1668: `c.n.toLowerCase().includes(q)`).

### La regla

```js
const q = term.trim().toLowerCase();
result = result.filter(e => (e.nl || '').includes(q) || (e.ed || '').toLowerCase().includes(q));
```

`nl` **y** `ed`, no sólo `nl`: `UserProfileView.vue` documenta (LEÍDO, línea ~287) que el
filtro local de hoy matchea *nombre O edición*, y que la búsqueda por prefijo actual es una
**regresión** respecto de eso. Incluir `ed` recupera esa paridad. `publicCardEntry.js` ya
puso `ed` en la entrada por este motivo exacto (LEÍDO, comentario "AC9 addendum").

### El caso medido de la carta partida

`'Blightreaper Thallid // Blightsower Thallid'`:

- `nl` = `"blightreaper thallid // blightsower thallid"` (viene de `cardNameLower`, y si
  faltara, de `cardName.toLowerCase()` — LEÍDO, `buildPublicEntry`).
- `'blight'.includes` → **✅ matchea**, y matchearía dos veces, pero `.includes` devuelve
  booleano: **un documento, una vez**. No hay riesgo de contar doble.
- La búsqueda de hoy por prefijo también la encuentra (empieza con "blight"), pero
  `'blightsower'` (la cara trasera) **hoy no se encuentra** y con substring **sí**.
- El `//` no requiere ningún tratamiento especial: no se tokeniza, se busca sobre la cadena
  cruda. **No normalizar el `//` fuera** — perdería la capacidad de buscar por la cara trasera.

Los 7 nombres del AC3 se cubren todos con esta regla (los 5 que hoy fallan son
mid-word: `Marauding Blight-Priest`, `Hooded Blightfang`, `Lithoform Blight`,
`Blighted Blackthorn`… — prefijo `blight` no alcanza a los que lo llevan en medio).

### COSTE — lecturas y milisegundos

El filtro en memoria obliga a leer **todos los chunks**. Números:

| Cuenta | Docs | Chunks pedidos (÷400) | Chunks reales (nextPow2) | **Lecturas Firestore** | Bytes leídos (406 B/entrada) |
|---|---|---|---|---|---|
| Rafael (real, MEDIDO en el ticket) | 6.647 | 17 | **32** | 32 + 1 `_meta` = **33** | ~2,7 MB |
| Vendedor mediano del mercado | 25.000 | 63 | **64** | **65** | ~10,1 MB |
| Techo del mercado (30% del mercado) | 100.000 | 250 | **256** | **257** | ~40,6 MB |

Lecturas Firestore facturadas: **una por documento de chunk**, no una por carta. 257 lecturas
para 100.000 cartas es ~389x más barato que leer `public_cards` documento a documento. Ese es
el argumento económico entero del índice.

**Milisegundos — SUPUESTO, no medido, y lo digo como tal.** No tengo forma de medir la
latencia de un `collection().get()` de 256 documentos de ~172 KB sin correr contra
producción, y eso está fuera de mi mandato read-only. Lo que SÍ tengo es una referencia
LEÍDA del mismo proyecto: `queryCardIndex` lee el índice privado entero (30 chunks de
2.000 cartas para una cuenta de 59.083) y **moría por OOM a 512 MiB**, y funciona a 2 GiB
con `timeoutSeconds: 60`. Esta función maneja volúmenes del mismo orden. Por eso propongo
2 GiB y 60 s desde el día uno, y por eso §7 propone el atajo de facetas.

Riesgo honesto: a 100k cartas y arranque en frío, **no sé** si entra en 60 s. Hay que medirlo
(§8, R2). Mitigación disponible sin rediseñar nada: cachear el índice expandido en la memoria
de la instancia caliente, con `meta.count + meta.totalChunks` como clave de invalidación.

---

## 5. PAGINACIÓN Y TOPE (AC5)

### El problema, con números

`searchUserPublicCards` (LEÍDO) dice en su comentario:

> *"A 'find this card' search returning 50 name-prefix matches within one user's profile
> covers the realistic case"*

Eso era defendible con búsqueda por **prefijo**. Con **substring** sobre 6.647 cartas deja de
serlo, y se demuestra con un solo dato del propio ticket: `'blight'` da 14 documentos hoy con
prefijo, pero un término frecuente como `'a'`, `'e'` o `'the'` matchea *miles*. `'island'`,
`'forest'`, `'goblin'`, `'elf'` — cualquier tribal — pasa 50 fácil en un perfil de 6.647
cartas. La afirmación "50 cubre el caso realista" **queda medida como falsa** en cuanto la
búsqueda es substring.

### Propuesta concreta

**Eliminar el tope especial de búsqueda. Unificar búsqueda y listado en la MISMA paginación.**

| Parámetro | Valor | Justificación numérica |
|---|---|---|
| `pageSize` default | **60** | Es el `DEFAULT_PAGE_SIZE` que ya usa `usePublicProfileCards` (LEÍDO, línea 45). Cambiarlo cambia el scroll de la UI sin motivo |
| `pageSize` clamp | **[1, 120]** | 120 × 231 B = **27,7 KB** por respuesta. A 600 Kbps (el presupuesto de arranque del proyecto, `project_inicio_boot_budget`) son ~370 ms de transferencia. 200 filas ya son 46 KB / ~615 ms — cruza el umbral en que se nota. `queryCardIndex` clampa a 100; 120 es el múltiplo de 60 más cercano |
| Tope duro de resultados | **NINGUNO** | El `total` siempre es exacto sobre la colección completa (es lo que exige el AC2: 1.412). Lo que se pagina es la ENTREGA, no el CONTEO |
| Paginación | **`page` numérico (offset)**, no cursor | El filtrado es en memoria: la función ya tiene el array completo ordenado, así que `slice(page*size, ...)` es O(1) extra. Un cursor Firestore es imposible acá (el orden lo impone la función, no el índice de Firestore). Es literalmente lo que hace `paginateResults` en `functions/index.js:1768`, LEÍDO |

**El `total` es la respuesta al AC2 y al AC5 a la vez**: el usuario ve "1.412 resultados" y
recibe 60. Hoy la pantalla muestra 36 porque `total` y `entregado` son la misma cosa. Separar
esos dos conceptos ES el arreglo.

**Descartado y por qué**: mantener un tope de 50/200 "por las dudas" reintroduce el bug —
un tope hace que `total` mienta, y `total` mintiendo es exactamente TASK-247.

---

## 6. EL PROBLEMA DEL ÍNDICE QUE CRECE

### El hecho, LEÍDO literal de `publicCardIndexExecutor.js`

> *"Going from an old totalChunks of 16 to a new 32 means step 1 overwrites OLD chunks 0..15
> with NEW-scheme content, where each now holds roughly HALF the cards it used to (the other
> half hashed into the new chunks 16..31, which the OLD meta — still live throughout step 1 —
> does not advertise at all). A reader honoring `meta.totalChunks = 16` during that window
> sees roughly HALF the seller's real cards"*

Y además: *"a crash mid-step-1 leaves that reduced-visibility state pinned until the NEXT
reconciliation pass repairs it — and there is currently no pass that runs automatically"*.

Es decir: **un lector ingenuo que confíe en `_meta.totalChunks` puede mostrar ~3.300 de 6.647
cartas, indefinidamente, y sin ninguna señal de que algo esté mal.** Eso es el bug de
TASK-247 otra vez, con causa nueva. La capa de consulta no puede ignorarlo.

Agrego un problema **segundo, distinto y también LEÍDO**, que el brief no menciona: `_meta`
vive **dentro de la misma colección que los chunks** (`indexRef.doc('_meta')`,
`publicCardIndexReconciler.js:161-162`). Un lector que haga `collection.get()` recibe `_meta`
mezclado con los chunks. **Filtrar `_meta` por id explícitamente**, o `expandIndexCards`
va a iterar `chunk.entries` de un documento que no las tiene.

### Mitigación A — DETECTOR (mínimo indispensable, barato, va sí o sí)

Que cada documento de chunk lleve el `totalChunks` bajo el que fue escrito. Es **un campo
numérico por chunk** (~20 bytes en 32 documentos), y se agrega en `buildPublicIndex` de
`publicCardIndex.js` — o sea, es un cambio de UNA línea en la tanda 2a, no un rediseño:

```js
chunks[id] = { id, entries: [], tc: totalChunks };   // `tc` nuevo
```

El lector entonces:

```
1. leer _meta  → metaTotalChunks, count, schemaVersion, reconcileLeaseAt
2. leer chunks 0..metaTotalChunks-1
3. si ALGÚN chunk.tc !== metaTotalChunks    → estamos a mitad de un rebuild
4. si sí: re-leer _meta UNA vez y reintentar. Si sigue inconsistente:
      responder con indexState.partial = true  y  total ausente/marcado
```

**Por qué funciona exactamente sobre la ventana descrita**: durante el paso 1 de un
crecimiento 16→32, los chunks 0..15 ya reescritos llevan `tc: 32` mientras `_meta` todavía
dice 16. La discrepancia es **detectable a lectura pura**, sin coordinación, sin transacción,
sin lease. Y sobrevive al caso peor (crash a mitad del paso 1): el estado queda pinneado, y
el lector lo *sabe* y lo dice, en vez de mostrar media colección en silencio.

Segunda señal, gratis y complementaria: `_meta.reconcileLeaseAt` fresco (< 10 min,
`RECONCILE_LEASE_STALE_MS`, LEÍDO) significa "hay una reconciliación corriendo AHORA". Sirve
para el mensaje de la UI ("actualizando el catálogo") pero **no reemplaza al detector**: un
crash deja el lease vencido y la inconsistencia viva.

### Mitigación B — DOBLE BÚFER POR GENERACIÓN (la solución de fondo, recomendada)

El detector avisa; no arregla. La solución correcta es que el rebuild **nunca sobreescriba
los chunks que el lector está usando**: escribir la generación nueva en documentos nuevos y
cambiar el puntero de un solo write atómico.

```
users/{uid}/public_card_index/_meta          → { generation: 7, totalChunks: 32, count, ... }
users/{uid}/public_card_index/g7_0 .. g7_31   → generación viva
users/{uid}/public_card_index/g8_0 .. g8_63   → generación en construcción
```

Encaja **sin cambiar el orden de escritura de tres fases** que el ejecutor ya diseñó y
justificó:
1. `chunksToWrite` → se escriben como `g{N+1}_*`. Ningún lector los mira. Un crash acá deja
   basura inofensiva, no una colección a medias.
2. `_meta` → un solo write de un solo documento, atómico por definición de Firestore. **Acá
   la generación entera cambia de golpe.** La ventana de media-colección **desaparece**, no
   se acorta.
3. `chunksToDelete` → toda la generación `g{N}`. Ya es la fase de limpieza que existe.

Coste: **2x almacenamiento durante la ventana del rebuild** (para 100k cartas: ~44 MB
transitorios; a precio de Firestore, céntimos) y un `chunksToDelete` más largo. La ganancia
es que la garantía "nunca menos cartas visibles" pasa a ser **verdadera para el crecimiento
también**, que es hoy el caso común y el que está roto.

**Recomendación:** A es obligatorio en la tanda 3 (es la capa de consulta y es barato).
B es un cambio en la capa de escritura (tandas 2a/2b) — **hay que abrirlo como ticket propio
o como tanda 3b**, y decidirlo con Rafael. Si B entra, A queda igual como red de seguridad
(cuesta 20 bytes por chunk y detecta cualquier otra inconsistencia futura).

### Qué hace el lector cuando detecta `partial`

Propuesta (a confirmar con Rafael, es visible al usuario):
- `indexState.partial = true` en la respuesta.
- **No** devolver un `total` inventado. Devolver el `_meta.count` como cota y marcarlo.
- La UI muestra las cartas que sí tiene + un aviso. **Nunca** "1.412 cartas negras" si el
  número puede ser 700.
- Un `total` que miente es peor que un aviso. Es, literalmente, este ticket.

---

## 7. PRESUPUESTO — lecturas y BYTES

Contexto duro y LEÍDO del proyecto: 4G lenta, los bytes pesan más que la velocidad
(`project_target_market_slow_4g`), presupuesto de arranque de 160 KB / 3.228 ms a 600 Kbps
(`project_inicio_boot_budget`).

### Lado servidor (facturado a nosotros, no al usuario)

| Cuenta | Lecturas Firestore por consulta | Bytes leídos por la función |
|---|---|---|
| 6.647 | **33** (32 chunks + `_meta`) | ~2,7 MB |
| 25.000 | **65** | ~10,1 MB |
| 100.000 | **257** | ~40,6 MB |

Con caché de instancia caliente (clave: `uid + meta.count + meta.totalChunks`), las consultas
subsiguientes al mismo perfil cuestan **1 lectura** (sólo `_meta`, para validar la clave).

### Lado cliente — LA PARTE QUE IMPORTA

**Lo que NO se manda, y la razón de que sea aceptable:**

> *"Una respuesta de 1.412 documentos completos es inaceptable si pesa de más"* — es correcto.
> **1.412 × 406 B = 573 KB.** A 600 Kbps son **7,6 segundos** de sólo esa respuesta, contra un
> presupuesto de arranque de 160 KB para la app entera. Sería 3,5x el presupuesto completo del
> arranque, en una sola llamada. **Inaceptable, confirmado con el número.**

**Lo que SÍ se manda:**

| Qué | Bytes | A 600 Kbps |
|---|---|---|
| 60 filas × 231 B (medido) | **13,9 KB** | ~185 ms |
| 120 filas (clamp máximo) × 231 B | **27,7 KB** | ~370 ms |
| `facets` + `indexState` + `seller` | ~400 B | despreciable |
| **Respuesta típica completa** | **~14,3 KB** | **~190 ms** |

Comparado con hoy: `getUserPublicCardsPage` trae 60 documentos **completos** de
`public_cards` (`cardName`, `cardNameLower`, `image` (URL larga de Scryfall), `username`,
`avatarUrl`, `email`, `location`, `userId` repetido 60 veces…). **SUPUESTO** ~600-700 B/doc =
36-42 KB. La respuesta nueva pesa **menos de la mitad** que la de hoy, y devuelve el `total`
real que hoy no existe.

**Los tres ahorros, explícitos:**
1. **`image` no viaja.** Se deriva de `s` con `cardImageProxyUrl` (TASK-241, ya existe).
   ~90 B/fila × 60 = **5,4 KB por página**.
2. **`username`/`avatarUrl`/`location`/`userId` no se repiten por fila.** Van una vez en
   `seller`. ~80 B/fila × 60 = **4,8 KB por página**.
3. **`nl`, `cm`, `pm`, `kw`, `lg`, `ca`, `x`, `cu` se quedan en el servidor.** Sirven para
   filtrar, no para mostrar. 406 → 231 B es un **43% menos** por fila.

### El atajo para el conteo del AC2

`mode: 'facets'` devuelve **sólo** `total` + `facets`, **~300 bytes**. La UI puede pedir los
conteos de los chips de color (1.412 / 1.161 / 1.619 / 1.457 / 1.354) sin descargar una sola
carta. Si además esos conteos se **precalculan en `_meta` en tiempo de build**, cuestan **1
lectura Firestore y ~300 bytes**, no 257 lecturas. Lo recomiendo, pero es un agregado a la
tanda 2a (`buildPublicIndex` tendría que emitir `meta.facets`), no algo que la tanda 3 pueda
hacer sola.

---

## 8. RIESGOS Y LO QUE NO PUDE MEDIR

### MEDIDO por mí en esta sesión
- Tamaño de entrada serializada: **406 B** completa / **231 B** el subconjunto de la grilla /
  **159 B** el mínimo. Ejecuté `buildPublicEntry` real con un doc y un cache realistas.
- El `''` de `searchUserPublicCards:632` está bien (bytes `EF A3 BF`); *no* es el bug.
  La búsqueda es prefijo de verdad, no igualdad.

### LEÍDO (está escrito en el código, no lo ejecuté)
- No hay `match` para `public_card_index` en `firestore.rules` → deny catch-all. §0.
- La ventana de "media colección" en un crecimiento. §6, cabecera del ejecutor.
- `_meta` vive dentro de la misma colección que los chunks.
- La decisión AC9 sobre `x`/`cu`. §3.
- `useCardFilter` usa semántica de **categoría** (multicolor va a `'Multicolor'`), y el
  1.412 del AC2 se midió con semántica **OR-inclusiva** (`co.includes('B')`). **Son
  incompatibles.** §3.
- `queryCardIndex` murió por OOM a 512 MiB leyendo el índice entero de 59k cartas.
- `interpolación de string` en la ruta del índice → un `userId` sin validar inyecta ruta.

### SUPUESTO — no verificado, hay que verificarlo antes de dar por buena la tanda

| # | Riesgo | Por qué me preocupa | Cómo se cierra |
|---|---|---|---|
| **R1** | **`power`, `toughness`, `oracle_text`, `full_art` NO están en la entrada del índice.** `useCardFilter` tiene filtros avanzados para los cuatro (`advPowerMin/Max`, `advToughnessMin/Max`, `advFullArtOnly`, subtipos de criatura vía `oracle_text`) | Migrar el perfil al índice **rompería esos 4 filtros avanzados** — sería cumplir el AC y ser regresión a la vez (`feedback_verificar_contra_el_comportamiento_anterior`) | Medir cuántos filtros avanzados usa realmente la gente en el perfil público; si se conservan, agregar los campos a `buildPublicEntry` (coste: +~60 B/entrada, ~26 KB en un chunk de 400 — cabe de sobra) |
| **R2** | **No sé si 100.000 cartas entran en 60 s de timeout** leyendo 257 chunks + filtrando en RAM | Es el 30% del mercado objetivo (`project_market_collection_sizes`), no un caso raro | Medir con una cuenta sintética de 100k, o extrapolar del `loadCollectionChunk`/`queryCardIndex` real de la cuenta de 59k |
| **R3** | **Un `onCall` v2 sin auth, ¿es invocable por anónimos tras el deploy?** No encontré ninguna config de `invoker`/`allUsers` en `firebase.json` ni en `functions/` | Si el CLI no pone `allUsers`, el visitante anónimo recibe 403 y la feature no funciona para el caso de uso principal | Desplegar a dev y probar con `curl` sin token. Si falla: `onRequest({cors:true})` es el plan B (`cardImage` ya sirve a navegadores anónimos, LEÍDO) |
| **R4** | **Sin auth no hay rate-limit por usuario.** Cualquiera puede pedir 257 lecturas × N | Coste de Firestore, no seguridad de datos | `maxInstances: 10` + caché de instancia + App Check si Rafael lo quiere. Anotarlo, no bloquear la tanda |
| **R5** | **Normalización de acentos/diacríticos en `nl`.** `cardNameLower` es un `toLowerCase()` a secas | Buscar `"jace"` vs `"Jacé"`, o nombres en español, puede fallar. No lo medí | Medir cuántas cartas del perfil real tienen diacríticos en el nombre |
| **R6** | **Estimé el peso de la respuesta ACTUAL** (`getUserPublicCardsPage`, ~600-700 B/doc) sin medirlo | El "pesa menos de la mitad que hoy" de §7 es SUPUESTO en su mitad "hoy" | Medirlo en el navegador con throttling (`feedback_browser_verification`) |
| **R7** | **Nadie dispara la reconciliación automáticamente.** LEÍDO textual: *"there is currently no pass that runs automatically"*. El único disparo es `scheduleIndexReconcile()` desde el cliente al publicar cartas | Un índice que quedó a medias por un crash se queda a medias hasta que alguien publique otra carta | Fuera del alcance de la tanda 3, pero la mitigación A (§6) es lo que hace que ese estado sea **visible** en vez de silencioso |

### Contradicciones ticket ↔ código que reporto sin resolver

1. **Semántica de color** (§3). El AC2 mide OR-inclusiva; la UI de hoy usa categorías con
   `'Multicolor'` separado. **Decide Rafael.** Mi propuesta es soportar ambas en el parámetro
   y validar el AC contra la de letras.
2. **AC5 dice "revisar el tope de 50"**; el comentario del código dice que 50 "cubre el caso
   realista". Con substring **el comentario queda medido como falso** — lo digo en §5 y
   propongo eliminarlo, no subirlo.
3. **El AC1 dice que la decisión (b) "ya está implementada en `publicCardEntry.js`"**. Es
   correcto para el **builder** de entradas. Pero la consulta contra ese caché **todavía no
   existe** — es justamente esta tanda. No hay contradicción, sólo aclaro el alcance para que
   nadie lea el AC1 como "ya está hecho".

---

## Resumen para briefear al developer en una pantalla

1. `exports.queryPublicCardIndex = onCall({memory:'2GiB', timeoutSeconds:60, maxInstances:10})`.
   Sin auth. `userId` obligatorio, **validado con regex** `/^[A-Za-z0-9_-]{1,128}$/` (la ruta
   se construye por interpolación de string — sin regex es inyección de ruta).
2. **Nunca** tocar `users/{uid}/cards` ni `users/{uid}/card_index` desde esta función. Test
   que lo grepee.
3. Leer `_meta` + los chunks `0..totalChunks-1`. **Filtrar `_meta` por id** — vive en la misma
   colección.
4. Filtrar y ordenar en RAM (igual que `queryCardIndex`). `total` = documentos que pasan el
   filtro, sin dedupe por `s` y sin sumar `q` → **1.412 para negro**.
5. Búsqueda: `nl.includes(q) || ed.toLowerCase().includes(q)`. Min 2 chars. El `//` no se toca.
6. `x:1` o `cu:1` → **excluir sólo si hay filtro de color activo**. `co: []` sin flags es
   incolora legítima: **no** copiar el `if (c.co.length === 0) return false` de
   `functions/index.js:1688`.
7. Paginar por `page` numérico. `pageSize` default 60, clamp [1,120]. **Sin tope de resultados**
   — el `total` siempre es sobre la colección completa.
8. Devolver el subconjunto de 13 campos (231 B/fila), no la entrada completa (406 B). `image`
   se deriva de `s` en el cliente. `username`/`avatar`/`location` van una sola vez.
9. Detectar el rebuild a medias: cada chunk lleva `tc` (el `totalChunks` con que fue escrito);
   si algún `tc !== meta.totalChunks` → re-leer `_meta` una vez, y si persiste, responder
   `indexState.partial = true` **sin inventar un `total`**.
