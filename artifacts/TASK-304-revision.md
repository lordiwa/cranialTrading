# TASK-304 — revisión en contexto fresco del commit `74ab908`

> **Por qué está acá y no en el ticket:** `appendComment` sigue bloqueado por el comentario
> inválido de schema preexistente en `tasks/TASK-304.json`. Ver
> `artifacts/COMENTARIOS-INVALIDOS-2026-09-20.md`.

## Veredicto: PASS — pusheable a `develop` tal cual

Con tres condiciones que son del lado del Orquestador, no del developer (ver el final).

## Verificación (corrida por el reviewer, no aceptada del hand-off)

- Targeted: `mtgjsonFailedSetCooldown.test.ts` (2), `userProfilePricePreload.test.ts` (2),
  `mtgjson.dedup.test.ts` (TASK-174, intacto), `userProfilePrivacy.test.ts` (6) — todos verdes.
- Suite completa: **202 archivos / 2502 tests verdes**.
- `npm run type-check` limpio — y esto importa: verifica que el `.vue` compila, cosa que ningún
  unit test hace, porque nadie monta la vista.
- Árbol limpio: ninguno de los 4 archivos del commit modificado, cero `*.bak`/`*.orig`/`*.rej`/`*~`
  en todo el árbol. La restauración por `cp` del red-green no dejó restos.

## El test estructural — la sospecha era correcta, con dos matices

**`tests/unit/views/userProfilePricePreload.test.ts` es pattern-matching sobre el texto fuente.**
Lee el archivo con `readFileSync`, le pela los comentarios y hace regex buscando que exista
`preloadSetMappings`, el import, y un bloque `watch(cards, ...)` que contenga `preloadSetMappings(`
y `setTimeout(`.

**Matiz 1 — no es un invento del developer.** Es un patrón establecido y documentado en este repo
para este archivo exacto: `tests/unit/views/userProfilePrivacy.test.ts` (TASK-247/136) usa la misma
técnica, con un header que la justifica como "la mitad barata" de un AC cuya mitad cara es un
procedimiento manual. El test nuevo cita ese precedente honestamente.

**Matiz 2 — pero el precedente no lo cubre.** El lock de privacidad es **negativo** (prohíbe que
reaparezca un string, robusto por construcción). Este es **positivo y estructural**, y eso lo hace
débil en las dos direcciones:

- **Falso verde, verificado por el reviewer:** invertir el guard de `UserProfileView.vue:121`
  (`if (list.length === 0) return` → `!== 0`) hace que la precarga no corra nunca para listas no
  vacías, la divergencia del ticket vuelve entera, y **los dos tests siguen verdes**. Lo mismo
  poniendo `PUBLIC_PROFILE_PRELOAD_DELAY_MS = 3000000`.
- **Falso rojo:** extraer el bloque a un composable —refactor que preserva comportamiento— lo
  pone en rojo.

**Y el argumento del header está sobredimensionado.** Dice que un test de comportamiento exigiría
montar toda la vista. No hace falta: extraer el cableado a un composable de ~10 líneas
(`usePublicProfilePreload(cards)`) y testearlo con un `ref` pelado + `vi.useFakeTimers` + un mock de
`preloadSetMappings` afirma el comportamiento real (dispara tras 3 s, dedupea set codes, no dispara
con lista vacía). Ese es el fix sugerido.

**Severidad: MEDIUM, no más** — porque la otra mitad del fix, la del servicio, sí tiene un test de
comportamiento genuino, y es la mitad que carga el peso.

## Lo que sí está bien: `mtgjsonFailedSetCooldown.test.ts`

Comportamiento de verdad, **en el call site** (`getCardPrices`), no en el helper: mockea `fetch`,
hace fallar el primer intento del set, avanza el reloj 5 min + 1 ms, y afirma que el segundo
`getCardPrices` **reintenta** (llamadas a `ZZZ.json.gz`: 1 → 2) y **recupera el precio**
(`second?.cardKingdom?.retail === 4.5`). El segundo test afirma que un set genuinamente inexistente
nunca se reintenta, ni tras una hora.

## Respuestas a lo que se preguntó

- **TTL de 5 min: bien elegido, sin tormenta posible.** El cooldown se rearma en cada fallo
  (`mtgjson.ts:571`), así que el peor caso es **1 fetch por set cada 5 minutos**, y el dedupe en
  vuelo (`setMappingLoadPromises`) absorbe la concurrencia. Para E2E/nightly es irrelevante: el
  estado es de módulo por page-load y ningún spec vive 5 minutos en la misma página.
- **Regla 8: cumplida, verificada literalmente.** `UserProfileView.vue:120-125`, `watch` con
  callback síncrono y `setTimeout(() => { void preloadSetMappings(...) }, 3000)`. Ningún `await`
  nuevo en camino de montaje; el `onMounted` existente no se tocó.
- **El `60` y `loadMore`: confirmados.** `usePublicProfileIndex.ts:58` y `:157`. `cards.value` se
  **reemplaza** (`:309`, `:348`), así que el watch superficial dispara. **Ojo:** el watch recibe la
  lista acumulada **completa** en cada `loadMore` y pasa todos los set codes — la no-redundancia la
  garantiza `preloadSetMappings` internamente, no el watch (ver L-2). Los `setCode` vacíos (35,8 %
  en prod) se filtran con `.filter(Boolean)` y ambas vistas caen igual al fallback de Scryfall:
  paridad preservada.
- **Reglas 1 y 2 — consumidores de `mtgjson.ts`:** `failedSets` era `const` privado de módulo sin
  ningún otro consumidor. El cambio es estrictamente "más reintentos acotados"; nadie dependía del
  trinquete. Y un punto que podía dejar el fix **muerto en runtime**, verificado a propósito:
  `useCardPrices` solo cachea resultados no-null, así que el retry post-cooldown no queda anulado
  por un `null` cacheado. El dedupe de TASK-174 quedó intacto.

## Findings

**HIGH:** ninguno.

**MEDIUM**
- **M-1** — `userProfilePricePreload.test.ts:26-49`: lock estructural sobre texto fuente (arriba).
- **M-2** — **AC5 y AC6, como están escritos, NO se cumplen.** Ningún test —nuevo ni viejo— compara
  las tres lecturas ni los precios entre las dos vistas. Los tests nuevos prueban los **mecanismos**
  (cooldown, presencia del watch), nunca la **postcondición** AC2/AC3. La sustitución está medida y
  documentada, y tiene respaldo: el AC1 mató la premisa del AC5 (no hay tres lecturas de precio CK
  en Firestore que comparar). Pero **hoy la postcondición no tiene verificación automatizada en
  ningún lado**, y ni la reinterpretación del AC5 ni la sustitución de cartas del AC7 tienen el
  visto de Mato. **Bloquea el CIERRE del ticket, no el push.**
- **M-3** — el hand-off no declara outcome por ítem del checklist pre-hand-off de cinco puntos.
  Sin contradicción con el diff en ninguno de los cinco.

**LOW**
- **L-1** — el test "imports preloadSetMappings" es redundante con el segundo.
- **L-2** — el hand-off dice "cada `loadMore` precarga solo los sets de la página recién cargada";
  es impreciso. El watch pasa la lista acumulada entera y la dedupe vive dentro de
  `preloadSetMappings`. Efecto equivalente, modelo mental escrito incorrecto.
- **L-3** — `tests/unit/services/mtgjson.dedup.test.ts:185` tiene un comentario obsoleto que aún
  nombra `failedSets.add`. Cosmético, fuera del diff.

## Lista E2E ampliada por el reviewer — importa para el wargaming

El developer nombró solo `e2e/specs/user-profile/user-profile.spec.ts`. **Insuficiente:**
`mtgjson.ts` también sirve el camino de precios de `/collection`, así que el wargaming debe correr
**`e2e/specs/user-profile/` + `e2e/specs/collection/`**, y sobre todo la regresión externa
`qa-agents/.../wg4-o2-03-paridad-de-precios-dueno-vs-publico.spec.ts`, hoy en **ROJO** contra dev.
**Que pase de rojo a verde tras el deploy es la verificación de registro real de este ticket.**

## Las tres condiciones del lado del Orquestador

1. El ticket **no se cierra** hasta que Mato apruebe el re-alcance de AC5/AC7 y se destrabe el
   registro (M-2).
2. El wargaming corre la lista E2E ampliada, con el spec de qa-agents pasando de rojo a verde.
3. M-1 merece la extracción a composable, en esta tanda o la siguiente: es barata y convierte un
   lock de papel en una prueba real.
