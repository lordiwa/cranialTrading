# TASK-304 — hand-off del developer, commit `74ab908`

> **Por qué está acá y no en el ticket:** `appendComment` sigue rechazando toda escritura sobre
> `tasks/TASK-304.json` por el comentario inválido de schema preexistente. Ver
> `artifacts/COMENTARIOS-INVALIDOS-2026-09-20.md`. Pegar cuando se resuelva.

## Decisión del AC4 (texto para el ticket)

El AC4 planteaba una disyuntiva: "el enriquecimiento corre sobre las tres colecciones, o se lee
desde una única fuente". La medición del AC1 mostró que **ya** se lee desde una única fuente:
ninguna de las tres colecciones de Firestore guarda precio de Card Kingdom, TCG ni buylist — las
tres solo llevan el precio propio del vendedor (`price`/`price`/`p`), y las dos vistas obtienen
CK/TCG/buylist del mismo camino en memoria (`CollectionGrid → useCardPrices →
services/mtgjson.getCardPrices`).

**El problema nunca fue la fuente.** Era que el perfil público no precargaba los mapeos de set
MTGJSON en lote como sí lo hace `/collection` (vía `CollectionTotalsPanel`), y que un fallo
transitorio de red en un set lo dejaba bloqueado para el resto de la sesión (`failedSets` sin
expiración). El arreglo agrega la misma precarga en lote al perfil público y reemplaza el bloqueo
permanente por un cooldown de 5 minutos para fallos transitorios; los sets genuinamente
inexistentes en MTGJSON siguen bloqueados para siempre, que es lo correcto.

## Qué cambió

- `src/services/mtgjson.ts:82-117, 496-499, 536-537, 565, 631` — `failedSets` se partió en
  `unknownSets` (Set, permanente, cuando `isKnownMtgjsonSet` dice que MTGJSON no publica ese set —
  reintentar solo regeneraría un 404) y `failedSetCooldowns` (Map de set → timestamp, TTL 5 min,
  para fallos de fetch: red, 500). Al vencer, `isSetSkippable` limpia la entrada y permite un nuevo
  intento.
- `src/views/UserProfileView.vue:97-125` — `watch(cards, ...)` llama `preloadSetMappings` (la misma
  función en lotes paralelos de 5 que ya usa `/collection`) cada vez que la lista de cartas
  cargadas cambia. Deferido 3 s (`PUBLIC_PROFILE_PRELOAD_DELAY_MS`, el mismo valor que
  `INITIAL_PRICE_FETCH_DELAY_MS` en `CollectionTotalsPanel.vue`) para no competir con el primer
  pintado.

**Por qué un TTL fijo y no reintento exponencial:** minimalismo. Es la forma más simple que resuelve
el caso de uso aprobado ("un fallo transitorio no puede quedar salteado para siempre") sin agregar
una máquina de estados de reintento que nadie pidió.

**Regla 8:** se usó `watch` (no `onMounted`) con callback **síncrono** que hace
`setTimeout(() => { void preloadSetMappings(...) }, ...)`. No hay `async onMounted` con `await` en
ningún punto del cambio — que es justo lo que rompió el perfil de usuarios anónimos en producción.

## Costo de la precarga — acotado por diseño, no medido en vivo

Declarado como tal: no se pudo ejecutar un navegador real.

- `usePublicProfileIndex` usa `DEFAULT_PAGE_SIZE = 60`: el perfil público carga de a 60 cartas,
  nunca la colección entera, a diferencia de `/collection` (hasta miles de sets — el caso que
  TASK-153 midió con 300+ descargas secuenciales).
- Peor caso por página: 60 sets distintos en lotes paralelos de 5 (`CONCURRENCY = 5`) → ~12 lotes
  secuenciales de descargas gzip pequeñas. Muy por debajo del caso de TASK-153.
- Cada `loadMore` precarga solo los sets de la página recién cargada; `preloadSetMappings` ya filtra
  internamente los sets ya cargados o fallidos, así que no hay recarga redundante entre páginas.

## Red-green, ejecutado de verdad (no razonado)

- `mtgjsonFailedSetCooldown.test.ts`: se revirtió `isSetSkippable` al trinquete viejo
  (`unknownSets.has(upper) || failedSetCooldowns.has(upper)`, sin expiración) → el test
  "recovers its price" se puso **rojo** con `expected 2 fetch calls, got 1`, por la razón correcta.
  El test de unknown-set siguió verde, correctamente (no lo toca ese defecto).
- `userProfilePricePreload.test.ts`: se borró el bloque `watch(cards, ...)` completo de
  `UserProfileView.vue` → el test "watches the loaded cards" se puso **rojo**. El test de import
  siguió verde, como se esperaba (ataca otro modo de fallo).
- Ambos restaurados con `cp` desde backup y `diff` vacío confirmado. Nunca se commiteó un estado rojo.

## Gate

- `npm run test:unit`: **199 archivos, 2497 tests, todos verdes.**
- `npx vite build`: exitoso, incluye `vue-tsc --noEmit` sin errores de tipos.
- Pre-commit: 0 errores, 129 warnings preexistentes.

## AC7 — el UAT no se puede correr como está escrito

Las 10 cartas de la regresión ya no existen en dev (re-siembra de TASK-290). Del conjunto actual se
proponen:

- **Lightning Bolt** (3 copias) — la de mayor probabilidad de tener datos MTGJSON completos.
- **Sol Ring** (1) — coincide con una de las cartas originales, buena continuidad histórica.
- **Dazzling Angel** (1) — carta menos común, útil para el caso "set con mapeo menos cacheado".

Procedimiento: abrir `/collection` (dueño) y `/@qa_mtg` (visitante) en dos sesiones, esperar los 3 s
de precarga en ambas, y comparar CK/TCG/buylist de esas 3 cartas. Deberían coincidir exactamente. Si
el mapeo de set falla la primera vez, debería recuperarse en un refresh posterior a 5 minutos —
antes del fix, nunca se recuperaba.

## Hueco nombrado por el propio developer, fuera de alcance

**No existe ningún spec E2E que hoy compare precios CK/TCG/buylist entre `/collection` y
`/@usuario`** — que es exactamente el AC2/AC3 de este ticket. El spec que se escriba después del
wargaming (nunca antes, por política) debería ser justamente esa comparación cruzada, con las 3
cartas propuestas arriba.

Único spec E2E que ejercita la vista tocada: `e2e/specs/user-profile/user-profile.spec.ts`. No
corrido (sin Playwright en esta máquina); nombrado para que el wargaming lo corra.
