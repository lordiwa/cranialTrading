# DEPLOY LOG — 2026-09-15 (despliegue completo a PRODUCCIÓN)

Registro honesto de todo lo que se desplegó a producción en esta tanda, con el estado de
revisión real de cada pieza (incluido lo NO revisado y lo que tiene HIGH abiertos), y lo que
quedó fuera. Este documento es el input del wargaming posterior con QA: cada línea de la
sección "Qué se desplegó" es una hipótesis a falsar contra el comportamiento real de prod.

- **Fecha:** 2026-09-15 (UTC), ventana 03:00–03:10 UTC para functions; hosting vía CI tras el merge.
- **Ordenado por:** Mato — "despleguemos todo en prod, así no esté revisado, y creamos una lista
  de lo que se supone se desplegó y luego hacemos wargaming para ver si cumple las pruebas".
- **Ejecutado por:** orquestador hivemind (sesión 20260612T043009Z-4b555c2a).
- **Proyecto prod:** cranial-trading — hosting https://cranial-trading.web.app
- **Aviso:** la autorización explícita de Mato fue desplegar aunque no estuviera revisado. Este
  documento NO oculta lo no revisado: está listado abajo, con nombre y ticket.

---

## 1. Estado medido ANTES de desplegar

| Medición | Resultado |
|---|---|
| Rama develop vs main | develop 8 commits adelante; único delta de código: TASK-289 (2 archivos de functions/lib + src/composables/usePublicProfileIndex.ts) |
| main vs origin/main | idénticos |
| develop vs origin/develop | idénticos |
| Versión package.json | 1.59.12 en ambas ramas (TASK-289 había entrado sin bump) |
| Functions existentes en functions/ | 17 exports |
| Functions existentes en prod | las mismas 17 — ninguna faltaba por crear |
| Frescura de las functions en prod | 16 de 17 corrían código MÁS VIEJO que el del repo. Sólo queryPublicCardIndex estaba al día (desplegada el 2026-09-15T02:31Z con el fix de TASK-289) |
| Hosting prod | HTTP 200, bundle assets/index-DTAdWei0.js (código de main, es decir, todo menos TASK-289) |
| Tests unitarios | 2375/2375 verdes (181 archivos, 100.7s) |
| Build | `npx vite build` OK |

La frescura se midió comparando el `generation` del zip de fuente de cada function en prod
contra el commit del repo en esa fecha, y diffeando el bloque de cada handler en
`functions/index.js`. Resultado: **4 functions tenían el handler cambiado** (loadCardPage,
loadCollectionChunk, populateScryfallCacheManual, queryCardIndex) y el resto arrastraba
cambios de las librerías compartidas de `functions/lib/`.

---

## 2. Qué se desplegó — FUNCTIONS (deploy manual, el CI nunca despliega functions)

Las 17 functions quedaron desplegadas desde el árbol actual de `develop`, todas con el mismo
hash de fuente `80fe2edf02f772605baf24daaf39e7a7a1e62705` y estado ACTIVE. Se desplegaron en
4 tandas acotadas con `--only functions:<nombres exactos>` (la lección del repo: la cola se
satura si se manda todo junto).

| # | Function | Deploy anterior | Deploy nuevo (UTC) | Qué cambia respecto de lo que corría |
|---|---|---|---|---|
| 1 | queryCardIndex | 2026-08-11 | 2026-09-15T03:01:06Z | Handler cambiado: familia TASK-230/232 (el índice lo escribe el servidor) + TASK-245 |
| 2 | loadCardPage | 2026-05-02 | 2026-09-15T03:01:06Z | Handler cambiado: cambios de agosto sobre card_index |
| 3 | loadCollectionChunk | 2026-05-02 | 2026-09-15T03:01:06Z | Handler cambiado: cambios de agosto sobre card_index |
| 4 | populateScryfallCacheManual | 2026-05-02 | 2026-09-15T03:02:26Z | Handler cambiado |
| 5 | applyCardIndexDelta | 2026-08-19 | 2026-09-15T03:02:49Z | Librerías compartidas de lib/ actualizadas |
| 6 | buildCardIndex | 2026-08-19 | 2026-09-15T03:02:49Z | Librerías compartidas de lib/ actualizadas |
| 7 | cardImage | 2026-08-19 | 2026-09-15T03:02:49Z | Librerías compartidas de lib/ actualizadas |
| 8 | bulkImportCards | 2026-08-27 | 2026-09-15T03:02:49Z | Ya estaba al día en su handler (TASK-286); redeploy por consistencia de fuente |
| 9 | reconcilePublicCardIndex | 2026-08-20 | 2026-09-15T03:03:37Z | **Ver riesgo R1 abajo** — entra el código nuevo de publicCardType/publicCardIndexQuery |
| 10 | queryPublicCardIndex | 2026-09-15T02:31Z | 2026-09-15T03:04:22Z | Ya tenía el fix de TASK-289; redeploy no-op de contenido |
| 11 | moxfieldDeck | 2026-05-02 | 2026-09-15T03:04:22Z | Handler igual; fuente actualizada |
| 12 | notifyMatchUser | 2026-05-02 | 2026-09-15T03:05:00Z | Handler igual; fuente actualizada |
| 13 | refreshMarketData | 2026-05-02 | 2026-09-15T03:05:00Z | Handler igual; fuente actualizada |
| 14 | refreshScryfallCache | 2026-05-02 | 2026-09-15T03:05:54Z | Handler igual; fuente actualizada (scheduled) |
| 15 | updatePlatformStats | 2026-05-02 | 2026-09-15T03:05:54Z | Handler igual; fuente actualizada (scheduled) |
| 16 | fetchPriceMovers | 2026-05-02 | 2026-09-15T03:06:43Z | Handler igual; fuente actualizada (scheduled) |
| 17 | scrapeFormatStaples | 2026-05-02 | 2026-09-15T03:06:42Z | Handler igual; fuente actualizada (scheduled) |

**Tickets cuyo código de functions pasa a EJECUTARSE en prod por primera vez con esta tanda**
(ya estaba en el repo y en main, pero las functions desplegadas eran anteriores): TASK-211,
TASK-213/TASK-214, TASK-230, TASK-232, TASK-241, TASK-245, TASK-247 (todas las tandas y rondas
de revisión), TASK-248, TASK-286, TASK-288/TASK-289. Entre el 2026-05-02 y el 2026-08-01 no
hubo ningún commit en `functions/`, así que todo el delta viene del trabajo de agosto.

---

## 3. Qué se desplegó — HOSTING

- Merge `develop` → `main` con los 8 commits pendientes; push a `main` dispara el CI
  (`deploy-prod`, gated por build + e2e @smoke sobre el bundle de producción).
- Delta de código real hacia prod: **TASK-289** — `src/composables/usePublicProfileIndex.ts`
  (el cliente pide el filtro de tipo por pertenencia múltiple) + los dos archivos de
  `functions/lib` ya desplegados arriba.
- Bump de versión: **1.59.12 → 1.59.13** (patch; TASK-289 es corrección de bug).

Commits promovidos a `main` en este merge:

| Commit | Qué es |
|---|---|
| 2532733 | fix(functions,collection): filtro de tipo del perfil público deja de esconder cartas de tipo múltiple (TASK-289) |
| d8bb642 | fix(collection,functions): cierre de MEDIUM y LOW-1 de la revisión de TASK-289 |
| 6bdd4b7 | docs(state,tasks): TASK-289 cerrado |
| 2dcab17 | docs(knowledge): nodo de decisión de TASK-289 en el grafo |
| 7faa144 | docs(state): pausa — TASK-288 en producción y TASK-289 cerrado |
| 1141dbe | docs(state): constancia del deploy de los 5 tickets aprobados |
| 7cc6110 | docs(state): constancia del deploy de queryPublicCardIndex a prod y medición del nightly rojo |
| 78afc24 | chore(tasks): TASK-290 |

---

## 4. Estado de revisión — CONSTANCIA HONESTA

| Pieza desplegada | Estado de review | Detalle |
|---|---|---|
| TASK-289 (functions + composable) | **Revisado, APROBADO, 0 HIGH** | Reviewer en contexto fresco; MEDIUM y LOW-1 cerrados en d8bb642. UAT contra la function real en dev hecho antes de cerrar el ticket |
| TASK-288 | done (revisado) | Ya estaba en prod |
| TASK-286 (bulkImportCards) | done | Ya estaba desplegado desde 2026-08-27 |
| TASK-185 | **in_review — SIN veredicto** | Su código ya estaba en prod (hosting); ahora además corre en las functions redeployadas |
| TASK-186 | **in_review — SIN veredicto** | Ídem |
| TASK-219 | **in_review — con HIGH conocidos SIN cerrar** | Código en prod. El HIGH sigue abierto; no se cerró en esta tanda |
| TASK-237 | **in_review — SIN veredicto** | Ídem |
| TASK-240 | **in_review — con HIGH conocidos SIN cerrar** | Código en prod. El HIGH sigue abierto |
| TASK-247 / TASK-248 / TASK-245 / TASK-241 / TASK-232 / TASK-230 | cerrados en su momento, pero su código de functions **nunca había corrido en prod** hasta hoy | Es el bloque de mayor superficie nueva en producción de esta tanda |
| TASK-229, TASK-232, TASK-241, TASK-243, TASK-267 | tickets en `in_progress` | Trabajo abierto; lo que ya está commiteado entra, lo que falta no existe |

**Lo más importante para el wargaming:** lo realmente nuevo en ejecución no es TASK-289 (que
es lo único revisado y aprobado), sino **todo el bloque de functions de agosto que llevaba
semanas mergeado pero desplegado a medias**. Ahí es donde hay que apretar.

---

## 5. Qué quedó SIN desplegar, y por qué

| Ítem | Por qué no se desplegó |
|---|---|
| **TASK-282** (addCard reescribe el card_index entero desde el cliente; 20 s por edición) | **No tiene implementación.** Está en `todo`, no hay una sola línea de código. No se inventó nada; queda pendiente de implementar |
| **TASK-290** (reactivar el Nightly E2E recreando la cuenta de prueba en dev) | Ticket en `todo`, sin código. Además es trabajo de DEV, no de prod |
| Vaciado de `public_cards` en dev (602 entradas de índice contra 2202 cartas `public=true`) | Es un problema de DATOS en el proyecto dev, no de código desplegable. No se tocó ningún dato |
| Cierre de los HIGH de TASK-219 y TASK-240 | No es un deploy: es trabajo de review/fix pendiente |
| Reglas de Firestore / índices | Fuera del alcance de la orden; no se tocaron |
| Datos de usuarios reales | No se tocó ni un documento, en dev ni en prod |

---

## 6. Riesgos conocidos que entran a prod con esta tanda (para el wargaming)

- **R1 — reconcilePublicCardIndex es destructivo y está bajo sospecha.** Sus propios logs lo
  señalan como el escritor que dejó `public_cards` en CERO en **dev** el 2026-09-09T11:14:12Z
  (strategy `rebuild-by-id`), dos minutos antes del primer test nocturno rojo. La causa NO
  está diagnosticada. Se redeployó a prod porque la orden fue desplegar todo; **desplegarla no
  la ejecuta** (es callable), pero si alguien la invoca en prod con esa estrategia, el riesgo
  es el mismo que se materializó en dev. Prioridad 1 del wargaming.
- **R2 — 4 handlers cambiaron de golpe** (queryCardIndex, loadCardPage, loadCollectionChunk,
  populateScryfallCacheManual) y son el camino de lectura de la colección. Si hay una
  regresión de lectura/paginado en prod, viene de acá.
- **R3 — los HIGH abiertos de TASK-219 y TASK-240** siguen abiertos con su código en prod.
- **R4 — el card_index tiene dos escritores sin coordinar** (TASK-282, sin arreglar): el
  cliente y el servidor. El síntoma medido son los ~20 s por edición. Sigue vivo en prod.
- **R5 — 2375 tests unitarios verdes NO prueban Firestore:** mockean el SDK. La lección del
  2026-08-27 aplica igual acá — el verde de la suite no es evidencia de que prod funcione.

---

## 7. Verificaciones hechas después del deploy

| Verificación | Resultado |
|---|---|
| `firebase functions:list --project cranial-trading` | 17/17 ACTIVE, las 17 con el mismo hash de fuente `80fe2edf` (= fuente actual del repo) |
| cardImage (https), petición sin parámetros | HTTP 400 `{"error":"Invalid image request"}` — el contenedor arranca y valida; no escribe nada |
| queryPublicCardIndex (callable), payload vacío | HTTP 400 INVALID_ARGUMENT con el mensaje de validación de userId — arranca y valida |
| queryPublicCardIndex con un userId inexistente | HTTP 200, respuesta bien formada con las 8 facetas de tipo (la superficie de TASK-289), sin tocar datos |
| Hosting prod antes del merge | HTTP 200 |
| Tests unitarios | 2375/2375 verdes |
| Build | OK |

Verificación de hosting posterior al merge: el CI de `main` publica el bundle; ver la sección
de cierre del reporte de sesión para el hash del bundle nuevo.

---

## 8. Cómo revertir

- **Functions:** `git checkout <commit-anterior> -- functions/` y redeploy acotado con
  `firebase deploy --only functions:<nombre> --project cranial-trading`. Los deploys previos
  quedan como revisiones en Cloud Run y también se pueden reactivar desde la consola.
- **Hosting:** rollback desde Firebase Hosting (release anterior) o revert del merge en `main`
  y push (el CI vuelve a publicar).
