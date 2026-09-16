# TASK-290 — evidencia de siembra en DEV (2026-09-16)

> **Por que este archivo existe y no es un comentario del ticket.** Las herramientas MCP del
> task-store NO estan autorizadas en esta sesion (`append_comment` rebota pidiendo permiso), y
> el contrato del proyecto PROHIBE suplirlas editando `tasks/TASK-290.json` a mano: un Edit
> crudo no pasa por validacion ajv ni por ninguna de las guardas de cierre. El contenido de
> abajo esta escrito para pegarse tal cual como comentario `uat` / `orchestrator` desde una
> sesion con permisos.

## AC1 — control negativo, ANTES de tocar nada

Medido con Admin SDK contra `cranial-trading-dev`. Instrumento re-corrible:
`artifacts/scratch-290-ac1.mjs`.

| Lado | ANTES |
|---|---|
| `public_cards` (coleccion RAIZ) total | **400** |
| `public_cards` where `userId == 90PkdmyFKrVm1RLDXjInJdlYXy73` | **400** |
| `users/{uid}/cards` where `public == true` | **2202** |
| `users/{uid}/public_card_index` | 2 chunks, **400** entradas |
| `_meta.count` | **400** |
| Firebase Auth (dev) | **1** cuenta: `qa@cranialtrading.com` |

### Lo que corrige la premisa del ticket, y vale mas que el arreglo

**La cuenta de prueba nunca falto.** `qa_mtg` existe y esta sana: uid
`90PkdmyFKrVm1RLDXjInJdlYXy73`, con `/users/{uid}` (`username = qa_mtg`), reserva
`/usernames/qa_mtg` apuntando a ese uid, cuenta de Auth viva, y sus **2202** cartas
`public=true` intactas. **No habia ningun usuario que crear.** Lo unico roto era la coleccion
RAIZ `public_cards`, con 400 de 2202; el `public_card_index` venia siguiendola fielmente y no
perdio nada por su cuenta.

`/usernames/qa` apunta al MISMO uid y es evidencia deliberada de TASK-268. El comentario de
cabecera de `user-profile.spec.ts` pide explicitamente no borrarlo. **No se toco.**

**Discrepancia declarada y NO conciliada:** la nota del bundle del 2026-09-15 afirmaba
`public_cards` TOTAL = 0 y el indice en 602. Ninguna de las dos cifras es cierta hoy. No se
investigo si la medicion anterior uso otra consulta o si algo escribio entremedio. Queda como
MEDIDO-HOY contra LEIDO-AYER, sin resolver.

## AC2 / AC3 — DESPUES, verificado por conteo directo

Re-medido por el orquestador de forma **independiente** del reporte del developer, con el mismo
instrumento:

| Lado | ANTES | DESPUES |
|---|---|---|
| `public_cards` (RAIZ, `userId == uid`) | 400 | **2202** |
| `users/{uid}/cards` where `public == true` | 2202 | **2202** (sin cambios) |
| `public_card_index` entradas | 400 | **2202** (9 chunks) |
| `_meta.count` | 400 | **2202** |
| Divergencia indice vs documentos | -1802 | **0** |

Auth sigue con 1 sola cuenta; `/usernames` sigue con `qa_mtg` y `qa`, los dos al mismo uid.
Nada mas de la cuenta fue tocado.

## AC6 — procedimiento de re-siembra (idempotente)

```
node scripts/repair-public-cards-parity.mjs --uid=90PkdmyFKrVm1RLDXjInJdlYXy73 --dry-run
node scripts/repair-public-cards-parity.mjs --uid=90PkdmyFKrVm1RLDXjInJdlYXy73
node scripts/reconcile-public-card-index.mjs --uid=90PkdmyFKrVm1RLDXjInJdlYXy73
```

Documentado en `CLAUDE.md`, seccion "Recreating/repairing dev's test data (`qa_mtg`)".

Diseño, y por que asi:

- La **forma** del documento de `public_cards` no se reimplementa: el script reusa la funcion
  real `buildPublicCardDoc()` de `src/services/publicCards.ts` compilandola al vuelo
  (`scripts/lib/loadBuildPublicCardDoc.mjs`). El comentario de esa funcion dice que es la unica
  fuente de verdad de la forma, creada en TASK-247 porque tres call-sites habian driftado con
  literales propios. Copiar el literal era exactamente esa trampa.
- El **id** del documento se compone `${userId}_${cardId}`, identico a los cuatro call-sites del
  SUT (`publicCards.ts:425,494,526,606`) — verificado caracter por caracter por el reviewer. Si
  difiriera, la re-siembra duplicaria en vez de ser idempotente, que es todo su valor.
- El **indice** no lo escribe el script: lo reconstruye el reconciliador real (Cloud Function)
  desde `public_cards`, que es la fuente de verdad. Ir de 400 a 2202 es crecimiento, asi que el
  collapse-guard de TASK-247 no se dispara — confirmado por el `strategy=rebuild-by-id` impreso,
  nunca `refused`.
- **Rail de seguridad:** proyecto por defecto `cranial-trading-dev`; cualquier otro `--project`
  se niega sin `--i-know-what-im-doing`, y el `projectId` va fijado explicitamente en
  `initializeApp` para que ADC o el entorno no puedan redirigirlo en silencio. Llegar a
  produccion exige dos banderas deliberadas.

**Idempotencia medida, no afirmada:** segunda corrida del reparador -> `a crear=0`, conteo
estable en 2202. Tercera corrida del reconciliador -> `strategy=noop`, `wrote=0 deleted=0`.

**Rama honesta y NO VERIFICADA:** si la cuenta entera desaparece (no solo sus cartas), el
procedimiento de arriba NO sirve — `seed-e2e-bulk-cards.mjs` hace `signInWithEmailAndPassword`
contra una cuenta que tiene que existir y no crea ni el usuario de Auth, ni `/users/{uid}`, ni
la reserva. Los pasos manuales para ese caso quedaron escritos en `CLAUDE.md` **marcados como
NO VERIFICADOS**, porque nadie los ejecuto.

## AC7

`artifacts/scratch-289-divergencia.mjs` quedo con su limitacion documentada en el propio
archivo (opcion B del AC): compara el indice contra `users/<seller>/cards where public==true` y
**nunca** mira la coleccion RAIZ `public_cards`, que es la que se vacia. Por eso el 2026-08-27
subdiagnostico este mismo vaciado.

## Lo que NO se cierra con este ticket

**La causa del vaciado de `public_cards` sigue SIN DETERMINAR.** Este ticket repone el dato; no
explica quien lo borra. Segun lo ya medido, ninguna Cloud Function escribe esa coleccion: el
unico escritor/borrador es el cliente, en `src/stores/collection.ts` (`batch.delete` sobre
`public_cards` ~linea 190 y el cleanup de ~2647). Mientras eso no se cierre, **la re-siembra
puede volver a degradarse y el sensor a ponerse rojo**. Merece ticket propio.
