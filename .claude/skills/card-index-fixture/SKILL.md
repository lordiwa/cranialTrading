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
entre chunks. Sale con codigo 0 si el indice coincide, 1 si diverge.

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

Devuelve al indice los estados guardados y borra el archivo de estado. Avisa si
alguna carta ya no tenia el estado que puso `--break` (algo mas la cambio) o si
desaparecio del indice. No pisa en silencio.

### `--repair` — reconstruir el indice

```bash
node scripts/card-index-fixture.mjs --repair
```

Invoca la Cloud Function `buildCardIndex` **desplegada**, la misma que llama la
app. Tarda ~80 s en la cuenta de 59k. Es a proposito que no recalcule el indice
localmente: duplicar la codificacion de `toIndexCard` haria que un cambio en
`functions/index.js` dejara este script "reparando" a un formato viejo.

Usa `--repair` (no `--restore`) cuando el indice quedo sucio por cualquier via
que no sea este script.

## Reglas de uso

1. **`--status` antes y despues de todo.** Es la unica forma de saber que paso.
2. **Capturar los ids antes de reparar.** `--repair` borra la evidencia; los
   fantasmas e invisibles que reporta `--status` son irrecuperables despues.
3. **Nunca reparar con E2E corriendo.** La cuenta de `TEST_USER_A` es la del CI.
   Un rebuild a mitad de una corrida ensucia los resultados y ya causo una falsa
   atribucion antes (TASK-168).
4. **Un rojo raro de E2E sobre estados sale/trade: correr `--status` ANTES de
   diagnosticar.**

## Contexto

- `TASK-208` — la divergencia de estado que no converge. **Ojo: medido el
  2026-08-11, la divergencia de 58 cartas que documenta el ticket ya no estaba.
  No se pudo determinar si convergio sola o si un rebuild la limpio.**
- `TASK-206` / `TASK-207` — la causa: el bulk que se aplica a medias en silencio.
- `TASK-176` — el lag del indice (10-58 s) que si converge. No confundir.
- `TASK-168` — la perdida de chunks y el orden lexicografico.
