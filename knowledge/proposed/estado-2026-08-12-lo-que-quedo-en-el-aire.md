# Lo que quedó en el aire — registro al 2026-08-12

Estado real leído de `tasks/index.json`, no de memoria. **205 tickets**: 105 cerrados, 83 por hacer, 12 en revisión, 4 en curso, 1 bloqueado.

---

## A. Lo más urgente: 16 tickets parados a mitad de camino

**12 en `in_review`** — trabajo hecho que nunca se cerró. Cada uno consume una decisión pendiente y ensucia la cuenta de qué está realmente vivo:

| Ticket | Qué es | Qué falta |
|---|---|---|
| TASK-182, TASK-184 | críticos, arranque de /inicio | Cerrar: shippeados y verificados en v1.57.0 |
| TASK-183, TASK-178, TASK-172 | header diferido, peso del bundle, reCAPTCHA | TASK-172 espera **tu UAT**: probar login con Google |
| TASK-185 | crítico — borrar durante la carga no borraba | Espera **tu UAT**, van cinco sesiones |
| TASK-188 | crítico — email de usuarios sin sesión | **Falta la migración en PROD** (134 cuentas de prueba) |
| TASK-192, TASK-196 | precios con tipo raro, import con NaN | Cerrar |
| TASK-215 | 11 subcolecciones abiertas | **Recién ahora quedó pusheado.** Se puede cerrar |
| TASK-186 | crítico — Estrategia A del wargaming | Ejecutada; falta cerrar formalmente |
| TASK-219 | crítico — porciones sucias del card_index | Revisado ✅. **Falta el AC5: la medición en la app real** |

**4 en `in_progress`** — abiertos sin nadie trabajando: TASK-153 (grilla tarda 20-27 s), TASK-155 (editar y recargar pierde el índice), TASK-166 (7 s sin causa en /inicio), TASK-175 (recuadros de carga feos).

**1 bloqueado:** TASK-146 (editar y borrar una carta sin cobertura real, demostrado por mutación).

> **Recomendación:** una tanda de cierre antes de arrancar el rediseño. Son decisiones de 1 minuto cada una, y hoy tapan la señal de qué está vivo.

---

## B. La familia del card_index: qué cubre el plan y qué NO

Esta es la parte que pediste verificar. **Sí cubre:**

| Ticket | Cómo lo cubre |
|---|---|
| TASK-176 — reescribir 30 porciones por una carta (10-58 s) | Colocación estable: una carta = un chunk |
| TASK-208 — el índice diverge y no converge | El reconciliador rotativo. **Medido hoy: 2 fantasmas + 1 invisible, estables entre dos corridas** |
| TASK-155 — editar y recargar pierde la actualización | El servidor como dueño: ya no muere con la pestaña |
| TASK-222 — escritura angosta vs. rebuild de la Cloud Function | Un solo escritor elimina la ventana |
| TASK-223 — curarse ante `not-found` | Complementario, y va primero |
| TASK-141 — `batchUpdateCards` no atómico entre chunks | Parcial: un solo escritor reduce la ventana, no la cierra |

**NO cubre — y esto es el hueco honesto del plan:**

| Ticket | Por qué queda afuera |
|---|---|
| **TASK-204** — cada página cuesta 9-11 s sin importar qué pidas | El plan **no toca la lectura**. Declarado explícitamente |
| **TASK-187** — `queryCardIndex` falla con 'internal' y deja la grilla vacía | Parcheado a 2 GiB como paliativo. Sigue abierto |
| **TASK-153** — 20-27 s hasta la primera fila con 41k cartas | Es costo de lectura y render, no de escritura |
| **TASK-206 / TASK-207** — la acción masiva se aplica a medias y devuelve `ok: true` | El motor miente sobre su propio resultado. Es otro defecto |
| **TASK-209** — paginar mientras se muta pierde y duplica cartas | Roza el punto 4 del plan (señal de frescura) pero no lo resuelve |
| **TASK-205** — "Select all" ignora todos los filtros menos el estado | Defecto de la UI, no del índice |
| **TASK-221** — mutar durante la carga tira el efecto sobre el índice en silencio | Detectado durante la revisión de TASK-219, sin atacar |
| **TASK-220** — los 4 candados de TASK-185 fallan bajo carga | Deuda de infraestructura de tests |

---

## C. Seguridad: lo que sigue abierto y no es del rediseño

1. **TASK-217 (crítico, sin empezar).** Cualquier usuario con cuenta puede **leer, editar, borrar e inyectar** mensajes privados de conversaciones ajenas. Primera vez en toda la familia que se puede **falsificar lo que otra persona dijo**. Sale de leer las reglas; el ataque no se ejecutó. **Es lo más grave que hay abierto.**
2. **TASK-169 / TASK-210 (críticos).** La colección `/users` se puede enumerar entera sin sesión.
3. **TASK-188.** Falta la migración de emails en PROD (134 cuentas, todas de prueba).
4. **TASK-087.** La regla de `users/{uid}/cards` marcada como todo pese a haberse cerrado — verificar si es residuo.

---

## D. Hallazgos de HOY que todavía no son ticket

1. **`buildCardIndex` sin lock ni transacción.** Dos invocaciones del mismo usuario en paralelo pueden dejar un índice mezclado de dos corridas, y si una calculó 29 chunks y la otra 30, **una borra el chunk que la otra acaba de escribir**. La clase de pérdida de datos de TASK-168, sin candado. **Riesgo vivo hoy.** → falta ticket
2. **`public_cards` es una segunda copia derivada** con el mismo defecto: la escribe el cliente directo a Firestore, sin Cloud Function, sin reconciliación, y la consumen 15 archivos. → falta ticket
3. **`batchDeleteCards` y `batchUpdateCards` nunca consultan el gate de carga en vuelo** (lo levantó la revisión de `f6b68a3`). Un borrado masivo durante una carga fallida sigue pudiendo persistir un índice casi vacío. Preexistente. → confirmar si TASK-220 lo cubre, o ticket
4. **`App.test.ts` flakea en corridas completas** ("never calls preloadPriceData() on mount"), pasa en aislado. Va a rojear el CI en algún momento. → falta ticket
5. **Tu cuenta de dev tiene 59.081 cartas, no 5.600.** El dato viejo estaba mal y ya causó una falsa alarma. **Son dos cuentas grandes, no una grande y una chica.**

---

## E. Deuda de higiene (nada urgente)

- **9 worktrees huérfanos** del 16 de julio, todos limpios. Ojo al borrarlos: mal hecho se lleva puesto el `node_modules` del árbol principal.
- **4 stashes viejos** que nadie reclama.
- **TASK-224 / TASK-225** abiertos hoy: el ticket huérfano bajo `public/` y sacar `cranial-design` a su propio repo (hoy **sin respaldo en ningún remoto**).

---

## F. Preguntas viejas sin responder que siguen bloqueando

- **TASK-173:** el archivo propio de precios, ¿en Cloud Storage o en Hosting? ¿Cada cuánto se regenera? ¿Qué ve el usuario mientras no existe? **Bloquea el ticket entero.**
- **TASK-180:** ¿las cuentas de 200k son de gente que ya usa la app o de gente que querés que la use?
- **TASK-192:** ¿querés igual la invalidación del caché de precios? Se recomendó que no.
- Los 5 Epics vacíos y los 9 tickets de QA manual sin responsable: ¿borrar, automatizar o dejar?
- El MCP de TestSprite sigue instalado y las notas dicen que está retirado.
- `amber` no existe en `tailwind.config.js` pero `DeckCardsList.vue` y `DeckEditorGrid.vue` lo usan: esas clases son no-ops hoy.
- Los `.toFixed(2)` crudos sobre `card.price` en 6 plantillas: misma clase que TASK-192, otro origen.

---

## G. Verificación de completitud del plan grande

**Lo que el plan promete arreglar:** que cambiar el estado cambie el estado, que borrar borre, que se mantenga, y que se recupere solo. Sobre eso, cubre los tickets de la primera tabla de §B.

**Lo que el plan NO promete, y no hay que leer de más:**

1. **La velocidad del buscador** (TASK-204, TASK-153, TASK-187). Declarado.
2. **La honestidad del motor masivo** (TASK-206/207): que devuelva `ok: true` habiendo escrito a medias es un defecto propio.
3. **`public_cards`**, la segunda copia derivada.
4. **Nada de seguridad.** TASK-217 sigue siendo lo más grave abierto.

**El hueco más importante:** el plan arregla la **corrección** del índice y no toca su **costo de lectura**. Si el buscador es la espina dorsal, ese costo necesita su propio plan — y hoy no existe.
