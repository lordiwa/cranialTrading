# Plan — rediseño sostenible del `card_index` (v3)

Estado: PROPUESTA. Nada implementado. Nada decidido.
v3 reescribe el plan entero sobre tres mediciones nuevas del 2026-08-12. v1 y v2 quedaron obsoletos; lo que resultó falso está en §10.

---

## 0. Convención

- **MEDIDO** — número y experimento.
- **LEÍDO** — código, con `archivo:línea`. Traza el mecanismo, **no** afirma causa.
- **SUPUESTO** — sin respaldo. No justifica una acción; justifica una medición.

---

## 1. Lo que se midió hoy (y no estaba antes)

### 1.a — La divergencia es estable, no transitoria

Dos corridas de `scripts/card-index-fixture.mjs --status` sobre la cuenta de 59k (dev, `jV6gJqf3csPA4vRfO2k9Vb5ejYo2`), separadas por varios minutos, dieron **resultado idéntico, los mismos tres ids**:

```
Documentos: 59203    Índice: 59204   (30 chunks)
estado distinto: 0    solo en documentos: 1    solo en índice: 2
```

- 2 **fantasmas** (`a8HiqJEJQZzeKMSao7lG`, `hXWlz2ozBX5AzsIQQQVO`): se ven en la grilla, el documento no existe.
- 1 **invisible** (`quEpipOARRfvcT6lpVPL`): el documento existe, la grilla no la muestra.
- Las tres son "Lightning Bolt", la carta que usan los tests E2E para agregar y borrar.

**Qué establece esto:** la divergencia **no converge sola**. Confirma TASK-208 y cierra la duda que había quedado abierta el 2026-08-11 sobre si convergía o la limpiaba un rebuild. Y descarta las tres firmas conocidas: no hay estados distintos (no es el bulk a medias de TASK-206/207), no faltan chunks ni hay tramo contiguo (no es la limpieza de huérfanos de TASK-168).

**Lo más importante:** este residuo **no dispara ningún mecanismo de reparación**, porque el índice *parece sano* — contiguo, sin duplicados, sin truncar (`collection.ts:588-615`). Es el caso que hoy nadie repara. — MEDIDO.

**Salvedad:** dos corridas separadas por minutos prueban que no converge en esa ventana, no que sea permanente. Y es la cuenta del CI, que E2E ensucia a propósito. Falta la misma medición sobre la cuenta de Rafael.

### 1.b — Un rebuild completo es caro

Para 59.000 cartas: **59.000 a 118.000 lecturas** de documento (las cartas paginadas de a 2000, más el cruce con `scryfall_cache`) para producir **30 escrituras** (~12 MB). A US$0,06 por 100.000 lecturas: **~US$0,035-0,07 por rebuild**. — MEDIDO/calculado, `functions/index.js:981-1032,1065-1076`.

**Consecuencia:** un servidor que reconstruya ante cada cambio es inviable. Un reconciliador ingenuo que recorra todo, también: ~US$0,035 por usuario por corrida ≈ **US$35 por corrida con 1.000 usuarios de este tamaño**.

### 1.c — El servidor no puede actualizar un chunk suelto

El cliente sí puede (TASK-219): tiene el índice entero en memoria y conoce la posición de cada carta. El servidor no: la posición sale de ordenar **toda** la colección por id (`functions/index.js:986`), recalculada desde cero en cada corrida. **No existe ningún mapa persistido `cardId → chunk`.** — LEÍDO.

Este es el hallazgo que define el rediseño.

---

## 2. El defecto de fondo, ahora preciso

v1 decía "una copia sin dueño, sin atomicidad y sin reconciliación". Es cierto, pero es el síntoma. La causa mecánica es más específica:

> **El índice se arma por POSICIÓN. La carta número N vive en el chunk `floor(N/2000)`.**

De ahí salen las cuatro consecuencias, todas:

| Consecuencia | Por qué |
|---|---|
| Agregar o borrar desplaza todo | Cambia el N de todas las cartas siguientes → todos los chunks desde ahí cambian |
| Nadie puede tocar un chunk sin tener el array entero | La posición no se puede calcular sin conocer a todas las demás cartas |
| Por eso el índice lo escribe el cliente | Es el único que tiene el array completo cargado |
| Por eso reconciliar cuesta 59.000 lecturas | Para saber qué debería tener el chunk 7, hay que ordenar toda la colección |

**La escritura la hace el cliente no por decisión de diseño, sino porque el formato no deja hacerla en otro lado.**

---

## 3. El rediseño propuesto: colocación estable

**Que el chunk de cada carta salga de su propio id, no de su posición.** Por ejemplo `chunk = hash(cardId) % N`.

Tres piezas, en orden:

### 3.a — El chunk se calcula desde el id de la carta

Ni el cliente ni el servidor necesitan el array completo para saber qué chunk tocar. Un cambio de estado toca **un** chunk, siempre, sin leer nada más.

**Por qué se puede hacer sin romper nada:** el orden de las cartas dentro de los chunks **no se usa para nada de lo que ve el usuario** — `queryCardIndex` filtra y ordena del lado servidor sobre el índice expandido (`queryCardIndexHelpers.ts:93-250`), y `expandIndexCards` aplana los chunks en el orden que venga (`:93-103`). — LEÍDO, ya verificado dos veces.

### 3.b — El número de chunk se guarda en el documento de la carta

Un campo más en `users/{uid}/cards/{cardId}`. Habilita lo que hoy es imposible: **reconciliar de a un chunk**. Con `where chunkId == 7` se leen ~2.000 documentos en vez de 59.000.

### 3.c — El servidor pasa a ser el dueño, y reconcilia rotando

- El cliente escribe **solo cartas**. Nunca el índice.
- El servidor actualiza el chunk correspondiente.
- Un `onSchedule` reconcilia **un chunk por corrida**, rotando. Cubre la colección entera en 30 vueltas, a ~2.000 lecturas cada una.

**Ese reconciliador es lo único que repararía las tres cartas medidas en §1.a.**

---

## 4. Qué arregla y qué no

Las cuatro preguntas de Rafael, contestadas de frente:

| | Veredicto |
|---|---|
| **Que el cambio se aplique** | **Sí.** De mover ~30 MB a ~400 KB. |
| **Que se mantenga** | **Sí, pero solo con §3.c.** La colocación estable achica la ventana de pérdida; **eliminarla exige que el cliente deje de escribir el índice.** Con la escritura en el navegador, si la pestaña muere en el momento justo, se pierde igual — el `catch` de recuperación vive dentro del contexto que muere (`collection.ts:1087,1167-1182`). |
| **Que se recupere solo** | **Sí, y es lo nuevo.** El reconciliador rotativo levanta fantasmas e invisibles sin intervención. Hoy no existe nada que lo haga. |
| **Que el buscador siga funcionando** | **No se rompe. Tampoco mejora.** Sigue leyendo los mismos 30 chunks: los 9-11 s quedan intactos. |

---

## 5. El buscador (declarado, no resuelto)

Es la espina dorsal de la app y este plan **no lo toca**. Que quede escrito para que nadie lo lea como resuelto:

- La búsqueda por nombre es **por substring** (`c.n.toLowerCase().includes(q)`, `queryCardIndexHelpers.ts:117-119`). Firestore no sabe hacer substring, solo prefijo. Rafael ya descartó el prefijo: tiene que ser tan fácil de buscar como ahora. **Por lo tanto el índice tiene que seguir existiendo** — no es negociable, y por eso el plan es "arreglar el índice", no "eliminarlo".
- `queryCardIndex` lee el índice **entero** en cada llamada: **9-11 s planos**, sin importar `pageSize`, profundidad, filtro ni orden. Control con cuenta vacía: 262-271 ms. — MEDIDO, TASK-204.
- La colocación estable no cambia eso ni para bien ni para mal: mismos 30 chunks, misma lectura.

Lo que sí hace este plan por el buscador: **le da un índice que no miente.** Un buscador rápido sobre datos divergentes devuelve fantasmas rápido.

---

## 6. Riesgos, y lo que no se toca

- **Reparto disparejo.** Un hash puede no repartir parejo y dejar un chunk cerca del límite de 1 MiB por documento. — SUPUESTO: con 59k cartas y hash decente el reparto debería ser uniforme, pero **hay que medirlo antes**, no después.
- **Colecciones de 100k+.** Con N fijo, los chunks crecen con la colección. El 30% del mercado tiene 100k+ cartas y nunca se probó. **N tiene que poder crecer, y ese redimensionado hay que diseñarlo** — es el punto donde este diseño puede romperse feo.
- **Retraso en los paneles secundarios.** `cards.value` **se deriva** del índice (`collection.ts:630`) y de ahí comen las stats de mazos (10 sitios en `stores/decks.ts`), las de carpetas (5 en `binders.ts`), los chips por estado y la deduplicación de wishlist. Si el índice pasa a llegar con retraso, esos paneles quedan atrasados. **La grilla no**: ya se pinta desde `queryCardIndex` y su parche optimista muta el array en memoria, independiente de la escritura del índice (`:1251-1253,1294-1305,1520-1523`).
- **No se toca** el guard `indexKnownComplete` (`:473`) ni el borrado descendente y en serie de huérfanos (`:1153-1157`) mientras el formato viejo siga vivo: son los candados de TASK-168, el ticket con pérdida de datos real.
- **`f6b68a3` sigue sin revisar.** Se revisa o se revierte antes de construir encima.

---

## 7. Migración

- El mecanismo ya existe: `INDEX_VERSION` (`functions/index.js:886`, hoy en 3) con auto-rebuild del cliente cuando el índice está viejo (`collection.ts:650-664`). Un bump migra a cada usuario en su próxima carga, sin script masivo.
- **El backfill del `chunkId` en los documentos sí es masivo** y hay que planificarlo aparte, con el orden que ya aprendimos en TASK-169: **código primero, datos después**.
- **Punto de no retorno:** mientras convivan los dos formatos, hay dos verdades sobre dónde vive una carta. Esa ventana hay que acotarla explícitamente.

---

## 8. Cómo se verifica

1. **Divergencia:** `--status` antes y después, repetido **a lo largo de horas**, no una vez.
2. **Que el reconciliador repare de verdad:** plantar divergencia conocida con `--break` y verificar que la levanta solo. Es el único AC que prueba autocuración.
3. **Escritura:** tiempo de la **segunda** operación tras un cambio de estado, 3 corridas por brazo, app real, cuenta grande. Es el AC5 de TASK-219, todavía sin hacer.
4. **Buscador, control negativo obligatorio:** tiene que salir **igual** que antes. Si mejora o empeora, algo no entendí.
5. **Reparto de chunks:** medir el tamaño de cada chunk tras la migración, contra el límite de 1 MiB.
6. **En el navegador:** que borrar borre y que cambiar de estado se mantenga.

---

## 9. Hallazgos aparte (tickets propios, no son este plan)

1. **`buildCardIndex` no tiene lock, ni transacción, ni idempotencia** (`functions/index.js:955-1102`). Dos invocaciones del mismo usuario en paralelo pueden dejar un índice mezclado de dos corridas, y —peor— si una calculó 29 chunks y la otra 30, **una puede borrar el chunk que la otra acaba de escribir**: la clase de pérdida de datos de TASK-168, sin candado. **Riesgo vivo hoy**, independiente del rediseño.
2. **`public_cards` es una segunda copia derivada** con el mismo defecto, escrita **directo por el cliente a Firestore** sin pasar por ninguna Cloud Function (`services/publicCards.ts:133-148`), consumida por 15 archivos. Camino independiente del índice.
3. **TASK-217** sigue abierto y es más grave que todo esto: cualquier usuario con cuenta puede leer, editar, borrar e inyectar mensajes privados ajenos.

---

## 10. Lo que las versiones anteriores afirmaban y era falso

1. *"C pura: eliminar el índice."* Cae — la búsqueda es substring y Firestore no la puede hacer. Rafael además descartó el prefijo.
2. *"Los campos enriquecidos no están en el documento de la carta."* Falso: están (`functions/index.js:438-443`); el cruce con `scryfall_cache` es fallback.
3. *"Elimina la clase entera de divergencia."* Sobreventa: `public_cards` es una segunda copia con el mismo defecto.
4. *"Ningún parche del cliente puede arreglarlo."* Presentado como concluyente sin serlo; lo que cierra la puerta es multi-pestaña, no el fire-and-forget.
5. *"El servidor ya sabe hacerlo, solo hay que apoyarse en él."* Falso, y es el error más caro: el servidor **no puede** actualizar un chunk suelto (§1.c), y su rebuild completo cuesta 59k-118k lecturas.

Ninguna de las cinco la habría atrapado un test. Las cinco salieron de revisión de contexto fresco o de medir.

---

## 11. Lo que sigue sin resolver

- **La velocidad del buscador** (§5). Sin plan.
- **El redimensionado de N** para colecciones de 100k+ (§6).
- **La forma de la divergencia en la cuenta de Rafael** — falta su uid.
- **Este plan no está revisado.** v1 perdió cuatro afirmaciones en la primera revisión fresca; no hay motivo para pensar que v3 sea distinto.
