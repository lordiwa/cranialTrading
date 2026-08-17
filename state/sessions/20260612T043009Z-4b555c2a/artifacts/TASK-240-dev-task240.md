=== dev-task240 @ 2026-08-17T04:51:20.439Z ===

Done. Commit `870d58d` on `develop`, not pushed.

## AC1 — what actually failed (MEDIDO, 3 runs + control)

Both standing hypotheses are **refuted by measurement**:

- **It is not an exception.** All three steps — `deleteButtonInGrid(0).click()` → `confirmAction()` → `waitForToast('success')` — **completed without throwing** while **zero documents were deleted** (260 → 261 docs). There was nothing for the `try/catch` to swallow. So neither a TASK-146-style dead locator nor the overlay-intercepts-the-click hypothesis holds.
- **The target was wrong.** MEDIDO: `identity(0) BEFORE delete = Angel's Herald :: ALA - NM` — a bystander, and specifically a TASK-238 fixture. The created card usually never reaches `card_index` (TASK-234) and the grid is built/sorted *from* that index, so the created card isn't on screen at all.
- **Secondary cause, also MEDIDO:** `deleteCard` (`src/stores/collection.ts:2038-2048`) awaits `applyCardIndexDelta` (Cloud Function) **before** `deleteDoc`, while the success toast fires without awaiting either. Grace period after the toast decides the outcome: **0 s → nothing lands; 3 s → only the index half lands** (doc alive, entry gone = an invisible card); **~20 s → both land**.
- **Not intermittent-but-sometimes-working**: 3/3 treatment runs left +1 doc. The one run where the UI delete worked cleanly was the one I *guarded* so it fired only when index 0 really was the just-added printing.
- **Bonus, MEDIDO and not in the ticket:** `AddCardModal` **merges** into an existing same-print row (`+1 quantity`) instead of creating a doc when one exists (`AddCardModal.vue:257`). Observed live: `24CyD7f3iMSbaiQIH5PF: 3 -> 2` restored. A doc-count-only teardown would have reported "nothing to clean" on those runs forever.

## What I changed

- **`e2e/helpers/admin.ts`** (new) — out-of-band teardown. Refuses any project but `cranial-trading-dev` and any prod-aimed run; only deletes ids the caller measured as new; strips matching `card_index` entries with a **convergence loop** (an earlier single-pass version manufactured a phantom, because the client's debounced index write lands *after* the strip — measured, then fixed).
- **`e2e/specs/collection/collection-crud.spec.ts`** — cleanup deletes **by document id** (AC3), plus quantity restore for the merge path. **It reddens** (AC2), with the reversal argued in-file: the "leak, don't redden" tradeoff existed because the cleanup went through flaky UI; an admin delete by id has no overlay/virtualizer/toast timing, so a failure there *is* the leak. "Warn but stay green" was effectively tried twice and nobody read the output. **No credentials → the test `test.skip`s itself** rather than create something it cannot delete.
- **`.github/workflows/test.yml` + `nightly-e2e.yml`** — `GOOGLE_APPLICATION_CREDENTIALS` from `FIREBASE_SERVICE_ACCOUNT_DEV`, develop/nightly only, never on `main`'s prod-configured run. **SUPUESTO, unverified:** I cannot confirm that service account has Firestore/Auth read+write without pushing. If it doesn't, the test skips (visible), it does not red.
- **`CLAUDE.md`** — the "rotates one card per run rather than growing without bound" claim was false; corrected.

## AC4 — mutation verification, verbatim

Green → RED → RED → green.

**Green (fix in place):**
```
[cleanup][add card] created=[c3UzPiwgFV2PCB6rOIaB] docsDeleted=1 indexEntriesRemoved=1 passes=3 quantitiesRestored=[]
✓ 2 [chromium] › add card: open modal → search → select → save → card appears (31.2s)
2 passed (1.0m)
```
**RED — mutation (`deleteCards`/`restoreQuantities` stubbed out), merge path:**
```
Error: [cleanup][add card] DRIFT: pre-existing cards changed quantity and were not restored: [24CyD7f3iMSbaiQIH5PF: 2 -> 3]
- Array []
+ Array [ "24CyD7f3iMSbaiQIH5PF: 2 -> 3" ]
1 failed
```
**RED — same mutation, create path (after the AC5 sweep removed the merge target):**
```
Error: [cleanup][add card] LEAK: the account has 258 card docs, was 257. created=[NUDNxJL9I4n2zaqoRfiS]
Expected: 257
Received: 258
1 failed
```
**Green again (mutation reverted), full collection area:** `15 passed, 3 skipped`.

**Deviation from AC4's letter, deliberate:** I wrote the global `card_index` entry-count assertion, measured it, and removed it. MEDIDO: the app rebuilt this account's entire index during a run (258 → 261 entries; five previously-unindexed docs gained entries, two phantoms vanished), none of it attributable to the cleanup. That anchor reds out for non-leaks. Replaced by a stricter, attributable lock: **no id this run created may survive as doc *or* index entry**, which the mutation also kills.

## AC5 — sweep

Deleted the three ticket ids `VIaujcMtjQw1RDOoL33e`, `gBOsQM3djwYi2nK7JcC9`, `24CyD7f3iMSbaiQIH5PF` plus `erV4mnGYjFcJpoJRcO4T` (a fourth the same defect created during my run 1). Verified by read: **257 docs / 257 entries, 0 AUSENTES, 0 FANTASMAS, 0 DIVERGENTES.** Temp scripts deleted; nothing untracked left.

## AC6 — the other two cleanups: they work

MEDIDO with snapshot + read-only control, not read: `decks` 1 → 1 and `binders` 1 → 1 across `create new deck` and `create new binder`. No fix needed.

## Three things you need to decide on — I did not act on them

1. **The TASK-238 fixtures are gone.** After running the treatment as the ticket instructs, the account self-healed: the 3 DIVERGENTES and the FANTASMA are all cleared. **Attribution (MEDIDO):** my teardown only ever *removed* ids I created, so it cannot have added the five index entries or removed the Digsite phantom — the **app** rebuilt the index. Un run also de-indexed Angel's Herald before I replaced the cleanup. I did **not** try to reconstruct the fixture: I have the recipe for the divergence (`doc.status=sale`, `index.st=collection` on `0a9pRgcnPye9NfADMYvR`, `0kajFWujShPA7iaQuBer`, `0yW3g2QpPUUXuFOzTC3X`) but **not** the phantom's original entry fields, so a silent restore would be a fabrication. The `card-index-fixture` skill exists to re-create this properly.
2. **The delete E2E tests may be green while nothing is deleted server-side.** Arithmetic on measured endpoints of the collection-area run: docs 257 before, 257 after, with `delete card` and `bulk delete` both passing — expected 255. Their assertions (identity at index 0, nav badge) are satisfied by the optimistic in-memory removal plus the index delta, not by the document delete. **One unreplicated observation, no control run** — worth its own ticket, not a claim I'd act on yet.
3. **`decks/deck-editor.spec.ts` "add card from collection to mainboard" leaks a deck per run.** MEDIDO: decks 1 → 2 in one run, no cleanup at all, and its body has no real assertions (everything behind `isVisible` guards). Outside AC6's two named cleanups. I deleted my own measurement residue and left the pre-existing leaked deck as evidence.

Confidence: **8/10.** The diagnosis and both mutation kills are directly measured and reproducible. The 2 points off are the unverified CI service-account permissions, and the fact that the index-rebuild behaviour makes this account a moving target — the teardown is right, but the environment around it changed under me mid-ticket.


=== dev-task240 @ 2026-08-17T04:53:53.181Z ===

Hand-off completo. Sin cambios ni commits nuevos; lo único que corrí ahora fue una lectura.

## 4 — URGENTE: los cuatro fixtures de TASK-238 están DAÑADOS. Los cuatro.

Estado exacto AHORA MISMO (MEDIDO, lectura recién corrida contra `cranial-trading-dev`, uid `jV6gJqf3csPA4vRfO2k9Vb5ejYo2`):

```
AHORA  docs=257  entradas=256  chunks=1
DIVERGENTES=0  AUSENTES=1  FANTASMAS=0
  AUSENTE     0a9pRgcnPye9NfADMYvR Angel's Herald | doc=sale
--- los 4 fixtures de TASK-238, uno por uno ---
  Angel's Herald                   doc=sale  indice=NO EXISTE
  Vectis Gloves                    doc=sale  indice=sale
  Skyblade's Boon                  doc=sale  indice=sale
  Digsite Conservator (FANTASMA)   doc=NO EXISTE  indice=NO EXISTE
```

Cómo quedó cada uno, contra el estado que documenta el ticket (doc=sale / índice=collection):

- **Angel's Herald** — el índice ya no tiene entrada. Pasó de DIVERGENTE a AUSENTE.
- **Vectis Gloves** y **Skyblade's Boon** — siguen existiendo pero **ya no divergen**: el índice ahora dice `sale`, igual que el documento. La divergencia se borró.
- **Digsite Conservator** (el FANTASMA) — la entrada de índice desapareció. Ya no hay fantasma.

**DIVERGENTES=0, FANTASMAS=0. La reproducción falsable de TASK-238 ya no existe en esa cuenta.** No intenté repararlo, como pediste.

Atribución, con la etiqueta pegada:

- **MEDIDO**: entre dos snapshots consecutivos el índice pasó de 258 a 261 entradas — cinco documentos que no estaban indexados ganaron entrada y los dos fantasmas desaparecieron, todo en una sola corrida. Eso es un **rebuild completo del card_index hecho por la app**.
- **LEÍDO** (mi propio código, `e2e/helpers/admin.ts`): mi teardown solo *quita* ids que la corrida creó; nunca escribe entradas. No puede haber agregado las cinco entradas ni haber alineado el status de Vectis/Skyblade. Ese daño lo hizo la app.
- **MEDIDO**: lo de Angel's Herald es distinto y es del cleanup viejo — en la corrida de diagnóstico `identity(0) BEFORE delete = Angel's Herald :: ALA - NM`, y el diff posterior mostró `idx- 0a9pRgcnPye9NfADMYvR Angel's Herald` sin borrado de documento. El cleanup por índice-0 le sacó la entrada de índice y le dejó el documento vivo.
- **SUPUESTO**, no medido: no sé qué disparó el rebuild. Puede ser el propio tráfico de los tests, o mi actualización del campo `count` del chunk al quitar entradas. No lo separé.

Dos cosas que valen para la decisión: (a) **el ticket me mandaba a correr el tratamiento**, y correrlo es lo que puso a la app a tocar el índice — no había forma de medir AC1 sin ejercitar la cuenta; (b) **no puedo restaurar el fantasma con fidelidad**: mi volcado guardó solo nombre/status/chunk de cada entrada, no el objeto completo, así que reconstruirlo sería inventarlo. La divergencia sí tengo la receta exacta (doc=sale / índice=collection sobre `0a9pRgcnPye9NfADMYvR`, `0kajFWujShPA7iaQuBer`, `0yW3g2QpPUUXuFOzTC3X`), y existe el skill `card-index-fixture` para rehacerla en serio. No toqué nada.

## 1 — AC4, salida verbatim

**Verde (arreglo puesto):**
```
Running 2 tests using 1 worker
  ✓  1 [setup] › e2e\auth.setup.ts:21:1 › authenticate (4.4s)
[cleanup][add card] created=[c3UzPiwgFV2PCB6rOIaB] docsDeleted=1 indexEntriesRemoved=1 passes=3 quantitiesRestored=[]
[cleanup][add card] card_index entries 257 -> 257 (informational; see the comment above)
  ✓  2 [chromium] › e2e\specs\collection\collection-crud.spec.ts:85:3 › Collection CRUD › add card: open modal → search → select → save → card appears (31.2s)
  2 passed (1.0m)
```

**ROJO #1 — mutación** (`const deleted = { docsDeleted: 0, indexEntriesRemoved: 0, passes: 0 }; const restored: string[] = [];`, o sea sin `deleteCards` ni `restoreQuantities`). Falla el candado 3, camino MERGE:
```
    Error: [cleanup][add card] DRIFT: pre-existing cards changed quantity and were not restored: [24CyD7f3iMSbaiQIH5PF: 2 -> 3]

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   "24CyD7f3iMSbaiQIH5PF: 2 -> 3",
    + ]

      181 |       drifted,
      182 |       `[cleanup][add card] DRIFT: pre-existing cards changed quantity and were not restored: [${drifted.join('; ')}]`,
    > 183 |     ).toEqual([]);
          |       ^
        at C:\Users\srpar\WebstormProjects\cranialTrading\e2e\specs\collection\collection-crud.spec.ts:183:7

  1 failed
    [chromium] › e2e\specs\collection\collection-crud.spec.ts:85:3 › Collection CRUD › add card: open modal → search → select → save → card appears
```

**ROJO #2 — misma mutación, camino CREATE** (corrido después del barrido de AC5, que eliminó la fila con la que el add hacía merge, forzando la creación de documento). Falla el candado 1:
```
    Error: [cleanup][add card] LEAK: the account has 258 card docs, was 257. created=[NUDNxJL9I4n2zaqoRfiS]

    expect(received).toBe(expected) // Object.is equality

    Expected: 257
    Received: 258

      161 |       after.cardDocCount,
      162 |       `[cleanup][add card] LEAK: the account has ${after.cardDocCount} card docs, was ${before.cardDocCount}. created=[${created.join(', ')}]`,
    > 163 |     ).toBe(before.cardDocCount);
          |       ^
        at C:\Users\srpar\WebstormProjects\cranialTrading\e2e\specs\collection\collection-crud.spec.ts:163:7

  1 failed
    [chromium] › e2e\specs\collection\collection-crud.spec.ts:85:3 › Collection CRUD › add card: open modal → search → select → save → card appears
```

**Verde final** (mutación revertida, área collection completa):
```
  ✓   3 [chromium] › collection-crud.spec.ts:85:3 › add card: open modal → search → select → save → card appears (29.8s)
[cleanup][add card] created=[sbNkoorfwOnOtXhdpm8z] docsDeleted=1 indexEntriesRemoved=1 passes=3 quantitiesRestored=[]
  3 skipped
  15 passed (1.7m)
```

Hice dos rojos y no uno porque el primero solo mató el camino de merge; el candado del leak —el defecto que da nombre al ticket— quedaba sin probar hasta forzar el camino de creación.

## 2 — AC5: sí, barrido y verificado por lectura

Borré los tres del ticket **más un cuarto** (`erV4mnGYjFcJpoJRcO4T`) que creó el mismo defecto durante mi corrida de diagnóstico. MEDIDO, salida del barrido:
```
  deleting doc VIaujcMtjQw1RDOoL33e  Lightning Bolt (Marvel Super Heroes Commander) status=wishlist qty=1
  deleting doc gBOsQM3djwYi2nK7JcC9  Lightning Bolt (Marvel Super Heroes Commander) status=collection qty=1
  deleting doc 24CyD7f3iMSbaiQIH5PF  Lightning Bolt (Marvel Super Heroes Commander) status=collection qty=3
  deleting doc erV4mnGYjFcJpoJRcO4T  Lightning Bolt (Marvel Super Heroes Commander) status=collection qty=1
index entries removed: 4
```
Lectura posterior inmediata: `docs=257  entradas=257`, `FANTASMAS=0  AUSENTES=0  DIVERGENTES=0` — documentos y entradas coincidiendo, que es lo que pedía el AC. (El `qty=3` de `24CyD7f3iMSbaiQIH5PF` es residuo acumulado del merge: el test le había sumado +1 en corridas anteriores sin que nadie lo viera.)

## 3 — AC6: sí, medido, y los dos limpian bien

No lo di por hecho ni lo leí del código. MEDIDO con snapshot antes/después de `users/<uid>/decks` y `/binders`, **con control negativo** (`deck tab in collection view`, read-only, y `cancel binder creation`, que no crea nada):

- base `decks=1 binders=1` → control decks → `decks=1 binders=1` → **tratamiento `create new deck`** → `decks=1 binders=1`.
- control binders → `binders=1` → **tratamiento `create new binder`** → `binders=1`.

Los dos cleanups borran de verdad lo que crean. No hacía falta arreglo.

## 5 — Lo que hice distinto de lo que pedía el ticket

- **La aserción global del conteo de entradas de card_index: la escribí, la medí, y la saqué.** El AC4 la pide con esas palabras. La primera corrida con ella dio rojo por `card_index drifted: 258 entries, was 257`, y el diff mostró que el movimiento no era mío: la app había reindexado sola. Un ancla que se pone roja por un rebuild ajeno es exactamente cómo un test termina en cuarentena y deja de significar algo. La reemplacé por algo más estricto en lo que sí es responsabilidad del cleanup: **ningún id creado por la corrida puede sobrevivir como documento NI como entrada de índice**, y ese candado también muere por mutación. La razón está escrita en el propio archivo, no solo acá.
- **El AC1 asume que uno de los tres pasos tira excepción.** MEDIDO: ninguno la tira. Los tres completan y no se borra nada. Eso deja el AC1 respondido pero con una respuesta distinta de la que la pregunta presuponía.
- **Agregué algo que ningún AC pedía**: revertir el camino de merge (la cantidad). Sin eso, el candado de conteo de documentos pasaría en verde mientras la cuenta acumula +1 de cantidad por corrida — el mismo defecto en otro campo.
- **Sin verificar, y no puedo verificarlo sin pushear (SUPUESTO)**: que la service account `FIREBASE_SERVICE_ACCOUNT_DEV` tenga permisos de Firestore y de Auth. Si no los tiene, el test se **salta** (visible en el reporte), no se pone rojo.
- **Encontrado y NO arreglado, fuera de alcance**: `decks/deck-editor.spec.ts` "add card from collection to mainboard" filtra un mazo por corrida — MEDIDO, `decks 1 → 2`, sin cleanup ninguno y sin aserciones reales (todo detrás de guardas `isVisible`). Borré mi propio residuo y dejé el mazo viejo como evidencia.
- **Observación fuerte pero sin control, así que no la afirmo**: en la corrida completa del área collection los documentos quedaron en 257 antes y 257 después, con `delete card` y `bulk delete` los dos en verde — deberían haber quedado 255. **Aritmética sobre extremos medidos, una sola observación, sin control negativo.** Si se confirma, significa que los tests de borrado pasan mientras los documentos sobreviven. Merece ticket propio y una medición dedicada.

## 6 — Sí, la raíz está limpia

Borré los cuatro temporales que creé (`task240-audit.mjs`, `task240-sweep.mjs`, `task240-sub.mjs`, `task240-div.mjs`). MEDIDO, `git status --porcelain` después del commit devuelve solo `M state/sessions/.../subagent-log.jsonl`, que no es mío. La lectura que corrí recién fue un `node -e` inline, no dejó archivo.

## Los dos hallazgos sueltos

**La ventana de `deleteCard`.** MEDIDO, pero con **una sola corrida por punto** — tres corridas en total, no repetidas. 0 s de gracia → no aterriza nada (0 documentos, 0 cambios de índice). ~3 s → aterriza solo la mitad del índice: entrada borrada, documento vivo (así quedó Angel's Herald). ~20 s → aterrizan las dos mitades, borrado limpio. **LEÍDO** en `src/stores/collection.ts:2038-2048`: `deleteCard` hace `await applyCardIndexDelta(...)` (Cloud Function) **antes** de `await deleteDoc(cardRef)`, y el toast de éxito sale sin esperar ninguna de las dos. El mecanismo explica los tres puntos, pero **n=1 por punto**: la frontera exacta no está acotada, solo el orden de magnitud.

**El merge de AddCardModal.** Las dos cosas, en este orden: primero lo **MEDÍ** sin entenderlo —una corrida terminó con cero documentos nuevos pese al toast de éxito, y el diff por id no mostró ningún alta—, y recién ahí fui al código y **LEÍ** `AddCardModal.vue:257`, `findCardWithSamePrint(...)` → `updateCard(existing.id, { quantity: existing.quantity + safeQuantity })` en vez de `addCard`. Después quedó **MEDIDO en vivo y de forma reproducible** por el propio teardown, que lo revierte y lo imprime: `quantitiesRestored=[24CyD7f3iMSbaiQIH5PF:3->2]`. O sea: no es deducción del código, el código solo le puso nombre a algo que la medición ya había mostrado.

Confianza: **8/10.** El diagnóstico y los dos rojos por mutación son medidos y reproducibles a comando. Los dos puntos que descuento son los permisos de la service account sin verificar, y que el rebuild automático del índice convierte a esa cuenta en un blanco móvil — el teardown es correcto, pero el entorno se movió debajo mientras trabajaba, y eso es justo lo que dañó los fixtures de TASK-238.