---
name: card-index-fixture
description: Pone, quita, mide y repara la divergencia de card_index en una cuenta. Usar cuando haya que reproducir TASK-208 (el indice dice una cosa y los documentos otra), auditar si una cuenta esta divergente, o reparar un indice sucio antes de correr E2E.
---

# card-index-fixture

Herramienta para trabajar con la divergencia de `card_index`: el estado en que la
grilla muestra un inventario que no coincide con los documentos reales.

Todo pasa por `scripts/card-index-fixture.mjs`.

## Antes de nada

```bash
gcloud auth application-default login
```

La cuenta objetivo sale de `TEST_USER_A_EMAIL` (`.env.local`) salvo que pases
`--uid=<uid>`. El proyecto sale de `VITE_FIREBASE_PROJECT_ID`
(`.env.development`) o de `FIREBASE_PROJECT`.

## Los cuatro modos

### `--status` — medir (solo lectura, siempre seguro)

```bash
node scripts/card-index-fixture.mjs --status
```

**La lectura NO es atomica**: los documentos se paginan en decenas de segundos
mientras el indice se lee en un solo `get()`, y arrancan casi a la vez pero no
en el mismo instante exacto. Actividad de la app o de E2E en esa ventana (o en
los ~2 minutos previos, por el lag de TASK-176) puede aparecer como
divergencia que no es real. Ante `VEREDICTO: DIVERGENTE`, **re-correr antes de
concluir** — el propio script lo recuerda en su salida.

Compara documento por documento contra el indice y reporta tres cosas
**distintas**, que no hay que confundir:

- **estado distinto** — la carta existe en los dos lados con estados que no
  coinciden. Es la firma de TASK-208.
- **solo en documentos** — la carta existe y el indice no la muestra. El usuario
  no la ve. Familia TASK-168.
- **solo en indice** — FANTASMA: se ve en la grilla y el documento no existe.
  Familia TASK-176. Ojo: un fantasma se abre y se ve perfecto, porque
  `getFullCard` cae en silencio a los datos del indice. No sirve para
  diagnosticar.

Tambien avisa de chunks faltantes (la firma de TASK-168) y de ids duplicados
entre chunks. Un chunk con sufijo no numerico (`chunk_x`) es corrupcion
estructural, no divergencia de datos: se excluye de la comparacion y por si
solo fuerza `VEREDICTO: DIVERGENTE` con codigo 1, aunque el resto coincida —
el resultado de esa corrida es incompleto, no "limpio". Sale con codigo 0
solo si el indice coincide Y no hay chunks invalidos, 1 en cualquier otro caso.

### `--break` — provocar la divergencia

```bash
node scripts/card-index-fixture.mjs --break --count=58 --from=sale --to=trade \
                                    --colors=W --rarity=mythic --min-price=10
```

Marca hasta `--count` cartas con otro estado **en el indice**, sin tocar los
documentos. Filtros disponibles: `--from`, `--colors` (una letra: W U B R G),
`--rarity` (mythic, rare, uncommon, common), `--min-price`.

Guarda el estado previo en `.card-index-fixture.json` (gitignoreado) **antes**
de escribir, y se niega a correr si ya hay un fixture puesto sin restaurar.

**LO QUE ESTO REPRODUCE Y LO QUE NO.** Reproduce el ESTADO, no la CAUSA. El
camino real por el que la app llega ahi es una accion masiva que se agota a
mitad (TASK-206) sobre un motor que devuelve `ok: true` igual (TASK-207).
Sirve de fixture para probar deteccion, convergencia y reparacion. **No sirve
como evidencia de que la causa exista** — para eso hay que ejercitar el bulk.

### `--restore` — deshacer el fixture

```bash
node scripts/card-index-fixture.mjs --restore
```

Devuelve al indice los estados guardados y borra el archivo de estado — **si no
hay drift**. Cuenta como drift tanto una carta que ya no tiene el estado que
puso `--break` (algo mas la cambio, posiblemente legitimo) como una carta del
fixture que ya no esta en el indice — las dos son "algo mas la toco" y se
tratan igual. Ante cualquiera de las dos, **aborta ANTES de escribir**, no
borra `.card-index-fixture.json`, y exige `--force` para continuar igual:

```bash
node scripts/card-index-fixture.mjs --restore --force
```

Con `--force`, o si no habia drift, escribe y borra el fixture. A partir de
ahi ya no hay vuelta atras para las cartas con drift pisadas — el fixture solo
describia el estado previo a `--break`, no el intermedio. La unica salida
despues de eso es `--repair` (reconstruir desde los documentos, no deshacer).

### `--repair` — reconstruir el indice

```bash
node scripts/card-index-fixture.mjs --repair
```

Invoca la Cloud Function `buildCardIndex` **desplegada**, la misma que llama la
app. Tarda ~80-115 s en la cuenta de 59k (medido en corridas reales, no un
numero fijo). Es a proposito que no recalcule el indice
localmente: duplicar la codificacion de `toIndexCard` haria que un cambio en
`functions/index.js` dejara este script "reparando" a un formato viejo.

Usa `--repair` (no `--restore`) cuando el indice quedo sucio por cualquier via
que no sea este script.

## Reglas de uso

1. **`--status` antes y despues de todo.** Es la unica forma de saber que paso.
   Y no es un veredicto de una sola corrida: ante divergencia, re-correr antes
   de concluir (ver la nota de no-atomicidad arriba).
2. **Capturar los ids antes de reparar.** `--repair` borra la evidencia; los
   fantasmas e invisibles que reporta `--status` son irrecuperables despues.
3. **Nunca correr `--break`, `--restore` o `--repair` con E2E corriendo.** La
   cuenta de `TEST_USER_A` es la del CI. Los tres hacen read-modify-write sin
   transaccion sobre los mismos 30 chunks que un rebuild real puede estar
   reescribiendo a mitad de camino — no es un riesgo exclusivo de `--repair`.
   Un rebuild a mitad de una corrida ensucia los resultados y ya causo una
   falsa atribucion antes (TASK-168).
4. **Un rojo raro de E2E sobre estados sale/trade: correr `--status` ANTES de
   diagnosticar.**

## Contexto

- `TASK-208` — la divergencia de estado que no converge. **Ojo: medido el
  2026-08-11, la divergencia de 58 cartas que documenta el ticket ya no estaba.
  No se pudo determinar si convergio sola o si un rebuild la limpio.**
- `TASK-206` / `TASK-207` — la causa: el bulk que se aplica a medias en silencio.
- `TASK-176` — el lag del indice (10-58 s) que si converge. No confundir.
- `TASK-168` — la perdida de chunks y el orden lexicografico.
