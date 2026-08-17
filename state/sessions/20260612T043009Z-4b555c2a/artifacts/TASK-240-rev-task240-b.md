=== rev-task240-b @ 2026-08-17T05:17:49.918Z ===

Cleanup done — account back to its pre-review state (257 docs, no phantoms), scratch scripts removed, spec reverted to the committed content. Here is the review.

---

# REVIEW TASK-240 — commit 870d58d — **APROBADO** (sin HIGH; 4 MEDIUM como seguimiento)

## Los tres huecos prioritarios

### 1. AC4 / mutación — **VERIFICADO POR MÍ (MEDIDO)**

Corrí el spec sin tocar nada, luego con el teardown roto a propósito, luego revertí.

Base (verde, y borró de verdad):
```
[cleanup][add card] created=[UkQUXagI2dbuyorTOdYg] docsDeleted=1 indexEntriesRemoved=1 passes=3 quantitiesRestored=[]
[cleanup][add card] card_index entries 257 -> 256 (informational; ...)
  ✓  2 [chromium] › collection-crud.spec.ts:85:3 › add card ... (30.2s)
  2 passed (1.0m)
```

Mutación aplicada — `deleteCards(created)` → `deleteCards([])`:
```
[cleanup][add card] created=[yhfDtDsiKzYbq8EhqmH9] docsDeleted=0 indexEntriesRemoved=0 passes=0 quantitiesRestored=[]
  ✘  2 [chromium] › collection-crud.spec.ts:85:3 › add card ... (16.7s)

  1) ... Error: [cleanup][add card] LEAK: the account has 258 card docs, was 257. created=[yhfDtDsiKzYbq8EhqmH9]
     Expected: 257
     Received: 258
        at collection-crud.spec.ts:163:7
  1 failed
```
Rojo **por la razón correcta**: la aserción del candado 1 (`collection-crud.spec.ts:163`), con el mensaje de LEAK y el id concreto — no un import roto, no un timeout. AC4 cumplido para el candado de fuga.

Matiz: el candado 2 (`leftovers`, línea ~172) y el candado 3 (drift de cantidad) **no** los maté por mutación — el candado 1 lanza antes que el 2, y el camino MERGE (que es lo único que ejercita el 3) no se dispara mientras el doc creado se borre cada corrida. Van a la lista de NO VERIFICADO.

Limpié el doc que dejó mi mutación (`yhfDtDsiKzYbq8EhqmH9`, Lightning Bolt / Marvel Super Heroes Commander) y su entrada de índice, por id. Cuenta de vuelta en 257/256 → y ahora 257/257 (ver punto 2).

### 2. ¿El candado es vacuo? — **NO, y la razón para quitar el conteo global se sostiene (MEDIDO, por accidente)**

La justificación del commit para borrar la aserción global de entradas de `card_index` ("la app reconstruyó el índice sola, 258 → 261") no es laundering: **la reproduje sin querer**. Entre mi primer audit y el último, sin agregar ninguna carta, la cuenta pasó de `indexEntries 256, ABSENT 1` a `indexEntries 257, ABSENT 0` — la app re-indexó sola el doc `0a9pRgcnPye9NfADMYvR` (Angel's Herald). Un candado sobre el conteo global habría rojeado por eso, sin fuga alguna. Retirarlo fue correcto.

Lo que queda midiendo el candado sin él, y es suficiente para el defecto del ticket: conteo de documentos antes/después (probado falsable), ninguna id creada sobreviviendo como doc **ni** como entrada de índice, y cero drift de cantidad en documentos preexistentes. Todo leído directo de Firestore, nunca de la UI — no lo puede satisfacer un parche optimista ni un toast falso.

Lo que sí perdió, y nadie lo dice: entradas de índice **huérfanas ajenas** creadas durante la corrida quedan fuera de cobertura. Alcance angosto, aceptable.

### 3. AC5 — **VERIFICADO (MEDIDO, lectura directa)**

```
AC5 VIaujcMtjQw1RDOoL33e: doc=gone indexEntry=false
AC5 gBOsQM3djwYi2nK7JcC9: doc=gone indexEntry=false
AC5 24CyD7f3iMSbaiQIH5PF: doc=gone indexEntry=false
Lightning Bolt docs: 0
```
Los tres huérfanos están barridos, doc e índice, y no quedó ningún Lightning Bolt en la cuenta. Confirmado por lectura propia, no por el mensaje del commit.

### 3b. ¿El código nuevo borró un bystander? — **NO puede haberlo hecho (LEÍDO, con base MEDIDA)**

Estado de los fixtures de TASK-238 hoy: el fantasma Digsite Conservator (`1VW9ESktlPC1XxnuIYTE`) no existe ni como doc ni como entrada; Vectis Gloves y Skyblade's Boon **sí tienen** entrada (ya no divergen); Angel's Herald recuperó la suya durante mi propia sesión. O sea: los fixtures de TASK-238 están efectivamente destruidos.

No se lo puedo atribuir al código nuevo, y la lectura lo descarta: `stripIndexEntries` (`e2e/helpers/admin.ts:191`) filtra **solo** ids en `doomed`, y `deleteCards` (`:214`) solo borra ids que el caller pasó. Ninguna de las dos puede quitar la entrada del fantasma ni *agregar* entradas a Vectis/Skyblade — y agregar entradas es justo lo que pasó. El re-indexado espontáneo que medí en vivo (punto 2) explica los tres casos. **Para el orquestador: los fixtures vivos de TASK-238 ya no existen, por comportamiento de la app, no por este commit.**

## Verificación adicional que sí llegué a hacer

- **AC6 medido por mí, no leído.** `decks` y `binders` antes: 1 y 1. `npx playwright test e2e/specs/decks --grep "create new deck"` → verde → después: 1 y 1. `--grep "create new binder"` → verde → después: 1 y 1. Ambos cleanups borran lo que crean. La afirmación del commit se sostiene.
- **`npx vue-tsc --noEmit`**: limpio (el mismo comando que corre CI).
- Restos preexistentes que confirman lo que CLAUDE.md ahora documenta: quedó un deck `Editor Test 1786932219081` y un binder `Binder CSV 1786930789887` huérfanos de *otros* specs. La fuga de `deck-editor.spec.ts` quedó documentada en CLAUDE.md **pero no vi ticket abierto** — eso es de tu lado.

## Hallazgos

### MEDIUM-1 — La rama "no encontré nada" sigue siendo verde y muda-en-la-práctica
`e2e/specs/collection/collection-crud.spec.ts:139-146`. Si tras 30 s no aparece ni doc nuevo ni bump, se emite `console.warn` y el test **sigue verde**: `created=[]` hace que los tres candados pasen trivialmente. Si el doc aterriza después del sondeo, la fuga es real e invisible — exactamente el modo de falla que AC2 declara inaceptable, y contradice la decisión escrita ("rojea") en el único caso donde rojear haría falta. Peor combinación posible: si el bundle bajo prueba apuntara a un proyecto distinto del que `admin.ts` audita (los guardas miran `VITE_MODE`/`E2E_BASE_URL`, no el projectId real del bundle), el doc se crea en otro lado, `created=[]`, y esta rama lo tapa. Sugerencia: `expect(created.length + bumped.length).toBeGreaterThan(0)`, o subir el deadline y rojear.

### MEDIUM-2 — `created` es "nuevo en la cuenta", no "creado por este test"
`e2e/helpers/admin.ts:200` + `collection-crud.spec.ts:130-136`. El diff es por cuenta completa, así que cualquier documento que aparezca durante la ventana (Rafael usando la app, dos corridas de CI simultáneas sobre la cuenta compartida) entra en `created` y **se borra**. El comentario de seguridad dice "only ever deletes ids the caller measured as new" — cierto, pero "new" no equivale a "mío". Acotable con un filtro por `name`/`scryfallId` de la carta que el test agregó.

### MEDIUM-3 — `restoreQuantities` sí escribe sobre bystanders no medidos
`e2e/helpers/admin.ts:159-168`. Restaura la cantidad de **cualquier** doc preexistente cuyo valor difiera del snapshot, no solo el que el test tocó. Un cambio ajeno hecho durante la ventana se revierte en silencio. El rail declarado ("solo ids medidos como nuevos") cubre los borrados, no las escrituras.

### MEDIUM-4 — El fix puede quedar desactivado en CI sin que nada lo note
`.github/workflows/test.yml:100-108` y `nightly-e2e.yml:64-74`. El secreto se interpola crudo en el `run:` y se escribe tal cual a `sa-dev.json`. `FirebaseExtended/action-hosting-deploy` acepta el secreto **en base64 o en JSON**; si está guardado en base64 (uso normal), el archivo no es credencial válida → `applicationDefault()` tira → `getTestAdmin()` devuelve null → el spec **hace skip** en develop, verde, para siempre. No hay ninguna aserción que impida que el arreglo entero quede inerte. Un `jq empty "$RUNNER_TEMP/sa-dev.json" || exit 1` en el mismo paso lo cierra. (Menor, mismo lugar: un `'` dentro del secreto rompe el `echo '...'`; y en `pull_request` hacia develop `github.ref` es `refs/pull/N/merge`, así que ahí también skipea.)

### LOW
- `e2e/helpers/admin.ts:170-173` `subcollectionIds` y el `db` expuesto no los usa nadie: API muerta que salió de la medición ad-hoc del AC6.
- `e2e/helpers/admin.ts:222-228`: peor caso del bucle de strip ≈ 8 pasadas × 4 s ≈ 40 s, sobre un presupuesto de 90 s (`test.setTimeout(90_000)` en :25) que además paga el flujo de add. Mi corrida real usó 30,2 s con `passes=3`, o sea hay margen, pero un timeout ahí mata el teardown a mitad y deja fuga + rojo confundible.
- `snapshot()` lee la colección entera en cada iteración del sondeo. Con 257 docs es trivial; si esta cuenta se repunta alguna vez a la de 59k, no lo es.

## Auditoría de tier
`tests-after` es defendible — es infraestructura de test y hacer TDD sobre el propio teardown es circular. Pero hay un hueco concreto: **los guardas de seguridad de `build()` (`e2e/helpers/admin.ts:95-115`: rechazo de `VITE_MODE=production`, de `E2E_BASE_URL` no-dev, de cualquier `projectId` que no sea `cranial-trading-dev`) no tienen ni una prueba automática.** Son lo único que separa este módulo de borrar en producción y hoy están verificados solo por lectura — precisamente lo que la cultura del proyecto rechaza. Son funciones puras y baratas de cubrir en `tests/unit/`. Eso sí lo pediría antes de dar el tema por cerrado, aunque no bloquea este commit.

Sobre eludibilidad de los guardas: no encontré camino. `E2E_ADMIN_PROJECT_ID` solo puede *restringir* (cualquier valor distinto de dev aborta), y el `projectId` pasado a `initializeApp` es la constante literal, así que ni con credenciales de prod en `GOOGLE_APPLICATION_CREDENTIALS` el módulo apunta a otro proyecto. Sin credenciales devuelve null y el spec hace skip visible — el skip es real, lo verifiqué por lectura del camino, no por ejecución.

## NO VERIFICADO (explícito)
1. Candado 2 (`leftovers`) y candado 3 (drift de cantidad) **no** los maté por mutación — solo el candado 1. El commit afirma que ambos rojean; no lo confirmé.
2. El camino MERGE de `AddCardModal` (bump de cantidad en vez de doc nuevo) no se disparó en ninguna de mis corridas, así que `restoreQuantities` nunca se ejecutó con trabajo real (`quantitiesRestored=[]` en las dos).
3. El comportamiento con credenciales ausentes (skip real) no lo ejecuté: mis corridas tenían ADC en disco.
4. Nada de esto se probó en CI. Todo es local contra `cranial-trading-dev`; el cableado de `FIREBASE_SERVICE_ACCOUNT_DEV` está sin ejercitar (ver MEDIUM-4).
5. No corrí la suite E2E completa ni los unit tests — solo `add card`, `create new deck`, `create new binder` y `vue-tsc`.
6. Los tres diagnósticos del AC1 (las corridas A/B/C, la ventana de ~20 s de `deleteCard`) los tomo como afirmación del commit; no los reproduje. El AC1 pedía medir, y hay evidencia indirecta de que se midió, pero no es verificación mía.

**Confianza: 7/10.** Alta en lo que ejecuté (AC4 mutación, AC5, AC6, type-check — todo MEDIDO por mí); baja en el cableado de CI y en los dos candados que no llegué a matar.