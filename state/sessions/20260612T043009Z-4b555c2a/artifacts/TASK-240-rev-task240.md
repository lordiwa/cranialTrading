=== rev-task240 @ 2026-08-17T05:05:27.435Z ===

Temp scripts removed, spec restored (`git diff` vs HEAD is empty), dev account back to 257 docs / 256 entries.

---

# Review TASK-240 — commit 870d58d — **BLOQUEADO** (1 HIGH)

## Lo que verifiqué corriendo, no leyendo

**AC4 — reproducido por mutación. PASA.** MEDIDO por mí, dos corridas contra `https://cranial-trading-dev.web.app`:

- Base (código tal cual): verde en 31.3 s. `created=[HZ66JebNttihzVZRArIJ] docsDeleted=1 indexEntriesRemoved=1 passes=3`.
- Mutación (`deleteCards(created)` → `deleteCards([])`, `collection-crud.spec.ts:159`): **ROJO, y por la razón correcta** — la aserción que muere es el lock 1 en `collection-crud.spec.ts:163`, con el mensaje del leak y el id creado:

```
Error: [cleanup][add card] LEAK: the account has 258 card docs, was 257. created=[ZWlE53iIqvOyWwYw7hfZ]
Expected: 257  Received: 258
```

No es un error de import ni un fallo colateral. El candado es falsable. Restauré el archivo y borré el documento filtrado (`ZWlE53iIqvOyWwYw7hfZ`, Lightning Bolt / Marvel Super Heroes Commander) más su entrada de índice.

**AC5 — cumplido. MEDIDO** (auditoría read-only con firebase-admin sobre `jV6gJqf3csPA4vRfO2k9Vb5ejYo2`): los tres ids `VIaujcMtjQw1RDOoL33e`, `gBOsQM3djwYi2nK7JcC9`, `24CyD7f3iMSbaiQIH5PF` no existen ni como documento ni como entrada. Cero documentos "Lightning Bolt" en la cuenta. Estado: 257 docs / 256 entradas, 0 divergentes, 0 fantasmas, 1 ausente (Angel's Herald).

**Sobre los fixtures de TASK-238 que desaparecieron: no fue el código nuevo.** LEÍDO, con traza completa: `deleteCards` solo borra ids de `created`, y `stripIndexEntries` (`admin.ts:191`) filtra exclusivamente por `doomed.has(e.i)`. No existe camino que toque un bystander como documento ni como entrada. Angel's Herald quedó ausente (doc vivo, entrada borrada) que es exactamente la firma del cleanup VIEJO por índice 0 ejercitado durante el diagnóstico; los otros dos divergentes y el fantasma se explican por un rebuild del índice, que regenera desde documentos. El punto 3 "borra un bystander" queda descartado para el código nuevo — con una excepción, MEDIUM-3 abajo.

`npm run type-check` limpio.

---

## HIGH-1 — El teardown fabrica una DIVERGENCIA de card_index en el camino de MERGE, y sus tres candados son ciegos a ella

`e2e/helpers/admin.ts:159-168` (`restoreQuantities`) + `e2e/specs/collection/collection-crud.spec.ts:186-194` (lock 3).

Traza (LEÍDO, verificada extremo a extremo):

1. `AddCardModal.vue:256-267` — si ya existe la misma impresión, no crea documento: llama `collectionStore.updateCard(existing.id, { quantity: existing.quantity + n })`.
2. `stores/collection.ts:1718` — `updateCard` llama `syncIndexLocal(updatedCard, 'update')`, que reescribe la entrada con `cardToIndex(card)`. `IndexCard.q` (`collection.ts:173`) **es la cantidad**. Se persiste al chunk.
3. `restoreQuantities` hace `db.doc(...).update({ quantity: q })` **solo sobre el documento**. No toca `card_index`.
4. No hay ningún trigger de Firestore en `functions/index.js` (grep de `onDocumentWritten|onWrite|firestore.document`: **cero resultados**). Nada reconcilia.

Resultado en cada corrida que caiga en el merge: documento con `quantity=N`, entrada de índice con `q=N+1`. Eso es un **DIVERGENTE** — la clase de daño exacta que TASK-208/238 persiguen — creado por el propio teardown, en la cuenta compartida, y de forma silenciosa:

- Lock 1 (conteo de docs) no cambia.
- Lock 2 solo mira ids de `created`, que en el merge está vacío.
- Lock 3 compara cantidades **de documentos**, que quedaron restauradas. Verde.

Esto es una regresión de tipo, no solo un hueco: el comportamiento anterior dejaba doc e índice ambos en N+1 (drift consistente y acotado); el nuevo los deja discrepantes. Y el propio commit reconoce que el merge ocurre de verdad ("measured on this very test... both happen across consecutive runs").

Agrava el punto 2 de tu encargo: **quitar la aserción global de conteo de entradas fue defendible, pero dejó el hueco justo donde vive este bug.** La razón dada (el rebuild de la app movió 258→261) es sólida y no es laundering — el invariante global no es del cleanup y rojearía por no-leaks; en mi corrida base el conteo fue estable (256→256), o sea el ruido es intermitente, no constante. El error no fue quitarla sino no reemplazarla por el invariante correcto y acotado: **consistencia doc↔entrada para los ids que este test tocó (`created` ∪ `bumped`)**, incluida la cantidad. Eso mata HIGH-1 y no puede rojear por el rebuild.

Corolario medido: hoy la cuenta tiene 0 documentos Lightning Bolt, así que el add siempre crea y **el lock 3 nunca puede dispararse en el estado actual** — no lo pude falsificar por mutación ni siquiera queriendo. La afirmación del commit de que rojeó "on the drift lock" no es verificable con la cuenta como está.

---

## MEDIUM

**M-2 — `snapshot()` es un escaneo completo de la colección, y se ejecuta en un bucle de sondeo cada 2 s.**
`admin.ts:133-153` lee **todos** los documentos de `users/<uid>/cards` más todos los chunks. El bucle de `collection-crud.spec.ts:132-140` lo repite cada 2 s hasta 30 s; después `restoreQuantities` hace otro `snapshot()` (`admin.ts:160`) y `after` uno más. Mínimo ~4 escaneos completos, hasta ~18. En la cuenta que medí (257 docs) es gratis. Las notas del proyecto dicen que la cuenta del CI es de ~59k y que la mediana del mercado son 25k-100k: ahí son cientos de miles de lecturas por corrida y varios segundos por escaneo. Sumado a los sleeps de 4 s × hasta 8 pasadas de `deleteCards`, el peor caso de teardown ronda los ~58 s contra un `test.setTimeout(90_000)` compartido — con la parte de UI adentro. La corrida base gastó 31.3 s con la cuenta chica. Esto es a la vez costo y una fuente de rojo por timeout.

**M-3 — Sin candado de concurrencia en CI, `created` puede capturar un documento ajeno y borrarlo.**
`test.yml` no tiene bloque `concurrency` (solo `nightly-e2e.yml:18` lo tiene, y su grupo no cubre a `test.yml`). Dos pushes seguidos a `develop`, o un nightly solapado con un push, corren contra la MISMA cuenta. `created = ids que no estaban en before` no distingue "lo creé yo" de "lo creó la otra corrida", y el bucle corta apenas ve uno. La probabilidad es baja y sigue siendo mejor que el índice 0 anterior, pero el ticket pedía explícitamente que no pueda pegarle a un bystander y esta puerta queda abierta. Se cierra con un `concurrency: group` en `test.yml` o filtrando `created` por nombre/impresión esperada además de por id.

**M-4 — El AC1 se entrega como narrativa, no como instrumentación, y una de sus premisas no se sostuvo en mi corrida.**
El AC pedía instrumentar el bloque para que dijera cuál de los tres pasos falló. Lo entregado es un relato en el comentario (`collection-crud.spec.ts:36-70`) y en el mensaje del commit; no hay artefacto en el repo que yo pueda re-verificar, y el Developer nunca entregó hand-off. La conclusión operativa (el target estaba mal, borrar por id es correcto igual) la comparto y está bien fundada. Pero la premisa categórica "a freshly added card **frequently never** reaches card_index" tiene un contraejemplo medido: en mi corrida base la carta creada **sí** entró al índice (`indexEntriesRemoved=1`). Una corrida no refuta nada, pero el AC1 pedía textualmente decirlo si el comportamiento resulta intermitente, y el escrito lo presenta como categórico.

**M-5 — El AC6 encontró un leak nuevo, medido, y lo dejó solo en prosa de CLAUDE.md.**
El diff de `CLAUDE.md` agrega: "*Not fixed and still leaking, found while measuring the above: `decks/deck-editor.spec.ts` 'add card from collection to mainboard' creates a deck and never deletes it — measured, decks 1 → 2 in one run*". Eso es exactamente el defecto de este ticket en otro archivo, medido, y no tiene ticket. El AC6 permite arreglarlo en un ticket propio pero no permite que quede sin registrar como trabajo. (Lo bueno: la parte pedida —deck-crud "create new deck" y binders "create new binder"— se declara re-verificada por medición; tampoco tiene artefacto, mismo reparo que M-4, pero no la contradije.)

**M-6 — Tier mal asignado.** `verification_tier: "tests-after"` para un diff que agrega 233 líneas de helper con credenciales de servicio que **borra documentos** y que modifica dos workflows de CI. Las partes falsables sin Firebase (los cuatro guardarraíles de `build()`, el filtrado por `doomed` de `stripIndexEntries`, el criterio de corte del bucle de pasadas) son unitarias puras y no tienen un solo test. El propio ticket disparó FULL en la rúbrica de revisión; el tier de verificación debería haber subido con él.

---

## LOW

- **L-7** `admin.ts:100` — `baseUrl.includes('cranial-trading-dev')` es substring, no host. `https://evil.example/cranial-trading-dev` pasa. Irrelevante para el daño real (el proyecto está fijado por constante), pero la comprobación no dice lo que parece decir.
- **L-8** `admin.ts:105-109` — `E2E_ADMIN_PROJECT_ID` solo puede valer la constante o abortar. Es una perilla muerta que parece configurar el destino y no lo hace. Mejor borrarla que dejarla sugiriendo que existe. Lo positivo: **es precisamente por eso que el guardarraíl no se puede eludir por variable de entorno**, que era tu punto 3.
- **L-9** Ambos workflows interpolan el secreto directo en la línea de shell (`test.yml:104,107`; `nightly-e2e.yml:71,74`). Un `'` dentro del JSON rompe el comando. Lo idiomático es pasarlo por `env:` y usar `"$VAR"`.
- **L-10** Sin bump de versión en `package.json` (`1.58.4`), con CLAUDE.md exigiéndolo por cambio significativo y este tocando CI.
- **L-11** `admin.ts:194` — `tx.update` escribe `cards` y `count` pero no `updatedAt` ni `version`, campos que sí escriben ambos productores del chunk (`collection.ts:1078`, `functions/index.js:1092-1096`). El chunk queda con un `updatedAt` que miente.

---

## Sobre tus puntos 3 y 4, respuesta directa

**Punto 3 — seguridad del helper: aprueba, salvo M-3.** El proyecto está en una constante (`admin.ts:35`) y ninguna variable de entorno puede redirigirlo. Las credenciales de prod tampoco sirven: `initializeApp` fuerza `projectId: cranial-trading-dev`, y la sonda de lectura de `admin.ts:127` falla antes de que ningún test dependa de ellas. Sin credenciales devuelve `null` y el `test.skip` está **antes** de `openAddCardModal()` (`collection-crud.spec.ts:86-88`), así que no crea nada que no pueda borrar — verificado por lectura de orden de ejecución. Y las credenciales **no llegan al run de `main`**: el paso de `test.yml:100` está guardado por `if: github.ref == 'refs/heads/develop'`, y `main` corre `--grep @smoke` (`test.yml:129`) donde este spec ni existe. Doble capa, correcta.

**Punto 4 — la inversión a "rojea": la justificación es sólida.** El argumento real no es retórico: un `delete` por id vía admin no tiene overlays, ni grilla virtualizada, ni toast, así que el fallo significa fuga de verdad. Lo confirmé: la mutación rojeó por el mensaje correcto. **Pero sí introduce fuentes de rojo ajenas a las aserciones reales del test**, y son concretas, no hipotéticas: el timeout de M-2 en una cuenta grande, el bystander de M-3, y una carrera estrecha en la que el persist debounced del cliente reescribe la entrada después de las dos pasadas limpias y antes del `after` (`admin.ts:222-228` vs `collection-crud.spec.ts:157`). Ninguna me parece razón para volver a "leak, don't redden" — pero M-2 debería acotarse antes de que esto entre al gate de push a `develop`.

---

## Veredicto

**BLOQUEADO** por HIGH-1. Lo pedido para desbloquear: que `restoreQuantities` repare también la entrada de `card_index` del documento que restauró, y que se agregue el candado acotado que reemplaza al conteo global — consistencia doc↔entrada (incluida `q`) sobre `created ∪ bumped` — falsable por mutación como lo fue el lock 1.

Todo lo demás del ticket está genuinamente cumplido: AC3, AC4 y AC5 los verifiqué yo mismo por medición; AC2 está decidido y escrito con razón defendible; AC1 y AC6 llegan a la conclusión correcta pero sin artefacto reproducible (M-4, M-5).

**Confianza: 7/10.** Alta en lo que corrí (AC4 por mutación, AC5 por auditoría, los guardarraíles del helper por traza de código). Media-baja en tres cosas: HIGH-1 lo derivé por traza completa de código pero no lo reproduje ejecutando el camino de merge (la cuenta no tiene la impresión previa, así que hoy siempre crea); el comportamiento en la cuenta del CI —que puede ser la de 59k y no la de 257 docs que medí— no lo observé; y AC1/AC6 dependen de mediciones del Developer que nadie puede re-verificar.


=== rev-task240 @ 2026-08-17T05:07:34.670Z ===

Reporte entregado abajo. Corrección de un dato tuyo: sí alcancé a correr la mutación — los ~8 minutos alcanzaron porque corrí contra el sitio dev desplegado (`E2E_BASE_URL`), lo que salta el `vite build` + `preview` del `webServer` local y deja el ciclo en ~45 s por corrida. Lo que NO hice está listado al final.

---

## 1. VEREDICTO: **BLOQUEADO** — 1 HIGH

### HIGH-1 — El teardown fabrica una DIVERGENCIA de `card_index` en el camino de MERGE, y sus tres candados son ciegos a ella
`e2e/helpers/admin.ts:159-168` (`restoreQuantities`) + `e2e/specs/collection/collection-crud.spec.ts:186-194` (lock 3).

Traza (**LEÍDO**, extremo a extremo, cuatro saltos):
1. `src/components/collection/AddCardModal.vue:256-267` — si ya existe la misma impresión no crea documento: `collectionStore.updateCard(existing.id, { quantity: existing.quantity + safeQuantity })`.
2. `src/stores/collection.ts:1718` — `updateCard` llama `syncIndexLocal(updatedCard, 'update')`, que reemplaza la entrada por `cardToIndex(card)`.
3. `src/stores/collection.ts:173` — `IndexCard.q` **es la cantidad**. O sea la entrada del índice queda en N+1 y se persiste.
4. `restoreQuantities` (`admin.ts:164`) hace `update({ quantity: q })` **solo sobre el documento**. No toca `card_index`.

Y nada reconcilia después: **MEDIDO** — `grep -n "onDocumentWritten\|onWrite\|firestore.document" functions/index.js` devuelve **cero resultados**. No hay triggers de Firestore en el proyecto.

Resultado en cada corrida que caiga en merge: documento `quantity=N`, entrada `q=N+1`. Eso es un **DIVERGENTE**, la clase de daño de TASK-208/238, fabricado por el propio teardown en la cuenta compartida. Los tres candados lo dejan pasar en verde: lock 1 (conteo de docs) no cambia; lock 2 solo mira ids de `created`, que en merge está vacío; lock 3 compara cantidades **de documentos**, que quedaron restauradas.

Es una regresión de tipo, no solo un hueco: el comportamiento viejo dejaba doc e índice ambos en N+1 (drift consistente y acotado); el nuevo los deja discrepantes. El commit mismo dice que el merge ocurre de verdad ("*measured on this very test... both happen across consecutive runs*") — **LEÍDO** del mensaje de commit, no verificado por mí.

### MEDIUM

**M-2 — `snapshot()` es un escaneo completo de la colección, dentro de un bucle de sondeo cada 2 s.** `admin.ts:133-153` lee *todos* los docs de `users/<uid>/cards` más todos los chunks. El bucle de `collection-crud.spec.ts:132-140` lo repite cada 2 s hasta 30 s; después `restoreQuantities` hace otro `snapshot()` (`admin.ts:160`) y `after` uno más. Mínimo ~4 escaneos completos por corrida, hasta ~18. **MEDIDO**: con 257 docs es gratis (corrida completa 31,3 s). **SUPUESTO** sobre CI: si la cuenta del CI es la de ~59k que dicen las notas del proyecto, son cientos de miles de lecturas por corrida y varios segundos por escaneo, contra un `test.setTimeout(90_000)` compartido (`collection-crud.spec.ts:25`) que ya incluye la parte de UI. No lo pude medir — no tengo las credenciales del CI.

**M-3 — Sin candado de concurrencia en CI, `created` puede capturar un documento ajeno y borrarlo.** **MEDIDO**: `grep -n concurrency` sobre los dos workflows → `.github/workflows/nightly-e2e.yml:18` lo tiene, `.github/workflows/test.yml` **no**. Dos pushes seguidos a `develop`, o un nightly solapado con un push, corren contra la MISMA cuenta. `created = ids que no estaban en before` no distingue "lo creé yo" de "lo creó la otra corrida", y el bucle corta apenas ve uno. Es el único escenario de bystander que queda abierto. Se cierra con un `concurrency: group` en `test.yml`, o filtrando `created` por impresión esperada además de por id.

**M-4 — El AC1 se entrega como narrativa, no como instrumentación, y una premisa suya no se sostuvo en mi corrida.** El AC pedía instrumentar el bloque para que dijera *cuál* de los tres pasos falló. Lo entregado es relato en `collection-crud.spec.ts:36-70` y en el commit; no hay artefacto re-verificable, y el Developer nunca dio hand-off. La conclusión operativa (el target estaba mal; borrar por id es correcto igual) la comparto. Pero la premisa categórica "*a freshly added card frequently never reaches card_index*" tiene un contraejemplo **MEDIDO**: en mi corrida base la carta creada **sí** entró al índice (`indexEntriesRemoved=1`). Una corrida no refuta nada, pero el AC1 pedía textualmente decirlo si el comportamiento resulta intermitente, y el escrito lo presenta como categórico.

**M-5 — El AC6 encontró un leak nuevo, medido, y lo dejó solo en prosa.** **LEÍDO** del diff de `CLAUDE.md:225`: "*Not fixed and still leaking, found while measuring the above: `decks/deck-editor.spec.ts` 'add card from collection to mainboard' creates a deck and never deletes it — measured, decks 1 → 2 in one run*". Es el defecto de este ticket en otro archivo, medido, sin ticket. El AC6 permite arreglarlo aparte, no permite que quede sin registrar como trabajo.

**M-6 — Tier mal asignado** (respuesta al punto 6, ampliada abajo).

### LOW
- **L-7** `admin.ts:100` — `baseUrl.includes('cranial-trading-dev')` es substring, no host; `https://evil.example/cranial-trading-dev` pasa. Inocuo porque el proyecto está fijado por constante, pero la comprobación no dice lo que parece decir.
- **L-8** `admin.ts:105-109` — `E2E_ADMIN_PROJECT_ID` solo puede valer la constante o abortar: perilla muerta que parece configurar el destino y no lo hace.
- **L-9** `test.yml:104,107` y `nightly-e2e.yml:71,74` — el secreto se interpola directo en la línea de shell; un `'` dentro del JSON rompe el comando. Lo idiomático es pasarlo por `env:` y usar `"$VAR"`.
- **L-10** Sin bump de versión en `package.json` (sigue en `1.58.4`), con CLAUDE.md exigiéndolo y este diff tocando CI.
- **L-11** `admin.ts:194` — `tx.update` escribe `cards` y `count` pero no `updatedAt` ni `version`, campos que sí escriben los dos productores del chunk (`src/stores/collection.ts:1078`, `functions/index.js:1092-1096`). El chunk queda con un `updatedAt` que miente.

---

## 2. AC4 — SÍ, lo reproduje yo mismo. **MEDIDO.**

Dos corridas contra `https://cranial-trading-dev.web.app`, salida verbatim.

**Base, código tal cual — VERDE:**
```
[cleanup][add card] created=[HZ66JebNttihzVZRArIJ] docsDeleted=1 indexEntriesRemoved=1 passes=3 quantitiesRestored=[]
[cleanup][add card] card_index entries 256 -> 256 (informational; see the comment above)
  ✓  2 [chromium] › ... › add card: open modal → search → select → save → card appears (31.3s)
  2 passed (47.1s)
```

**Mutación** — cambié `collection-crud.spec.ts:159` de `admin.deleteCards(created)` a `admin.deleteCards([])`:
```
[cleanup][add card] created=[ZWlE53iIqvOyWwYw7hfZ] docsDeleted=0 indexEntriesRemoved=0 passes=0
  ✘  2 [chromium] › ... › add card: open modal → search → select → save → card appears (16.8s)

  1) ... › add card: open modal → search → select → save → card appears

    Error: [cleanup][add card] LEAK: the account has 258 card docs, was 257. created=[ZWlE53iIqvOyWwYw7hfZ]

    expect(received).toBe(expected) // Object.is equality

    Expected: 257
    Received: 258

      161 |       after.cardDocCount,
      162 |       `[cleanup][add card] LEAK: the account has ${after.cardDocCount} card docs, was ${before.cardDocCount}. created=[...]`,
    > 163 |     ).toBe(before.cardDocCount);
          |       ^
        at ...collection-crud.spec.ts:163:7

  1 failed
  1 passed (28.2s)
```

**En qué aserción cae:** el rojo es el **lock 1** (`collection-crud.spec.ts:163`, conteo de documentos), con el mensaje de leak y el id creado. No es un error de import, no es un fallo colateral, no es un timeout. El candado es falsable y muere por la razón correcta.

**El otro rojo que afirma el commit ("RED on the drift lock") no lo pude reproducir, y hoy es irreproducible.** **MEDIDO**: la cuenta tiene **0 documentos "Lightning Bolt"**, así que el add siempre entra por el camino de creación y nunca por el de merge → el lock 3 no puede dispararse en el estado actual. Esa afirmación del commit queda **SIN VERIFICAR**.

Restauré el archivo (`git diff HEAD -- e2e/` vacío) y borré el documento filtrado por la mutación, `ZWlE53iIqvOyWwYw7hfZ` (Lightning Bolt / Marvel Super Heroes Commander) más su entrada de índice. La cuenta volvió a 257 docs / 256 entradas.

---

## 3. HELPER ADMIN — auditado. Aprueba, salvo M-3.

- **¿Se puede eludir la comprobación del proyecto?** **No. LEÍDO**, `admin.ts:105-109`: `projectId` sale de `E2E_ADMIN_PROJECT_ID ?? DEV_PROJECT_ID`, y cualquier valor distinto de la constante devuelve `null` en vez de usarlo. La variable solo puede *abortar*, nunca redirigir. Y `initializeApp` (`admin.ts:121`) fuerza `projectId: cranial-trading-dev` explícitamente, así que unas credenciales de prod tampoco sirven: apuntarían al proyecto dev y fallarían por permisos en la sonda de lectura de `admin.ts:127`, que corre *antes* de que ningún test dependa de ellas.
- **¿Puede borrar un bystander?** **Por construcción no. LEÍDO**: `deleteCards` (`admin.ts:214-217`) itera exactamente `ids`; `stripIndexEntries` (`admin.ts:191`) filtra por `doomed.has(String(e?.i))` y solo reescribe el chunk si algo salió. No hay "borrar por nombre", ni "el más nuevo", ni posicional. **La única vía que queda es que el caller mida mal `created`**, que es M-3 (corridas de CI solapadas sobre la misma cuenta).
- **Sin credenciales, ¿hace SKIP de verdad?** **Sí. LEÍDO**, orden de ejecución en `collection-crud.spec.ts:86-93`: `getTestAdmin()` → `test.skip(admin === null, ...)` → `if (!admin) return;` y recién después `before = await admin.snapshot()` y `openAddCardModal()`. El skip ocurre **antes** de cualquier acción de UI, así que no crea nada que no pueda borrar. El motivo se imprime vía `adminUnavailableReason()`.
- **¿Las credenciales llegan al run de `main`?** **No. MEDIDO** sobre los dos workflows. `test.yml:100` guarda el paso con `if: github.ref == 'refs/heads/develop'`, y además `test.yml:129` corre `npx playwright test --grep @smoke` en `main`, donde este spec ni siquiera existe. Doble capa, independiente. `nightly-e2e.yml` no lleva guarda de rama pero hace checkout explícito de `develop` y apunta `E2E_BASE_URL` al sitio dev. **Este es el punto de mayor daño potencial del diff y está correctamente cerrado.**

**Sobre los fixtures de TASK-238 que desaparecieron: no fue el código nuevo.** Por la traza de arriba, ninguna ruta del helper toca un id fuera de `doomed`. **MEDIDO**: Angel's Herald quedó como AUSENTE (documento vivo, entrada borrada) — que es exactamente la firma del cleanup **viejo** por índice 0 ejercitado durante el diagnóstico, y coincide con lo que el propio Developer reporta haber observado. Los otros dos divergentes y el fantasma desaparecieron limpio, lo que es consistente con un rebuild del índice (regenera desde documentos) — eso último es **SUPUESTO**, no lo observé ocurrir.

---

## 4. ¿El candado es vacuo? — La remoción está justificada, pero dejó el hueco justo donde vive HIGH-1.

**No es laundering.** La razón dada es estructuralmente correcta: el conteo global de entradas de `card_index` no es un invariante del cleanup, la app lo reconstruye por su cuenta, y un candado así rojea por no-leaks — que es literalmente cómo un test termina en cuarentena y deja de significar algo. Es el mismo criterio que el proyecto ya aplica en otros lados.

**Y el ruido que invoca existe, aunque es intermitente:** **MEDIDO**, en mi corrida base el conteo fue estable (256 → 256). O sea el rebuild que vio el Developer no pasa siempre. Eso no invalida la decisión — un ancla que rojea a veces por razones ajenas es igual de inservible que una que rojea siempre.

**Qué quedó midiendo el candado sin ella:** tres cosas, y las dos primeras son reales. Lock 1 (`:160-163`) el conteo total de documentos — falsable, lo maté por mutación. Lock 2 (`:172-176`) que ningún id de `created` sobreviva ni como documento ni como entrada, que es el invariante correcto y acotado, y cubre el caso fantasma. Lock 3 (`:188-194`) la deriva de cantidad en documentos preexistentes — **hoy inalcanzable** por falta de la impresión previa en la cuenta.

**El error no fue quitar la aserción global, fue no reemplazarla por la acotada.** Lo que falta es consistencia doc↔entrada (**incluida `q`**) sobre `created ∪ bumped`. Eso mata HIGH-1, es inmune al rebuild de la app, y es exactamente el espíritu del AC4.

---

## 5. AC5 — **CUMPLIDO. MEDIDO por mí.**

Auditoría read-only con `firebase-admin` (`applicationDefault()`, proyecto `cranial-trading-dev`, uid `jV6gJqf3csPA4vRfO2k9Vb5ejYo2`), script temporal escrito en la raíz del repo y **borrado después**:

```
docs 257 indexEntries 256 chunks 1
--- AC5 targets ---
VIaujcMtjQw1RDOoL33e doc: gone | indexEntry: gone
gBOsQM3djwYi2nK7JcC9 doc: gone | indexEntry: gone
24CyD7f3iMSbaiQIH5PF doc: gone | indexEntry: gone
--- AUSENTES (doc w/o entry): 1 0a9pRgcnPye9NfADMYvR:Angel's Herald
--- PHANTOMS (entry w/o doc): 0
--- DIVERGENT: 0
--- Lightning Bolt docs: 0
```

Los tres ids del AC5 no existen ni como documento ni como entrada, y no queda ningún Lightning Bolt en la cuenta. Coincide con el estado que vos reportaste (257/256, 0 divergentes, 0 fantasmas).

---

## 6. TIER AUDIT — **mal asignado.** `tests-after` es insuficiente.

El diff agrega 233 líneas de helper con credenciales de servicio que **borra documentos** en una cuenta compartida, y modifica dos workflows de CI. Cero tests sobre el helper. Y las partes críticas **son unitarias puras, testeables sin Firebase**: los cuatro guardarraíles de `build()` (`admin.ts:95-115`), el filtrado por `doomed` de `stripIndexEntries` (`admin.ts:191`), el criterio de corte del bucle de pasadas (`admin.ts:222-228`). Hoy la única prueba de que el guardarraíl de proyecto funciona es que alguien lo leyó — y ese "alguien" hasta ahora fui yo, hace veinte minutos. La rúbrica de revisión ya disparó FULL para este diff; el tier de verificación debería haber subido con ella.

---

## NO VERIFICADO — huecos declarados

1. **El "RED on the drift lock" del commit.** Irreproducible hoy: la cuenta no tiene la impresión previa, así que el add nunca entra por merge. Lock 3 no se puede falsificar en el estado actual.
2. **HIGH-1 ejecutándose.** Lo derivé por traza completa de código (cuatro saltos, más la ausencia medida de triggers), **no** lo reproduje corriendo el camino de merge — por la misma razón del punto 1. Si querés certeza de ejecución: agregar a mano un Lightning Bolt de esa impresión a la cuenta y correr el test una vez.
3. **El comportamiento en la cuenta del CI.** Medí contra la de 257 docs de `.env.local`. Si el secreto del CI apunta a la de ~59k, M-2 (costo y timeout) cambia de "teórico" a probablemente bloqueante, y no tengo forma de medirlo desde acá.
4. **AC1 y AC6.** Ambos dependen de mediciones del Developer sin artefacto en el repo. La conclusión de los dos es correcta y coherente con lo que sí verifiqué, pero nadie puede re-verificarlas. Ver M-4 y M-5.
5. **Comportamiento del helper con múltiples chunks.** La cuenta que medí tiene **1** chunk. `stripIndexEntries` itera y transacciona **por chunk**; su comportamiento con ~30 chunks (contención con el persist loop del cliente, costo) no lo observé.
6. **Corridas repetidas.** Corrí el test dos veces. No hay evidencia mía sobre estabilidad ni sobre las carreras del debounce que menciono en M-2/M-3.

Árbol limpio: `git status --porcelain` sin cambios, los dos scripts temporales borrados, el spec restaurado.

**Confianza: 7/10.** Alta en lo que ejecuté (AC4 por mutación, AC5 por auditoría, los guardarraíles del helper por traza). Media-baja en HIGH-1 (razonado, no ejecutado), en el comportamiento a escala de CI, y en AC1/AC6.