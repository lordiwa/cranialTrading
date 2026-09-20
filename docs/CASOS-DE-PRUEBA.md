# Cranial Trading — Catálogo de casos de prueba documentados

**Propósito:** este documento es el INPUT del wargaming de qa-agents. Recopila, por área
funcional, todo lo que en este proyecto está documentado como "se supone que debería
funcionar". El wargamer lo usa como blanco: cada caso listado acá es una afirmación del
proyecto sobre sí mismo, y el trabajo del ataque es falsarla.

- **Fecha de recopilación:** 2026-09-15
- **Versión del producto:** 1.59.13 (`package.json`)
- **Rama medida:** `main`, árbol limpio
- **Método:** todo número de este documento fue **medido contra el disco** (grep/conteo sobre
  el código, lectura de `tasks/*.json`), no copiado de otro documento. Donde una fuente
  existente afirma un número distinto, se dice cuál y se marca como desactualizada.
- **Alcance:** sólo lectura. No se modificó código, datos ni tickets.

---

## 0. Advertencia de método, y es la parte más importante para el wargamer

Este proyecto **ya fue atacado dos veces** y las dos veces el resultado fue que la cobertura
declarada era en buena parte falsa. Un caso listado en este documento significa **"existe una
prueba o un ticket que dice que esto funciona"**, NO significa "esto funciona" ni siquiera
"esto está realmente probado".

- Wargaming #1 (TASK-144, 2026-08-08, informe en `docs/RESULTADOS-WARGAMING.html`): de 26
  specs E2E, **uno solo** quedó limpio tras verificarlo 1:1. 72 tests sospechosos sobre 134,
  31 sin un solo `expect`, y **14 mecanismos distintos** de "verde vacío" catalogados.
- Wargaming #2 (TASK-186, ESTRATEGIA A, `in_review`): produjo TASK-187 a TASK-210 — defectos
  reales de comportamiento, la mayoría todavía abiertos.

La sección 9 lista lo ya conocido-como-roto para que el ataque nuevo no gaste presupuesto
redescubriéndolo.

---

## 1. Qué hace la app (flujo principal del producto)

De `PROJECT.md` y `CLAUDE.md`:

> Plataforma de intercambio y venta de Magic: The Gathering. Los jugadores gestionan su
> colección de cartas, arman mazos y carpetas (binders), encuentran coincidencias de
> intercambio/venta con otros jugadores, y se mensajean para cerrar el trato.

- **Usuarios objetivo:** jugadores hispanohablantes con colecciones grandes.
- **Criterio de éxito declarado:** mover colecciones de **más de 50.000 cartas con fluidez en
  dispositivos de gama baja**; y que todo elemento interactivo sea accesible por teclado y
  lector de pantalla.
- **Stack:** Vue 3 + TS + Vite + Tailwind / Firebase (Auth, Firestore, Cloud Functions) /
  Hosting. APIs externas: Scryfall, Moxfield, MTGJSON, Card Kingdom.
- **Entornos:** `cranial-trading-dev.web.app` (proyecto `cranial-trading-dev`) y
  `cranial-trading.web.app` (proyecto `cranial-trading`, PRODUCCIÓN).

### Prioridad de negocio (definida por el dueño del producto, 2026-08-08)

Es la única jerarquía del proyecto que no sale del código. Manda sobre el criterio técnico al
decidir dónde poner esfuerzo de prueba o de ataque.

| # | Flujo de negocio | Casos de uso |
|---|---|---|
| 1 | Buscar cartas para revisar precios | UC-05, UC-11, UC-22 |
| 2 | Buscar cartas en perfiles ajenos y en la colección propia | UC-09, UC-20 |
| 3 | Quitar cartas o ponerlas a la venta | UC-07, UC-08 |
| 4 | Agregar mazos y organizar la colección en carpetas | UC-12, UC-13, UC-14, UC-15 |

**Matches NO está entre los cuatro flujos prioritarios**, pese a ser el área con más código.

### Actores

| Actor | Definición técnica | Alcance |
|---|---|---|
| Visitante | Sin sesión de Firebase Auth | Perfiles `/@usuario`, guías, legales, login, registro. **Puede armar un carrito y enviar un pedido de compra sin registrarse.** |
| Coleccionista | Autenticado (`requiresAuth`) | Colección, mazos, binders. Uso central. |
| Tradeador | Coleccionista con cartas en `sale`, `trade` o `wishlist` | Se le calculan matches, contacta y negocia por mensajería. No es un rol distinto. |
| Sistemas externos | Scryfall, Moxfield, MTGJSON, Card Kingdom | Puntos de falla externos, ninguno controlado por el proyecto. |

**No hay roles ni permisos administrativos. No existe un área de admin.**

### Mapa de rutas (`src/router/index.ts`)

| Ruta | Acceso |
|---|---|
| `/inicio` | Autenticado — landing; `/` y `/dashboard` redirigen acá |
| `/collection` | Autenticado |
| `/search` | Autenticado |
| `/decks/:id?` | Autenticado (`/decks/new`, `/decks/:id/edit` redirigen acá) |
| `/binders/:id?` | Autenticado |
| `/saved-matches` | Autenticado (`/contacts` redirige a su pestaña) |
| `/messages` | Autenticado |
| `/market`, `/settings` | Autenticado |
| `/@:username` | **Público** — única ruta que sirve a visitantes y a autenticados |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Sólo invitado (`requiresGuest`) |
| `/guide/*`, `/about`, `/contact`, `/faq`, `/terms`, `/privacy`, `/cookies` | Público |
| `/:pathMatch(.*)*` | Público — 404 |

### Modelo de dominio

- **`CardStatus`**: `collection` (la tengo, no la ofrezco) · `sale` · `trade` · `wishlist`
  (UI: "NECESITO").
- **`CardCondition`**: M, NM, LP, MP, HP, PO — multiplica el precio de referencia.
- **`public`**: booleano que controla la visibilidad en el perfil público.
- **Match**: tipo `VENDO`/`BUSCO`; estado `nuevo → visto → activo → eliminado`.
- **Carrito / pedido**: `ExchangeCart` vive en el navegador con `expiresAt`; `BuyRequest` se
  persiste bajo el dueño del perfil, estado `pending → seen → fulfilled`.

---

## 2. Inventario de la suite de pruebas (medido 2026-09-15)

| Nivel | Archivos | Casos | Comando |
|---|---|---|---|
| Unitarias (Vitest) | 181 | **2.296** declaraciones `it()`/`test()` | `npm run test:unit` |
| Integración (Firestore real) | 7 (+1 helper) | **65** | `npm run test:integration` |
| E2E (Playwright/Chromium) | 27 specs | **133** activos + 3 en cuarentena (`test.fixme`) | `npm run e2e` |
| **Total** | **215** | **2.494** | |

Notas de medición, porque los números de este proyecto tienen historial de mentir:

- Las 2.296 unitarias son **declaraciones**, no ejecuciones: un `it.each` cuenta una vez y
  corre varias.
- Los 133 E2E son `test(` a comienzo de línea. Además hay **3 `test.fixme`** (cuarentena
  deliberada) y **9 llamadas `test.skip()` condicionales dentro de cuerpos de test** — tests
  que se auto-omiten según el estado de la cuenta y por lo tanto **reportan "omitido", no
  "cubierto"**.
- `docs/E2E_TEST_PLAN.md` dice "135 tests" y describe casos que ya no existen (p. ej. "Stack
  groups cards by name", "Nav: Market link", "Edit card", "bulk change status to Sale" como
  test activo). **Está desactualizado — tratarlo como histórico, no como especificación.**
- `docs/CASOS-DE-USO.html` está en v1.55.1 / commit `9705b85` / 2026-08-08. Su catálogo de 27
  UC sigue siendo válido en estructura; sus notas de cobertura son de hace cinco semanas.

### Los tres niveles de E2E (política obligatoria de `CLAUDE.md`)

| Nivel | Cuándo | Comando | Duración |
|---|---|---|---|
| Smoke | Cada ticket | `npm run e2e:smoke` | ~2 min |
| Dirigido | Cada ticket, área tocada | `npm run e2e:<area>` | ~3-5 min |
| Completo | Una vez por tanda, antes de pushear a `develop` | `npm run e2e` | ~13 min |
| Nocturno (cron) | Automático contra dev desplegado | `npm run e2e:nightly` | ~13 min |

**El conjunto `@smoke` completo son 6 tests** (re-derivado del código hoy, coincide con
`CLAUDE.md`). Es el ÚNICO gate que corre contra **PRODUCCIÓN** (en cada push a `main`), y por
eso todos deben ser de sólo lectura:

1. `auth/login.spec.ts` — "successful login redirects to the /inicio landing"
2. `collection/collection-crud.spec.ts` — "collection page loads with card grid visible"
3. `smoke/navigation.spec.ts` — "nav: Collection link navigates to /collection"
4. `smoke/navigation.spec.ts` — "tab switching renders correct content"
5. `search/search.spec.ts` — "search by card name returns results grid"
6. `messages/messages.spec.ts` — "messages page loads conversation list"

**Sin cobertura `@smoke` contra producción:** matches (la etiqueta se quitó porque montar la
vista BORRA documentos — TASK-265) y perfil público (perdió la etiqueta en `f6b15b2`).

### Flakes conocidos (no sirven como señal)

- `auth/register.spec.ts` "successful registration" — rate-limit de `sendEmailVerification`.
  Etiquetado `@nightly-skip`.
- `search/search.spec.ts` "selecting autocomplete suggestion" — depende de que una sugerencia
  viva de Scryfall tenga precio. Etiquetado `@nightly-skip`.
- `help/help-legal.spec.ts` "FAQ page loads" — falló con timeout en la suite completa y pasó
  6/6 aislado. **Deliberadamente NO listado como flake conocido:** es un test roto de origen
  (cero `expect()`, cuerpo entero dentro de un `if isVisible`), y llamarlo flake lo
  legitimaría.

---

## 3. Casos de uso del producto (UC-01 … UC-27)

Origen: `docs/CASOS-DE-USO.html`. Cada UC trae su happy path y sus paths secundarios. La
columna "Cobertura" dice qué spec lo respalda; **"sin E2E" marca exactamente dónde una
regresión pasaría inadvertida.**

### 3.1 Autenticación y cuenta

**UC-01 — Registrarse** · Visitante · `e2e/specs/auth/register.spec.ts` (6 tests)
- Happy path: `/register` → correo + username + contraseña + confirmación → el sistema valida
  que correo y username no estén tomados y **reserva el username** → crea la cuenta → dispara
  correo de verificación → pantalla "verificá tu correo".
- Secundarios: campos vacíos → botón deshabilitado · formato de correo inválido → error de
  validación · correo ya registrado → bloquea · **username ya tomado → bloquea** · "volver a
  login" funciona.
- El happy path es `@nightly-skip`: crea una cuenta real de Firebase Auth.

**UC-02 — Iniciar sesión** · Visitante · `auth/login.spec.ts` (4 tests, 1 `@smoke`)
- Happy path: `/login` → credenciales → toast de éxito → **redirige a `/inicio`**, no al hub
  de matches.
- Secundarios: credenciales inválidas → toast de error, permanece · campos vacíos → botón
  deshabilitado · ya tiene sesión y entra a `/login` → `requiresGuest` lo expulsa · auth
  todavía resolviendo y navega → el guard cancela la redirección diferida.

**UC-03 — Recuperar contraseña** · Visitante · `auth/forgot-password.spec.ts` (5 tests)
- Happy path: "olvidé mi contraseña" → correo → confirmación de envío → enlace →
  `/reset-password` con `oobCode` → contraseña nueva + confirmación.
- Secundarios: correo vacío → validación · contraseñas no coinciden → rechaza ·
  **`oobCode` inválido o vencido → pantalla de error** · "volver a login".
- Los cuatro secundarios tienen test; **el happy path completo no**, porque depende de leer
  un correo real.

**UC-04 — Cambiar contraseña con sesión activa** · Coleccionista ·
`settings/settings-profile.spec.ts`, `settings/settings-data.spec.ts` (6 + 4 tests)
- Happy path: `/settings` → contraseña actual + nueva + confirmación → toast de éxito.
- Secundarios: confirmación no coincide → validación · correo sin verificar → puede reenviar.
- **El cambio de correo usa `verifyBeforeUpdateEmail` y revoca tokens de sesión: sin E2E.**

### 3.2 Landing autenticada

**UC-05 — Buscar una carta desde `/inicio`** · Coleccionista · **SIN E2E PROPIO**
- Happy path: tras login aterriza en `/inicio` → enfoca el buscador (mouse o tecla `/`) →
  sugerencias con debounce → elige una o envía → va a `/search` con `?q=`.
- Secundarios: `/` mientras escribe en otro campo → el atajo **no** roba la pulsación
  (se ignora en `input`, `textarea`, editables) · envía vacío → `/search` sin término ·
  atajos rápidos → enlaces a colección, mazos, binders y wishlist · carrusel de anuncios
  desde el bundle.
- Diseño deliberado: **sin contadores**, porque cada contador cuesta al menos una lectura de
  Firestore. Sólo el smoke de login asevera la redirección. Es la puerta de entrada al flujo
  Nº1 y el hueco de cobertura más reciente.

### 3.3 Colección

**UC-06 — Agregar una carta** · `collection/collection-crud.spec.ts`,
`preferences/preferences-crud.spec.ts`
- Happy path: modal de agregar → busca por nombre en Scryfall → elige la impresión concreta
  (edición, foil, idioma) → cantidad, condición, estado → guarda → aparece en la grilla.
- Secundarios: cancela → no crea nada · **clic fuera del modal NO cierra** (deliberado) ·
  ningún resultado con precio → se muestran todos; si al menos uno tiene precio, se ocultan
  los sin precio · guarda como wishlist → aparece en NECESITO, no en la grilla ·
  carta de doble cara → persiste con `card_faces` y muestra el botón de girar.

**UC-07 — Editar y borrar una carta** · flujo Nº3 · `collection-crud.spec.ts`
- Happy path: toca una carta → modal de detalle → edita cantidad/condición/estado/visibilidad
  pública → guarda → **el cambio persiste tras recargar** → borrar con confirmación explícita.
- Secundarios: cancela en el diálogo → la carta queda intacta · la carta está asignada a
  mazos → las asignaciones se recalculan al cambiar la cantidad · escribe justo después de
  guardar → parche optimista + refresco diferido con token de generación.
- **REFUTADO en el wargaming #1** (mutación M1): con `updateCard` devolviendo `true` sin
  persistir nada, el test seguía en VERDE, 2/2. → TASK-146, abierto.

**UC-08 — Operar sobre muchas cartas a la vez** · flujo Nº3 · `collection-crud.spec.ts`
- Happy path: selección múltiple → acción masiva (cambiar estado o borrar) → confirma → la
  grilla refleja el cambio en todas.
- Secundarios: borrado masivo cancelado → nada se borra (**sin E2E**) · selección enorme →
  las escrituras se parten en lotes (`writeBatch` tope 10 MiB).
- **REFUTADO** (mutación M2 + dos tests sin un solo `expect`). → TASK-147 (cerrado),
  TASK-205/206/207 (abiertos).

**UC-09 — Filtrar, ordenar y cambiar de vista** · flujo Nº2 · `collection-filters.spec.ts`
(4), `collection-views.spec.ts` (4)
- Happy path: chips de estado (todas / colección / disponible / NECESITO) → buscador local
  por nombre → orden → alterna grilla visual ↔ vista de texto con columnas → **los filtros
  quedan sincronizados en la URL y sobreviven a recargar o compartir el enlace**.
- Secundarios: vuelve a "ALL" → restablece · carta de doble cara → botón de girar alterna
  caras · parámetros legacy `?deck=`, `?binder=`, `?from=decks` → se redirigen ·
  la lista crece al paginar → el scroll no se resetea.
- **REFUTADO**: el test del buscador escribía en el buscador del HEADER y nunca filtró nada.
  → TASK-154, abierto.

**UC-10 — Exportar la colección** · `settings/settings-data.spec.ts`
- Happy path: `/settings` → gestión de datos → CSV de Moxfield o de Manabox → se descarga.
- **REFUTADO** (WG4-O2-02, wargaming corrida #4): el botón de exportación no existe en la
  aplicación — confirmado en el código, `SettingsView.vue` no tiene ninguna sección de
  exportación (TASK-302). Los dos tests que decían cubrir este happy path envolvían su única
  acción en `if (await ...isVisible())`: con el botón ausente el cuerpo nunca corría y el test
  pasaba en VERDE sin ejercer nada. → **SIN E2E** desde TASK-303 (2026-09-20): ambos tests
  quedan `test.fixme()` con referencia a TASK-302, que decide si la exportación se implementa
  o se retira del alcance declarado.

### 3.4 Búsqueda de cartas (Scryfall)

**UC-11 — Buscar en el catálogo** · flujo Nº1 · `search/search.spec.ts` (9 tests, 1 `@smoke`)
- Happy path: escribe el nombre → sugerencias mientras tipea → elige o Enter → grilla de
  resultados → afina con filtros avanzados (color, tipo, rareza, CMC, formato) → toca un
  resultado → modal de agregar a la colección.
- Secundarios: sin resultados → estado vacío explicativo · ya tiene la carta → insignia con
  la cantidad que posee · llega por enlace profundo del header y busca de nuevo → `?q=` se
  sincroniza al término más reciente · teclea rápido → debounce + guarda de carrera (una
  respuesta vieja no pisa a una nueva) · **Scryfall no responde → degradación, sin E2E**.
- **Trampa conocida del proyecto: hay CINCO superficies de autocompletado independientes.**
  Toda corrección de carrera o debounce debe aplicarse a las cinco.

### 3.5 Mazos

**UC-12 — Crear y borrar un mazo** · flujo Nº4 · `decks/deck-crud.spec.ts` (5)
- Happy path: modal de creación → nombre + formato (`vintage`/`modern`/`commander`/
  `standard`/`custom`) → guarda → aparece en la lista → borrar con confirmación.
- Secundarios: nombre vacío → impide guardar · borra un mazo con cartas asignadas → **se
  liberan las asignaciones; las cartas siguen en la colección**.

**UC-13 — Editar el contenido de un mazo** · flujo Nº4 · `decks/deck-editor.spec.ts` (5)
- Happy path: abre el mazo → editor con estadísticas → agrega cartas desde la colección al
  mainboard → mueve entre mainboard y sideboard → ajusta cantidades (asignaciones y stats se
  actualizan) → consulta curva de maná y distribución de tipos.
- Secundarios: **asigna más copias de las que posee → error de sobreasignación, se rechaza** ·
  exporta el mazo a CSV o portapapeles.
- **Un mazo ASIGNA cartas que ya están en la colección: no las duplica.** De ahí que la
  sobreasignación sea el path secundario central.
- **REFUTADO**: 4 de 5 tests del editor son cáscaras. → TASK-159, abierto.

**UC-14 — Importar un mazo desde Moxfield** · `decks/deck-import.spec.ts` (3)
- Happy path: pega la URL de Moxfield → progreso → el contenido importado aparece en el mazo.
- Secundarios: URL inválida → error, no importa nada · **pega sólo el ID → también funciona** ·
  importación muy grande → corre en Cloud Function con asignaciones compactas (techo ~35.000
  por binder, por el límite de 1 MB por documento).
- Flujo de importación unificado en un solo composable compartido con binders.

### 3.6 Binders (carpetas)

**UC-15 — Crear, llenar y publicar un binder** · flujo Nº4 · `binders/binders.spec.ts` (4)
- Happy path: crea con nombre → asigna cartas desde la colección o importa → **lo marca
  público y/o en venta** → queda visible en su perfil público → exporta a CSV o portapapeles.
- Secundarios: nombre vacío → impide guardar · cancela → no crea nada · borrar → confirmación.
- **Publicar y marcar en venta: sin E2E.**

### 3.7 Matches (no prioritario)

**UC-16 — Calcular matches** · `matches/match-calculation.spec.ts` (3)
- Precondición: tener cartas en `sale`, `trade` o `wishlist`.
- Happy path: `/saved-matches` → "actualizar" → sincroniza y recalcula con barra de progreso →
  los matches aparecen en "Nuevos" → cada uno indica `VENDO`/`BUSCO` y empareja una carta
  propia con una ajena.
- Secundarios: sin coincidencias → mensaje de guía, no lista vacía · dispara "actualizar" dos
  veces → **guarda de vuelo único**, no se lanzan dos recálculos en paralelo · un usuario
  produce varias coincidencias → se agrupan y deduplican, se conserva la más reciente ·
  ya lo había descartado → **no reaparece; descartar no es lo mismo que bloquear**.

**UC-17 — Gestionar un match hasta el contacto** · `matches/match-management.spec.ts` (7)
- Happy path: detalle del match (comparación de cartas + datos del otro usuario) → ME INTERESA
  → pasa a "Guardados" (activo) → abre el chat → cierran el trato fuera de la plataforma.
- Secundarios: descarta → "Eliminados" · compartir → toast de confirmación · bloquear → entra
  en la lista de bloqueados · navega entre pestañas (Nuevos / Guardados / Eliminados /
  Contactos) → cada una renderiza su contenido.

**UC-18 — Administrar contactos guardados** · `contacts/contacts.spec.ts` (6)
- Happy path: pestaña Contactos dentro del hub → lista → desde una tarjeta abre el chat o
  visita el perfil público.
- Secundarios: sin contactos → estado vacío · borra → confirmación, desaparece · cancela →
  intacto · entra por `/contacts` → redirige a la pestaña del hub.

### 3.8 Mensajería

**UC-19 — Conversar con otro tradeador** · `messages/messages.spec.ts` (7, 1 `@smoke`)
- Happy path: `/messages` → lista de conversaciones con vista previa del último mensaje y
  marca de tiempo → selecciona → escribe y envía → el mensaje aparece en el hilo.
- Secundarios: **escritorio → split-pane, la lista sigue visible (no modal)** · **móvil → la
  conversación tapa la lista y el botón de volver la recupera** · filtra por username →
  acota · filtro sin coincidencias → estado vacío.
- **Dos tests se auto-omiten** porque la cuenta de CI no tiene conversaciones. Se reportan
  como "omitidos", NO como cubiertos.

### 3.9 Perfil público y pedidos de compra

**UC-20 — Explorar un perfil público** · flujo Nº2 · `user-profile/user-profile.spec.ts` (6)
- Happy path: `/@usuario` → username, ubicación y avatar → recorre las cartas públicas →
  filtra por nombre.
- Secundarios: username inexistente → estado "usuario no encontrado" · **visitante sin sesión
  → NO ve los botones de interés ni de contacto** · es su propio perfil → UI distinta con
  opciones de edición.
- Filtros por chips de tipo/color sobre el índice público (`usePublicProfileIndex`).
  **Hueco declarado (KNOWN GAP):** no hay chip "other"; con los siete chips puestos las cartas
  sin categoría se ven, pero al deseleccionar UNO desaparecen sin aviso.
- **REFUTADO**: aserciones tautológicas, un logout que no desloguea, el perfil equivocado.
  → TASK-157, abierto.

**UC-21 — Armar un carrito y enviar un pedido de compra** · Visitante o Tradeador ·
**CERO PRUEBAS AUTOMATIZADAS**
- Happy path: en un perfil público agrega cartas al carrito, con cantidad acotada por el stock
  → el carrito se guarda en el navegador, por usuario dueño y con fecha de expiración → envía
  el pedido dejando **nombre, teléfono y correo** → se persiste un `BuyRequest` bajo el dueño
  del perfil en estado `pending` → el dueño lo ve en su pestaña de pedidos con contacto y
  total → al abrirlo pasa a `seen` → puede borrarlo cuando lo resuelve.
- Secundarios: pide más de lo disponible → acotado por `maxQuantity` · el carrito expira →
  se descarta por `expiresAt` · carritos en varios perfiles → se guardan por separado,
  indexados por username · **el dueño ya vendió esas cartas → el pedido conserva el estado del
  momento del envío; NO hay reserva de stock**.
- **Es el único flujo que toca a alguien sin cuenta y el único que se parece a una
  transacción comercial, y no tiene ni una prueba.**

### 3.10 Market (precios)

**UC-22 — Staples, movimientos e impacto en cartera** · flujo Nº1 ·
`market/format-staples.spec.ts` (3), `market/price-movers.spec.ts` (5),
`market/portfolio-impact.spec.ts` (3)
- Happy path: `/market` → **Staples**: elige formato y categoría → **Movimientos**: alterna
  ganadoras/perdedoras, filtra por formato y tipo de precio → **Impacto en cartera**:
  variación total y qué cartas suyas la explican, ordenable por impacto absoluto o porcentual.
- Secundarios: busca una carta puntual → autocompletado por nombre · posee cartas de la lista
  → se resaltan con su variación en dinero · **una carta sin precio → debe degradar sin romper
  el total (sin E2E)**.
- Card Kingdom es la fuente primaria de precios en todo el sistema.

### 3.11 Ajustes

**UC-23 — Gestionar perfil y datos** · `settings/settings-profile.spec.ts`,
`settings/settings-data.spec.ts`
- Happy path: `/settings` → revisa y edita username, ubicación y avatar → gestión de datos:
  exportar, reenviar verificación, reiniciar el tour guiado.
- Secundarios: reinicia el tour → la guía vuelve a aparecer · **elige un username ya tomado →
  debe rechazarlo** (se apoya en una colección dedicada y su regla de Firestore — **sin E2E**).
- Gotcha operativo: **el CI despliega sólo hosting; las reglas de Firestore van a mano**, y
  omitirlas ya rompió el registro una vez.

### 3.12 Transversal

**UC-24 — Cambiar de idioma** · `i18n/i18n.spec.ts` (5)
- Happy path: **el idioma por defecto es español** → elige inglés o portugués → la interfaz se
  actualiza al instante sin recargar → la preferencia sobrevive a recargar → y sobrevive al
  login hacia las pantallas autenticadas.
- Regla dura: `en.json` ↔ `es.json` ↔ `pt.json` se editan siempre juntos; una clave que exista
  en uno solo es un defecto.
- **Hueco transversal: la suite nunca corre en español, que es el idioma por defecto.**
  → TASK-162, abierto.

**UC-25 — Recibir avisos del sistema** · `notifications/toasts-and-notifications.spec.ts` (8)
- Happy path: acción exitosa → toast de éxito → **se auto-descarta a los 4 segundos** → la
  campana del header abre el panel de notificaciones → la insignia refleja los no leídos →
  marcar como leído la actualiza.
- Secundarios: acción fallida → toast de error · varios toasts seguidos → el último visible ·
  clic fuera del panel → se cierra.
- Regla dura: **nunca dos diálogos de confirmación en paralelo** — el segundo espera a que el
  primero termine su animación (`pendingResult` + `onAfterLeave`).

**UC-26 — Consultar ayuda y textos legales** · `help/help-legal.spec.ts` (5)
- Happy path: sin sesión accede a FAQ, términos, privacidad, cookies y guías → en el FAQ
  despliega y repliega preguntas → el logo lo devuelve al punto de entrada.

**UC-27 — Navegar entre secciones** · `smoke/navigation.spec.ts` (4, 2 `@smoke`)
- Happy path: header en escritorio / barra inferior en móvil → cada sección renderiza su
  contenido → las URLs viejas siguen funcionando por redirección.
- Secundarios: ruta inexistente → 404 · ruta autenticada sin sesión → el guard redirige a
  login · **se desplegó una versión nueva con la pestaña abierta → recarga única del chunk,
  con protección contra bucle** (aplica a toda ruta perezosa salvo `/login`, que se importa
  estáticamente a propósito).
- **REFUTADO**: el test del logo es un verde vacío. → TASK-150, abierto.

---

## 4. Casos E2E, uno por uno (los 133 activos)

Lista literal de títulos, medida del código hoy. Es el conjunto exacto que el wargamer puede
tomar como "el proyecto afirma que esto pasa".

### Auth (15)
`auth/login.spec.ts` (4): successful login redirects to the /inicio landing **@smoke** ·
invalid credentials show error toast · empty fields — submit button is disabled ·
"Forgot Password" and "Register" links navigate correctly.

`auth/register.spec.ts` (6): successful registration shows email verification screen
**@nightly-skip** · register button disabled when required fields empty · invalid email format
shows validation error · duplicate email blocks registration · duplicate username blocks
registration · back to login link works.

`auth/forgot-password.spec.ts` (5): submit email shows confirmation message · empty email
shows validation error · back to login link · reset password page rejects mismatched
passwords · reset password with invalid/expired oobCode shows error.

### Colección (15 activos + 3 en cuarentena)
`collection/collection-crud.spec.ts` (7): collection page loads with card grid visible
**@smoke** · add card: open modal → search → select → save → card appears · delete card:
click delete on grid card → confirm → card removed · bulk select → bulk delete → confirm →
selected card removed · bulk select → bulk delete → cancel confirm → selection and count
intact · cancel deletion from confirm dialog leaves card intact · teardown restores a merged
add on BOTH sides (doc and card_index).
  - **En cuarentena (`test.fixme`)**: "edit card: change quantity → save → reload → change
    persists (blocked by TASK-155)" y "bulk select → bulk change status to Sale → status counts
    move in the store, not just the toast". Los dos son **exactamente UC-07 y UC-08**, los dos
    casos del flujo Nº3 que el wargaming #1 refutó: el proyecto sabe que no están cubiertos y
    dejó los tests desactivados en vez de dar un verde falso.

`collection/collection-filters.spec.ts` (4): status filter "AVAILABLE" · status filter "ALL"
resets · search bar filters collection by card name · sort dropdown changes card order.

`collection/collection-views.spec.ts` (4): visual grid renders card images · text view shows
list with card data columns · dual-faced card shows toggle button · clicking toggle switches
between card faces.

`collection/delete-during-initial-load.spec.ts` (0 activos, 1 `test.fixme`): "right-click →
ELIMINAR on a card the full index has not loaded yet actually deletes it" — **el único test
de la suite que toca el menú contextual con botón derecho**. Cuarentenado a propósito: el
cuerpo es correcto y la app pasa cada paso, pero el guard final exige una prueba que hoy no
puede producir (TASK-185 / TASK-179).

`preferences/preferences-crud.spec.ts` (5, wishlist): WANTED filter shows wishlist cards
section · add wishlist card via add card modal → appears in WANTED · delete a wishlist card ·
cancel add card modal without saving · status filter shows only wishlist cards.

### Búsqueda (9)
`search/search.spec.ts`: search by card name returns results grid **@smoke** · autocomplete
suggestions appear while typing · selecting autocomplete suggestion populates search and shows
results **@nightly-skip** · press Enter submits search · advanced filters narrow results ·
click result card opens add-to-collection modal · owned-count badge visible for cards already
in collection · no-results shows empty state message · local search after a header deep-link
syncs ?q= to the latest term.

### Mazos (13)
`decks/deck-crud.spec.ts` (5): create new deck → appears in deck list · create deck
validation: empty name prevents saving · delete deck with confirmation · open existing deck in
editor → editor loads with stats · deck tab in collection view shows deck list.

`decks/deck-editor.spec.ts` (5): add card from collection to mainboard → allocation + stats
update · add card to sideboard → move between mainboard and sideboard · adjust card quantity →
quantity display updates · **over-allocation validation: allocate more than available → error** ·
deck stats panel shows mana curve / type distribution.

`decks/deck-import.spec.ts` (3): import from Moxfield URL → progress → imported content
appears · import with invalid Moxfield URL shows error · import using deck ID only succeeds.

### Binders (4)
`binders/binders.spec.ts`: create new binder → appears in binder list · create binder
validation: empty name prevents saving · cancel binder creation from modal · delete binder
with confirmation.

### Matches y contactos (16)
`matches/match-calculation.spec.ts` (3): actualizar button triggers sync + recalculate with
progress · calculated matches appear on "New" tab · no matches found shows guidance message.

`matches/match-management.spec.ts` (7): matches page loads with tab navigation · open match
detail modal → shows card comparison + user info · save match (ME INTERESA) → moves to Saved
tab · discard match → moves to Deleted tab · share a match → toast confirmation · block user
from match card → appears in blocked users list · switch between match tabs.

`contacts/contacts.spec.ts` (6): contacts page loads contact list · open chat modal from
contact card · visit contact public profile link · delete contact with confirmation · cancel
deletion leaves contact intact · empty state shown when no contacts saved.

### Mensajería (7)
`messages/messages.spec.ts`: messages page loads conversation list **@smoke** · open
conversation → send message → message appears in the inline thread · conversation list shows
last message preview + timestamp · filter conversations by username · desktop: selecting a
conversation keeps the list visible (split-pane, no modal) · empty state when no conversations
match filter · opening a conversation covers the list; back button returns to it.

### Perfil público (6)
`user-profile/user-profile.spec.ts`: view public user profile: username, location, avatar
visible · browse public cards on profile with text search filter · logged-out visitor does NOT
see interest/contact buttons · non-existent username shows user-not-found state · own profile
loads via direct URL navigation (bookmark / refresh) · logged-in user viewing own profile sees
different UI.

### Market (11)
`market/format-staples.spec.ts` (3): format staples tab loads with staples list · switch
format selector changes displayed staples · switch category filters staples.

`market/price-movers.spec.ts` (5): price movers tab loads winners list · switch between
Winners/Losers tabs · filter by format changes displayed movers · filter by price type updates
movers context · search by card name using autocomplete.

`market/portfolio-impact.spec.ts` (3): portfolio impact section renders with total delta ·
sort by impact vs percentage changes order · owned cards highlighted with dollar change amount.

### Ajustes (10)
`settings/settings-profile.spec.ts` (6): change password section visible with CHANGE button ·
change password: fill current + new + confirm → success toast · change password: mismatched
confirmation shows validation error · username section visible · location section visible ·
data management section has action buttons.

`settings/settings-data.spec.ts` (4): export collection as Moxfield CSV · export collection as
Manabox CSV · resend verification email → confirmation toast · restart guided tour.

### Transversal (17)
`smoke/navigation.spec.ts` (4): nav: Collection link navigates to /collection **@smoke** ·
legacy /contacts redirects into the MATCHES hub · nav: Matches dropdown navigates to
/saved-matches · tab switching renders correct content **@smoke**.

`i18n/i18n.spec.ts` (5): default language is Spanish on login page · switch to English → UI
updates immediately · switch to Portuguese → UI updates immediately · language persists after
page reload · language persists after login into authenticated pages.

`notifications/toasts-and-notifications.spec.ts` (8): success toast appears on login · error
toast on failed action (wrong password) · multiple sequential toasts: latest is visible ·
toast remains visible briefly (does not flash-dismiss) · notification dropdown opens/closes
from header bell · notification badge reflects unread count · clicking outside dropdown
dismisses it · mark notification as read updates badge.

### Ayuda y legales (5)
`help/help-legal.spec.ts`: FAQ page loads: expand/collapse a question · Terms of Service page
loads and is readable · Privacy Policy page loads · Cookies page loads · FAQ: return to login
by clicking logo.

---

## 5. Tests de integración (65 casos, Firestore real, `npm run test:integration`)

Es la única capa automatizada que ejercita reglas de Firestore y escrituras reales.

| Archivo | Casos | Qué afirma que funciona |
|---|---|---|
| `anonymousExposure.test.ts` | 4 | **Seguridad/privacidad**: `/users` no devuelve `email` a un anónimo · `/public_cards` tampoco devuelve `email` · `/contact_info` NO es legible sin sesión · `users/{uid}/cards` no es enumerable sin sesión (regresiones de TASK-169 y TASK-087) |
| `collection.test.ts` | 10 | CRUD de cartas · **sincronización pública**: una carta `trade` y una `sale` se sincronizan a `public_cards`, una `collection` **NO** · una `wishlist` va a `public_preferences` · transición `collection → trade` actualiza `public_cards` |
| `decks.test.ts` | 11 | CRUD de mazos · asignaciones al mainboard y al sideboard · múltiples asignaciones en un mazo · wishlist del mazo · asignaciones mixtas · **los 5 formatos soportados** |
| `deletion.test.ts` | 10 | Borrar mazo **y** sus cartas asignadas · borrar mazo **conservando** las cartas · extracción de ids únicos · mazo sin asignaciones · lo mismo para binders · **seguridad cruzada: borrar un mazo NO borra cartas asignadas a otro mazo, ni a un binder, y viceversa** |
| `e2e-match-flow.test.ts` | 11 | **El recorrido completo del producto en 11 pasos**: A pone una carta en `trade` → B la pone en `wishlist` → las colecciones públicas contienen los datos → descubrimiento del match por queries → B manda ME INTERESA (`shared_match`) → visible para ambos → A crea conversación y manda mensaje → B responde → conversación completa con ambos mensajes → post-trade ambos quitan sus cartas → las colecciones públicas quedan limpias |
| `matches.test.ts` | 8 | Los matches descartados persisten en `matches_eliminados` · **persisten entre sesiones (re-login)** · filtrado de nuevos por `otherUserIds` descartados · CRUD en `matches_nuevos` · **reglas de seguridad: sólo se leen los matches propios** |
| `messages.test.ts` | 11 | Creación de conversación entre dos usuarios · **el id de conversación es consistente sin importar quién la inicia** · guarda nombres de participantes · envío de mensaje · actualiza `lastMessage` · orden de múltiples mensajes · ambos pueden enviar · visible para ambos participantes · mensajes marcados como no leídos inicialmente · guarda info del emisor |

---

## 6. Tests unitarios (2.296 casos en 181 archivos)

Resumen por área. Los archivos nombrados son los que codifican reglas de negocio observables
por el usuario (el resto son detalles internos).

| Carpeta | Archivos | Casos | Qué cubre |
|---|---|---|---|
| `utils/` | 46 | 606 | Lógica pura del dominio |
| `stores/` | 56 | 480 | Pinia: colección, mazos, binders, matches, mensajes, market, carrito |
| `functions/` | 17 | 430 | Cloud Functions: índice de cartas, índice público, enriquecimiento del import |
| `composables/` | 21 | 321 | Filtros, paginación, importación, búsqueda, tour, grilla virtual |
| `services/` | 17 | 231 | Scryfall, Moxfield, MTGJSON, caché de precios, lookup de usuario |
| `components/` | 14 | 117 | Modales, tarjetas de grilla, barra de selección, footers de stats |
| `router/` | 1 | 40 | `authGuard` |
| `e2e/` (meta) | 3 | 36 | Coherencia de la propia suite E2E y del bundle |
| `scripts/` | 3 | 26 | Backfills y migración de usernames |
| `views/` | 2 | 8 | Privacidad del perfil público, claves de estado vacío |
| `App.test.ts` | 1 | 1 | Arranque |

### Los de mayor densidad (candidatos a "reglas que el producto promete")

- **Índice de cartas y perfil público** (la familia más grande y más frágil del proyecto):
  `functions/publicCardIndexQuery` (101), `functions/publicCardEntry` (57),
  `functions/queryCardIndex` (48), `functions/publicCardIndex` (43),
  `functions/publicCardIndexExecutor` (33), `functions/publicCardCacheBackfill` (32),
  `functions/publicCardIndexReconciler` (17), `services/publicCards` (49),
  `composables/usePublicProfileIndex` (22), `services/publicCardIndexClient` (17).
- **Cartas y colección**: `utils/cardHelpers` (74), `composables/useCardFilter` (59),
  `stores/collection.ghostCardCure` (29), `utils/cardSaveDiff` (29),
  `stores/collection.pagination` (25), `stores/collection.paginatedSync` (21),
  `utils/collectionFilters` (18).
- **Precios y market**: `stores/market.portfolio` (56), `stores/priceMatchingHelper` (31),
  `services/scryfallCache` (24), `services/mtgjson.priceCoercion` (19),
  `utils/priceAggregation` (12), `utils/conditionMultiplier` (14).
- **Búsqueda**: `utils/scryfallQuery` (50), `utils/loginCardSearch` (32),
  `composables/useGlobalSearch` (31), `utils/searchPagination` (17),
  `utils/searchSections` (12).
- **Mazos y curva de maná**: `utils/manaCurve` (31), `utils/karstenThresholds` (14),
  `utils/karstenAnalysis` (12), `utils/manaCost` (14), `services/manaCurveLands` (17),
  `stores/decks.moveCardBoard` (15), `utils/deckSlotDiff` (12), `utils/binderSlotDiff` (11).
- **Carrito y pedidos de compra**: `stores/exchangeCart` (38),
  `utils/exchangeCartShare` (11), `utils/buyRequest` (6), `stores/buyRequests` (3).
  **Ojo: la lógica del carrito tiene 58 unitarias y CERO E2E.**
- **Auth y usernames**: `router/authGuard` (40), 8 archivos `stores/auth.*` (40 en total),
  `utils/username` (14), `stores/usernameReservation` (5), `services/userLookup` (7),
  `utils/passwordStrength` (6), `scripts/usernameMigration` (8).
- **Matches y mensajes**: `utils/matchChipFilter` (14), `stores/matches.dateHelpers` (16),
  `utils/matchNotification` (9), `utils/matchDedup` (8), `utils/messageUnread` (9),
  `stores/messages.unreadCount` (8), `utils/matchExpiry` (6), `utils/matchGrouping` (6).
- **Importación**: `utils/importHelpers` (16), `composables/useCollectionImport` (19),
  `services/moxfield` (15), `services/moxfield.malformed` (13),
  `functions/enrichImportCards` (14).
- **i18n / idioma**: `utils/localePreference` (8).

---

## 7. Casos de prueba MANUALES documentados en tickets (`tasks/`)

23 tickets llevan la etiqueta `qa-manual`. Son casos escritos para ejecutar a mano, con
precondiciones, pasos y resultado esperado. **Es el material más directamente reutilizable por
un agente de QA**, porque ya está redactado en formato de caso de prueba.

### Accesibilidad y navegación (epic TASK-017, "Phase 4")

| Ticket | Estado | Caso |
|---|---|---|
| TASK-019 | todo / **high** | **TC-P04-01** — El buscador global del header funciona 100% con teclado, sin mouse (atajo `/`, combobox, flechas, Enter, Escape). Desktop ≥768px. |
| TASK-020 | todo | **TC-P04-02** — `MobileSearchOverlay` responde a teclado físico con viewport <768px. |
| TASK-021 | todo / **high** | **TC-P04-03** — `Cmd+click` / `Ctrl+click` abre en pestaña nueva en **los 12 puntos de navegación** de la app, sin afectar la pestaña actual. |
| TASK-022 | done | **TC-P04-04** — Click con rueda del mouse abre en pestaña de fondo. |
| TASK-026 | todo | **TC-P04-08** — Smoke de lector de pantalla: el `GlobalSearch` anuncia combobox abierto/cerrado y número de resultados (VoiceOver / NVDA / ChromeVox). |

### Importación y curva de maná (epic TASK-015, "Deck Intelligence")

| Ticket | Estado | Caso |
|---|---|---|
| TASK-028 | done | **TC-27-01** — Importar deck de Moxfield por URL **guarda CMC y tipo de carta**. |
| TASK-029 | done | **TC-27-02** — Los datos de las cartas importadas **persisten tras recargar la página**. |
| TASK-030 | done | **TC-27-03** — Las tierras básicas **NO** aparecen en el bucket 0 de la curva de maná. |
| TASK-031 | todo | **TC-27-04** — Las cartas **MDFC** (dos caras, p. ej. `Valakut Awakening // Valakut Stoneforge`) aparecen en el bucket del **hechizo**, no en el bucket 0. |
| TASK-032 | done | **TC-27-05** — Las imágenes de cartas importadas cargan correctamente tras reload. |
| TASK-033 | done | **TC-27-06** — Importar desde `/binders` preserva el fix de metadata (regresión). |

### Happy paths de negocio (migrados de Jira, asignados a Mato)

⚠️ **Estos cuatro fueron escritos contra una versión anterior de la app y citan rutas que hoy
NO existen** (`/my-page`, `/binder/usuario-test`). El comportamiento esperado sigue siendo
válido como intención de producto; las rutas hay que traducirlas (`/my-page` → `/inicio`,
`/binder/usuario-test` → `/@usuario`).

| Ticket | Estado | Casos |
|---|---|---|
| TASK-078 | todo | **Onboarding.** TC-01: registro con datos válidos → responde 201, guarda token, redirige y aparece un **modal bloqueante "Iniciar Tour"**. TC-02: "Saltar"/"X" cierra el modal y el dashboard queda interactivo; **tras F5 el modal NO reaparece** (flag de usuario nuevo persistido). |
| TASK-079 | todo | **Login de usuario existente.** TC-03: credenciales correctas → redirección inmediata; la landing carga datos personalizados (avatar, estadísticas); **no se muestra ningún modal de onboarding**. |
| TASK-080 | todo | **Loop de registro (anónimo → cliente).** TC-05: un anónimo pulsa "Deseo" sobre un binder público → el sistema **intercepta ANTES de procesar la transacción** y despliega un modal bloqueante de registro obligatorio. TC-06: completar el registro desde el modal **inicia sesión automáticamente** y **la selección de cartas hecha como anónimo persiste/sincroniza**. |
| TASK-081 | todo | **Notificación de match.** Clic en "Me interesa" sobre una carta de un perfil público → **el dueño del binder recibe un aviso**, y el aviso **identifica la carta concreta**. |
| TASK-072 | todo | **Buy Requests + mejoras de matches** (v1.33.0). Incluye: **descartar un match NO debe bloquear a la persona** — tras recalcular, X sigue apareciendo en otros matches y NO figura en el modal de usuarios bloqueados. |

### Otros casos de QA manual ya cerrados (valen como comportamiento esperado)

TASK-034 (searcher con discovery + version picker en decks/binders/collection), TASK-035 y
TASK-036 (contador xN del editor de mazos, stack visual de copias — **TASK-036 sigue abierto,
high**), TASK-039 (5 escenarios de `CardDetailModal`), TASK-040 (array spread en binders),
TASK-042 (análisis de color en el deckbuilder: símbolos vs fuentes), TASK-065 (**el filtro del
buscador desaparece al ver el perfil de otro usuario**), TASK-074 (verificación en dev).

---

## 8. Reglas de producto declaradas en `CLAUDE.md` (afirmaciones atacables)

Cada una es una afirmación explícita del proyecto sobre su propio comportamiento.

1. **Cartas de doble cara (split/DFC)**: se detectan con `card.card_faces.length > 1`, se
   guardan en Firestore con el array `card_faces`, y se muestra un botón ↔️ para alternar
   caras. `CollectionGrid.vue` usa las imágenes `.normal`.
2. **Modales de edición**: `AddCardModal`, `EditCardModal` y `CardStatusModal` usan siempre
   `closeOnClickOutside="false"` — **no se cierran por clic fuera**, para no perder edición.
3. **Nombres de estado internos**: `collection`, `sale`, `trade`, `wishlist` (nunca las
   traducciones); la traducción a UI pasa por `getStatusLabel()`.
4. **Filtro de precios en resultados de búsqueda**: si algún resultado tiene `prices.usd > 0`
   se muestran **sólo** los cartas con precio; si ninguno tiene precio, se muestran todos.
   ⚠️ **TASK-158 (abierto, high) midió que esta regla existe SÓLO en el buscador anónimo del
   login.** El store de búsqueda sólo ordena y el modal de agregar no filtra.
5. **Toasts**: `toastStore.showToast(message, type)` con `'success' | 'error' | 'info'`,
   auto-descarte a los 4 segundos.
6. **Un solo modal de confirmación a la vez**: el segundo `show()` espera a que el primero
   termine su animación (`pendingResult` + `onAfterLeave`).
7. **Arquitectura de tres vistas**: `/collection`, `/decks/:id?` y `/binders/:id?` son rutas
   separadas sin estado `viewMode` compartido. La navegación entre pestañas usa `<RouterLink>`,
   nunca toggles internos. Los parámetros legacy `?deck=` / `?binder=` / `?from=decks` siguen
   redirigiéndose por compatibilidad.
8. **El swipe para borrar/cambiar estado fue eliminado del proyecto** (TASK-251). Los cambios
   de estado van por el menú contextual y el borrado por el botón ELIMINAR de la grilla.
   ⚠️ `docs/CASOS-DE-USO.html` todavía lista el gesto de swipe como path secundario de UC-07:
   **es una afirmación obsoleta del documento, no un caso a probar.**
9. **Estructura de Firestore**: `/users/{userId}/` con subcolecciones `cards`, `decks`,
   `preferences`, `savedMatches`, `savedContacts`. **`public_cards` es una colección RAÍZ con
   campo `userId`, NO una subcolección** — apuntar al path equivocado da falsos negativos.
10. **Paleta y tipografía**: negro `#000000`, plata `#EEEEEE`, neón `#5AC168`, óxido
    `#8B2E1F`; Open Sans.

---

## 9. Lo que YA se sabe roto (no gastar presupuesto redescubriéndolo)

80 tickets abiertos con prioridad `critical`/`high`. Los que afectan comportamiento observable
por el usuario, agrupados. Un ataque que aterrice acá **confirma**, no descubre.

### Pérdida silenciosa de datos (la familia más grave)

| Ticket | Estado | Defecto |
|---|---|---|
| TASK-206 | todo / critical | **La acción masiva se aplica A MEDIAS y en SILENCIO**: la escritura se agota y el usuario cree que se hizo. |
| TASK-207 | todo / high | `batchUpdateCards` devuelve `ok: true` habiendo escrito a medias — el valor de retorno miente. |
| TASK-209 | todo / critical | **Paginar mientras se muta PIERDE y DUPLICA cartas**, en silencio, en las dos direcciones. |
| TASK-208 | todo / critical | El `card_index` diverge de Firestore y **no converge solo**: la app muestra un inventario que no existe. |
| TASK-237 | in_review / critical | Un cambio de estado **se pierde si el usuario recarga o navega dentro de los 2 s del debounce**. |
| TASK-185 | in_review / critical | Eliminar una carta durante la carga inicial de `/collection` no borraba nada, en silencio. |
| TASK-155 | todo / high | Editar y recargar enseguida puede perder la actualización del índice. |
| TASK-205 | todo / high | **"Select all" ignora TODOS los filtros menos el estado**: el usuario opera sobre un conjunto que no es el que ve. |
| TASK-243 | in_progress / critical | La importación deja el **47% de las cartas sin metadatos** y no hay forma de reanudarla. |
| TASK-265 | todo / high | **Cargar `/saved-matches` BORRA documentos**: `cleanExpiredMatches` corre en el mount, con catch silencioso. |
| TASK-246 | todo / high | El botón de "borrar todo" no borra carpetas ni mazos, y deja el estado inconsistente. |

### Seguridad y privacidad

| Ticket | Estado | Defecto |
|---|---|---|
| TASK-217 | todo / critical | **Cualquier usuario con cuenta puede LEER, EDITAR, BORRAR e INYECTAR mensajes privados de cualquier conversación.** |
| TASK-169 / TASK-210 | todo / critical / high | La colección `/users` se puede enumerar entera sin sesión (emails, username, location, createdAt). |
| TASK-227 | todo / critical | 134 cuentas de prueba en PROD cuyos emails se siguen descargando sin sesión. |
| TASK-087 | todo / high | La regla de `users/{uid}/cards` permite leer colección y wishlist privadas por query. |

### Rendimiento (choca de frente con el criterio de éxito de 50k cartas)

TASK-199 (critical, **~160 MB de precios en la primera visita a `/collection`; 36 min a
600 Kbps**), TASK-204 (critical, la paginación server-side no ahorra nada: ~9 s por página),
TASK-153 (**20-27 s hasta la primera fila con 41.000 cartas**), TASK-179 (ni una carta en 44 s
bajo 4G lenta), TASK-201 (33,5 MB para ver un perfil ajeno de 60 cartas), TASK-166 (~7 s entre
que llega el perfil y el buscador queda usable), TASK-142, TASK-173, TASK-177, TASK-181,
TASK-190 (los links legacy tardan 27-62 s en redirigir), TASK-282.

### Robustez y mensajes de error

TASK-194 (**con Firestore caído la app afirma "0 CARDS" y "$0 COLLECTION VALUE" como si fueran
datos reales**), TASK-195 (**Scryfall caído: la sección de resultados DESAPARECE sin ningún
mensaje** — el usuario concluye que la carta no existe), TASK-198 (si `queryCardIndex` falla la
app no avisa nada y la grilla vacía se lee como "no tenés cartas"), TASK-187 (`queryCardIndex`
falla con `internal` y deja `/collection` vacía), TASK-192, TASK-266 (register muestra el error
crudo de Firebase sin traducir).

### Corrección funcional

TASK-197 (**buscar en la colección NO ignora acentos**: "Seance" no encuentra "Séance", "Aether
Vial" no encuentra "Æther Vial"), TASK-193 (precios negativos, absurdos y viejos se muestran
como válidos de hoy), TASK-200 (**la misma pantalla muestra dos valores de la colección ~17%
aparte**), TASK-202 (un vendedor con 3.187 cartas a la venta sólo expone 432, con tres números
que no coinciden), TASK-279 (**importar por texto plano pierde la última palabra del nombre**:
"4 Lightning Bolt" entra como "Lightning"), TASK-170 (el perfil público da 404 si el username
tiene mayúsculas), TASK-252 (**en móvil, buscar desde `/inicio` redirige al login estando
logueado**), TASK-244 (Scryfall no encuentra planos, esquemas ni fichas: falta
`include:extras`), TASK-164 (**la regla de sobreasignación tiene TRES caminos con TRES
comportamientos**; sólo uno rechaza, los otros dos desvían el excedente a la wishlist en
silencio), TASK-163 (el asistente ofrece "IMPORTAR 0 CARTAS" habilitado sin aviso; el modal de
crear carpeta dice "mazo"), TASK-189 (una importación interrumpida no se puede retomar nunca),
TASK-203 (con 263 mazos y 104 carpetas no hay forma de llegar a uno), TASK-191, TASK-036,
TASK-270 (**el modal de bienvenida puede dejar sus botones fuera de alcance en móvil** — es lo
primero que ve todo usuario nuevo y el mercado objetivo es móvil).

### Los 14 mecanismos de "verde vacío" (catálogo de TASK-144)

Vale como lista de control para juzgar cualquier test de este proyecto:

1. Return temprano por conteo (`if (cardCount === 0) return`).
2. Escape silencioso (`.waitFor(...).catch(() => {})`).
3. Locator de una interfaz que ya no existe.
4. `.first()` sobre un selector genérico (el header roba coincidencias en toda ruta autenticada).
5. Texto de botón cambiado.
6. Elemento que no existe (no hay `input[type=checkbox]` en la grilla v2).
7. Tautología sobre `.count()` (`toBeGreaterThanOrEqual(0)`).
8. Tautología por `typeof` (`expect(typeof visible).toBe('boolean')`).
9. Tautología por `|| true`.
10. Aserción hardcodeada (`expect(true).toBe(true)`).
11. Desajuste de objetivo: el test ejecuta la acción pero lo único que asevera ya era cierto.
12. Acción que no existe en el componente (el page object es genérico).
13. **Cobertura fantasma**: el título promete más de lo que el cuerpo verifica ("username,
    location, avatar visible" sólo comprueba username). El más insidioso.
14. **Deriva de índice en grilla virtualizada** — el más peligroso. Una aserción anclada a "la
    carta del índice 0, antes contra después" NO es confiable, y no importa cómo se la
    formule: conteo, identidad simple e identidad con sondeo de estabilidad fallaron las tres.
    **Ancla correcta: algo derivado del store completo** (el contador de la insignia del nav,
    los conteos de los chips de estado), nunca de la ventana virtualizada.

---

## 10. Dónde está flojo (mapa de riesgo para el wargaming)

| Área | Casos documentados | Cobertura automatizada | Veredicto para el ataque |
|---|---|---|---|
| **Carrito y pedido de compra (UC-21)** | 1 UC con 6 pasos de happy path + 4 secundarios | **0 E2E**, 58 unitarias | **El hueco más grande.** Único flujo comercial y único que toca a alguien sin cuenta. Blanco de máximo valor. |
| **Landing `/inicio` (UC-05)** | 1 UC + 4 secundarios | **0 E2E propios** | Puerta de entrada al flujo Nº1. Su buscador ya se reportó roto una vez en dev y una vez en móvil (TASK-252). |
| **Accesibilidad (teclado, lector de pantalla)** | 5 casos manuales (TASK-019/020/021/026) | 0 automatizado | Criterio de éxito **declarado** del proyecto. Nunca verificado. |
| **Idioma español** | UC-24 | **La suite nunca corre en español**, que es el idioma por defecto | Todo el producto en su idioma real está sin probar (TASK-162). |
| **Mensajería (autorización)** | UC-19 + 11 integración | E2E con 2 tests auto-omitidos | TASK-217 dice que cualquiera lee y escribe conversaciones ajenas. |
| **Matches** | UC-16/17/18 + 8 integración | 16 E2E, **sin `@smoke` contra prod** | Área con más código, no prioritaria, cobertura calificada como nula (TASK-161). Montar la vista borra documentos. |
| **Ajustes / notificaciones / ayuda** | UC-23/25/26 | 23 E2E de calidad no verificada | TASK-161: "cobertura nula". El de FAQ es un verde vacío que ya se puso rojo. |
| **Degradación de servicios externos** | Documentada como "debe degradar sin romper" | 0 E2E | TASK-194 y TASK-195 ya midieron que NO degrada: miente o desaparece. |
| **Escala real (50k-200k cartas)** | Criterio de éxito del proyecto | TASK-180: **"el 30% del mercado nunca se ha probado"** | Todos los defectos críticos de pérdida de datos aparecen bajo carga. |
| Colección (CRUD, filtros) | UC-06 a UC-10 | 15 E2E + 10 integración + ~480 unitarias | Buena cobertura **nominal**; UC-07 y UC-08 fueron refutados por mutación. |
| Mazos y binders | UC-12 a UC-15 | 17 E2E + 21 integración | La cobertura más completa en papel; 4 de 5 tests del editor son cáscaras. |
| Auth | UC-01 a UC-04 | 15 E2E + 40 unitarias de `authGuard` | La más densa. El happy path de registro es flake y el de reset de contraseña no existe. |
| Perfil público | UC-20 | 6 E2E + 4 integración + ~300 unitarias del índice | Refutado (TASK-157). Sin `@smoke` contra prod. |
| **Admin** | — | — | **No existe: el sistema no tiene roles ni permisos administrativos.** |

### Estado de los entornos (importante antes de atacar)

- **dev (`cranial-trading-dev`)**: la colección raíz `public_cards` está **en CERO** mientras
  2.202 cartas siguen `public=true` / `status='sale'`. El índice público del vendedor de
  prueba quedó en 602 entradas. **El Nightly E2E está rojo desde el 2026-09-09 por esto.**
  Causa del vaciado: sin identificar. Un ataque contra el perfil público en dev va a chocar
  con este estado, que **no es el comportamiento esperado**.
- **producción (`cranial-trading`)**: fue vaciada el 2026-08-24 por orden explícita. Conserva
  una sola cuenta con ~5.765 cartas. El gate `@smoke` de `main` corre contra ella.

---

## 11. Fuentes

| Fuente | Qué aporta | Vigencia |
|---|---|---|
| `docs/CASOS-DE-USO.html` | Los 27 UC con happy paths y paths secundarios | v1.55.1 / 2026-08-08 — estructura válida, notas de cobertura desactualizadas |
| `docs/RESULTADOS-WARGAMING.html` | Wargaming #1: veredicto por UC, 14 mecanismos de verde vacío, 2 refutaciones con mutación | 2026-08-08 |
| `docs/E2E_TEST_PLAN.md` | Mapeo test ↔ caso de uso (UC-AUTH-01, UC-COL-01, …) | **Desactualizado** (dice 135 tests, describe tests que ya no existen) |
| `e2e/specs/**` | 133 tests activos + 3 en cuarentena | Medido hoy |
| `tests/unit/**` | 2.296 casos en 181 archivos | Medido hoy |
| `tests/integration/**` | 65 casos contra Firestore real | Medido hoy |
| `tasks/TASK-*.json` | 270 tickets; 216 con `acceptance_criteria`; 23 con casos de QA manual | Medido hoy |
| `CLAUDE.md` | Reglas de producto, política de E2E de tres niveles, convenciones | Vigente |
| `PROJECT.md` | Descripción del producto, usuarios objetivo, criterio de éxito | Vigente |
| `TESTING.md` | Convenciones de test, fixtures, reglas de mocking | Vigente |
| `docs/DESIGN_DOCUMENT.md`, `collection-loading-flow.md`, `import-flow.md` | Flujos técnicos de carga e importación | No auditado en esta recopilación |

---

*Recopilado el 2026-09-15 por el orquestador, sólo lectura, sin modificar código ni datos.*
