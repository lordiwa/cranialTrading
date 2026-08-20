# Backups y PITR en Firestore — opciones, coste y decisión

**Fecha: 2026-08-19. Autor: researcher. Continúa `docs/discusion-backups-y-salvaguardas.md` (2026-08-18).**
La decisión de activar backups + PITR en los dos proyectos ya está tomada por Rafael. Este documento
es el **cómo**, con números medidos.

Convención de etiquetas: **MEDIDO** = lo ejecuté contra los proyectos reales hoy. **LEÍDO** =
documentación oficial, con URL. **SUPUESTO** = cálculo o inferencia mía.

---

## RECOMENDACIÓN EN TRES LÍNEAS

1. **Activá PITR en los dos proyectos ya** (`--point-in-time-recovery ENABLED`): es lo único que
   cubre el escenario TASK-245 (bug propio detectado 1-3 días después) y cuesta **$0,13/mes en prod
   y $0,75/mes en dev** con el tamaño real de hoy. MEDIDO + LEÍDO.
2. **Sumá backups programados diarios** (retención 7 d en ambos) y **semanales de 14 semanas solo en
   prod**: eso cubre lo que PITR no cubre, que es detectar el daño después del día 7. Total de todo
   el paquete: **≈ $2,3/mes**. SUPUESTO (cálculo mío sobre precios y tamaños medidos).
3. **Activá también la protección contra borrado** (`--delete-protection ENABLED`, gratis) y hacé un
   `firestore export` manual antes de vaciar dev. Hoy los dos proyectos están **sin PITR, sin
   backups y sin protección de borrado**. MEDIDO.

---

## AVISOS FUERTES, ANTES DE TOCAR NADA

- **PITR no es un botón reversible sin coste.** La documentación dice literalmente: *"You cannot read
  PITR data in the PITR window after you disable PITR"* y *"Re-enabling PITR after disabling it
  deletes previous PITR data"*. Si lo apagás, perdés la ventana entera; si lo volvés a prender,
  arrancás de cero. También: *"You cannot read PITR data immediately after enabling it"* — la
  ventana se construye desde el momento de activarlo, no hacia atrás. LEÍDO
  ([use-pitr](https://firebase.google.com/docs/firestore/use-pitr)).
- **PITR cuesta casi lo mismo que toda tu base otra vez.** En Santiago el almacenamiento normal es
  $0,215/GiB-mes y PITR es **$0,215/GiB-mes**, exactamente el mismo precio. Es decir: activar PITR
  **duplica la línea de almacenamiento** de Firestore. Hoy eso son centavos porque la base es chica;
  a 50 GiB serían $10,75/mes extra. MEDIDO (Cloud Billing Catalog API, SKUs `Cloud Firestore
  Point-in-time Recovery Storage Santiago` / `North America 5`).
- **La ventana de PITR es fija en 7 días. No es configurable.** LEÍDO
  ([PITR overview](https://cloud.google.com/firestore/docs/pitr)). Si un bug se detecta el día 8,
  PITR ya no sirve. Por eso los backups programados no son opcionales.
- **Una restauración NUNCA sobrescribe la base existente.** *"A restore operation writes the data
  from a backup to a new Cloud Firestore database"* y no se puede usar un ID de base ya existente.
  LEÍDO ([backups](https://firebase.google.com/docs/firestore/backups)). Esto es bueno: no hay forma
  de "volver todo atrás y perder lo que hicieron los usuarios" por accidente. Pero implica que la
  reparación parcial siempre es *restaurar al lado, comparar, y copiar de vuelta*.
- **Nada de esto respalda Firebase Auth ni Cloud Storage.** Los backups de Firestore son solo de
  Firestore. Las cuentas de usuario necesitan `firebase auth:export` aparte. LEÍDO + SUPUESTO (no
  encontré ninguna mención de Auth en la documentación de backups de Firestore, que es coherente con
  que sean servicios distintos).
- **Los backups viven en la misma ubicación que la base de origen** (*"A backup resides in the same
  location as the source database"*, LEÍDO). No sirven como protección ante la pérdida de una región
  entera. Para eso hace falta `export` a un bucket de otra región.

---

## Estado actual, medido hoy (2026-08-19)

MEDIDO con `gcloud firestore databases describe` sobre los dos proyectos:

| | `cranial-trading` (PROD) | `cranial-trading-dev` (DEV) |
|---|---|---|
| Ubicación | `southamerica-west1` (Santiago, **región única**) | `nam5` (multi-región EE.UU.) |
| Edición | STANDARD | STANDARD |
| PITR | **DISABLED** (`versionRetentionPeriod: 3600s` = 1 h) | **DISABLED** (1 h) |
| Backups programados | **ninguno** | **ninguno** |
| Protección de borrado | **DISABLED** | **DISABLED** |
| Creada | 2025-10-22 | 2026-03-11 |

**Tamaño real de las bases** — este era el dato que faltaba en la discusión del 18/08. MEDIDO vía
Cloud Monitoring, métrica `firestore.googleapis.com/storage/data_and_index_storage_bytes`,
muestra de 2026-08-19 18:18 UTC:

- **PROD: 630.178.571 bytes = 0,587 GiB** (datos + índices)
- **DEV: 4.501.109.636 bytes = 4,192 GiB**

Dev es **7 veces más grande que prod**, y es esperable: es donde vive la cuenta de CI de 59k cartas.
La producción entera pesa menos de 1 GiB. Esto cambia la conversación: el coste de respaldar prod
hoy es despreciable, y va a seguir siéndolo hasta que la app tenga usuarios de verdad.

Nota de honestidad: no encontré la ubicación de prod discutida en ningún lado del repo.
**PROD está en región única (Santiago), no en multi-región.** Eso significa que hoy no hay
redundancia entre regiones para producción. No es parte de este ticket, pero conviene saberlo.

---

## Tabla de opciones

Precios **MEDIDOS** contra la Cloud Billing Catalog API (`services/EE2C-7FAC-5E08`, "Cloud
Firestore"), que es la fuente autoritativa de la que se genera la página de precios. Las páginas
`cloud.google.com/firestore/pricing` renderizan la tabla con JavaScript y no se pueden leer con
WebFetch — por eso fui a la API. Coinciden con la tabla de
[firebase.google.com/docs/firestore/enterprise/pricing](https://firebase.google.com/docs/firestore/enterprise/pricing)
(Standard: PITR $0,00020/GiB-hora ≈ $0,146/GiB-mes; backup $0,00004/GiB-hora ≈ $0,029/GiB-mes;
restore $0,20/GiB), que da los precios de la región base y no los de Santiago.

**Precios por GiB-mes, por región:**

| Concepto | Santiago (PROD) | nam5 (DEV) |
|---|---|---|
| Almacenamiento normal | $0,215 | $0,180 |
| **PITR** | **$0,215** | **$0,180** |
| **Backup** | **$0,043** | **$0,030** |
| Restore (una vez, por GiB) | $0,286 | $0,400 |

Un backup ocupa el tamaño completo de la base en el momento en que se tomó — no es incremental.
LEÍDO: *"The storage size for a backup is equal to the storage size of the database when the backup
was taken"*. Con retención de N días y frecuencia diaria, mantenés N copias vivas a la vez.
**El multiplicador dominante del coste es la retención, no PITR.**

| Mecanismo | Retención | Coste hoy (prod / dev) | Cubre | NO cubre |
|---|---|---|---|---|
| **Nada** (estado actual) | 1 h | $0 | nada | todo |
| **PITR** | **7 días, fijo** | **$0,13 / $0,75 al mes** | bug propio detectado en ≤7 días; borrado accidental reciente; comparar "cómo estaba el martes" con granularidad de **1 minuto** | daño detectado el día 8+; pérdida de la región; Auth |
| **Backup diario, retención 7 d** | 7 copias vivas | $0,18 / $0,88 al mes | lo mismo que PITR pero con granularidad de 1 día | granularidad fina; día 8+ |
| **Backup diario, retención 30 d** | 30 copias | $0,76 / $3,77 al mes | daño detectado hasta 30 días después | día 31+; región |
| **Backup semanal, retención 14 sem** (máximo) | 14 copias | $0,35 / $1,76 al mes | daño viejo, hasta 3,5 meses atrás | granularidad (solo 1 punto por semana) |
| **Export manual a GCS** | la que quieras, es un archivo | ~$0,02/GiB-mes de Cloud Storage + 1 lectura por documento | archivo frío, otra región, otro proyecto, antes de un borrado masivo | no es automático; hay que acordarse |

**El paquete que recomiendo:**

| Proyecto | Configuración | Coste/mes hoy |
|---|---|---|
| PROD | PITR + diario 7 d + semanal 14 sem | **$0,66** |
| DEV | PITR + diario 7 d | **$1,63** |
| | **Total** | **≈ $2,29/mes** |

SUPUESTO (cálculo mío: tamaño medido × precio medido × número de copias). Fórmula para reproyectarlo
cuando la base crezca — **coste mensual por GiB en prod con esta configuración = $0,215 (PITR) + 21 ×
$0,043 (21 copias) = $1,12 por GiB-mes**. A 10 GiB serían $11/mes; a 50 GiB, $56/mes. Si eso llega a
molestar, la palanca es bajar la retención semanal, no apagar PITR.

Dev además va a encoger cuando se vacíe la base, así que su $1,63 es un techo temporal.

**Lo que NO pude dimensionar**, y lo digo explícitamente: la métrica
`data_and_index_storage_bytes` no distingue datos de índices, ni por colección. No sé qué fracción
de los 4,19 GiB de dev es `card_index` derivado (que no haría falta respaldar) ni cuánto son cartas
reales. Para saberlo habría que exportar por `--collection-ids` y medir el tamaño del export en GCS,
o mirar el desglose por colección en la consola de Firestore (pestaña Usage). No lo hice.

---

## Comandos para activarlo — listos para copiar y pegar

**NO los ejecuté.** El `gcloud` instalado en esta máquina es la **432.0.0 (mayo 2023)** y **no tiene
el grupo `firestore backups` ni `databases clone`** — lo verifiqué, devuelve error. MEDIDO. Pero el
`firebase-tools` del repo es **14.24.0 y sí los tiene todos** (MEDIDO: `firestore:backups:*`,
`firestore:databases:restore`, `firestore:databases:clone`, `--point-in-time-recovery`,
`--delete-protection`). Por eso doy los comandos con la CLI de Firebase, que ya funciona, y dejo los
de gcloud como alternativa para cuando se corra `gcloud components update`.

### 1. PITR + protección de borrado (los dos proyectos)

```bash
# PROD
npx firebase --project cranial-trading firestore:databases:update '(default)' \
  --point-in-time-recovery ENABLED
npx firebase --project cranial-trading firestore:databases:update '(default)' \
  --delete-protection ENABLED

# DEV
npx firebase --project cranial-trading-dev firestore:databases:update '(default)' \
  --point-in-time-recovery ENABLED
npx firebase --project cranial-trading-dev firestore:databases:update '(default)' \
  --delete-protection ENABLED
```

Equivalente con gcloud actualizado:
`gcloud firestore databases update --project=cranial-trading --database='(default)' --enable-pitr`
y `--enable-delete-protection`.

Verificación (debe pasar a `versionRetentionPeriod: 604800s`):
```bash
gcloud firestore databases describe --database='(default)' --project=cranial-trading --format=json
```

Ojo con `--delete-protection ENABLED` en dev: **impide borrar la base entera**, no impide borrar
documentos. No estorba al plan de vaciar dev por colecciones; sí estorbaría si el plan fuera borrar
y recrear la base — en ese caso hay que desactivarla primero, a propósito, que es justamente el
punto.

### 2. Backups programados

```bash
# PROD: diario a 7 días
npx firebase --project cranial-trading firestore:backups:schedules:create \
  --database '(default)' --recurrence DAILY --retention 7d

# PROD: semanal a 14 semanas (98 días = el máximo documentado)
npx firebase --project cranial-trading firestore:backups:schedules:create \
  --database '(default)' --recurrence WEEKLY --day-of-week SUNDAY --retention 98d

# DEV: diario a 7 días
npx firebase --project cranial-trading-dev firestore:backups:schedules:create \
  --database '(default)' --recurrence DAILY --retention 7d
```

- Máximo de retención: **14 semanas** (`8467200s`). LEÍDO
  ([backups](https://firebase.google.com/docs/firestore/backups)). **El mínimo no lo encontré
  documentado**; la ayuda de la CLI acepta duraciones tipo `12h` o `30d` sin declarar un piso. Si
  hace falta saberlo con certeza, hay que mirarlo en la referencia de la API
  `firestore.projects.databases.backupSchedules` o probarlo en dev.
- **Máximo un schedule diario y uno semanal por base.** LEÍDO.
- Verificar: `npx firebase --project cranial-trading firestore:backups:schedules:list --database '(default)'`
- Listar backups ya tomados: `npx firebase --project cranial-trading firestore:backups:list --location southamerica-west1`
  (para dev, `--location nam5`).

### 3. Export manual antes de un borrado masivo (la red del plan de limpieza de dev)

```bash
gcloud firestore export gs://BUCKET/dev-prewipe-$(date -u +%Y%m%dT%H%M%SZ) \
  --project=cranial-trading-dev --database='(default)'
```

Cuesta **una lectura por documento exportado** (LEÍDO: *"Export operations incur one read operation
per document exported"*), más el almacenamiento en GCS. Con 59k cartas en una sola cuenta, eso no es
gratis pero sí barato. El bucket debe estar en la misma ubicación que la base.

---

## Restauración parcial, paso a paso, para el escenario TASK-245

El escenario: un bug propio vació el campo X en muchos documentos de `card_index` en cuentas de
producción; se detecta 1-3 días después; el resto de la base siguió cambiando y **no se puede
revertir globalmente**.

### Camino A — el daño tiene ≤7 días y PITR estaba activo. Es el bueno.

**A.1 — Lectura obsoleta directa, sin restaurar nada.** Es lo más limpio y lo que yo haría primero.
El SDK de servidor de Node.js puede leer la base *tal como estaba* en un instante pasado dentro de la
ventana de PITR, usando `readTime` en una transacción de solo lectura. LEÍDO
([use-pitr](https://firebase.google.com/docs/firestore/use-pitr): *"Server client libraries (Java,
Node.js, Go, PHP) using read-only transactions"*, y REST con parámetro `readTime`). El SDK web/móvil
**no** puede.

Procedimiento: un script `firebase-admin` que, para cada documento dañado, lee la versión de hace N
días con `readTime`, compara campo a campo con la versión viva, y **escribe de vuelta solo los
campos que el bug destruyó** — nunca el documento entero, porque el documento entero revierte los
cambios legítimos que el usuario hizo desde entonces. Restricción: el timestamp debe ser un **minuto
exacto**, en el pasado, y no anterior a `earliestVersionTime`. LEÍDO.

Esto no requiere crear ninguna base nueva, no cuesta restore, y es reversible por definición porque
solo escribe lo que decidas.

**A.2 — Clonar a una base paralela y comparar.** Si el daño es masivo o querés inspeccionar antes de
escribir nada:

```bash
# 1. Clonar producción tal como estaba el 16/08 a las 03:00 UTC, a una base nueva del MISMO proyecto
npx firebase --project cranial-trading firestore:databases:clone \
  '(default)' 'repair-20260819' --snapshot-time '2026-08-16T03:00:00Z'
```
El destino se crea en la misma ubicación que el origen (Santiago) y **incluye datos e índices**.
LEÍDO ([gcloud clone](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/clone)).

```bash
# 2. Un script admin abre DOS conexiones: getFirestore(app,'(default)') y getFirestore(app,'repair-20260819'),
#    compara, y copia de vuelta SOLO los campos dañados.
# 3. Borrar la base temporal cuando termines — mientras exista, paga almacenamiento normal
npx firebase --project cranial-trading firestore:databases:delete 'repair-20260819'
```

**A.3 — Export parcial a GCS** si preferís un archivo en vez de una base viva. `--collection-ids`
filtra por **grupos de colección**, así que `card_index` (que es subcolección de cada usuario) se
exporta entero en un solo comando:

```bash
gcloud firestore export gs://BUCKET/pitr-cardindex \
  --project=cranial-trading --database='(default)' \
  --collection-ids='card_index' \
  --snapshot-time='2026-08-16T03:00:00Z'
```
LEÍDO ([gcloud export](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/export)).

**NO importes eso de vuelta a `(default)` directamente.** LEÍDO: *"If a document with the same ID
already exists, the import overwrites the existing document"* — sobrescribe el documento completo,
así que se llevaría por delante todo lo que los usuarios cambiaron desde el snapshot. Importalo a una
base scratch y copiá selectivamente:

```bash
gcloud firestore import gs://BUCKET/pitr-cardindex/<PREFIX> \
  --project=cranial-trading --database='repair-20260819' --collection-ids='card_index'
```

### Camino B — el daño tiene más de 7 días. Solo backups.

```bash
npx firebase --project cranial-trading firestore:backups:list --location southamerica-west1
npx firebase --project cranial-trading firestore:databases:restore \
  --backup 'projects/cranial-trading/locations/southamerica-west1/backups/BACKUP_ID' \
  --database 'repair-20260819'
```
De ahí en adelante, idéntico a A.2: comparar, copiar de vuelta lo mínimo, borrar la base temporal.
Coste del restore: $0,286/GiB en prod, o sea unos **$0,17 hoy**. Una restauración a la base viva
existente **no es posible**, siempre va a una base nueva. LEÍDO.

### Camino C — el caso concreto de TASK-245: probablemente ni haga falta

`card_index` es **derivado**. La discusión del 18/08 ya lo dice y sigue en pie: se reconstruye entero
con `buildCardIndex` a partir de `users/{uid}/cards` + `scryfall_cache`. Para un daño en datos
derivados, **el rebuild es mejor que la restauración**: no arrastra estado viejo, no crea bases
temporales, y no cuesta restore. Lo que estos backups protegen de verdad es la **fuente de verdad**:
`cards`, `decks`, `binders`, `preferences`, `savedMatches`, `savedContacts`, el perfil.

Esto no debilita la decisión de activar PITR — la refuerza y la reencuadra. PITR es el seguro para el
día que el bug toque `users/{uid}/cards` en vez de un índice. Ese día no hay rebuild que valga.

---

## Qué sigue en pie y qué quedó obsoleto de `docs/discusion-backups-y-salvaguardas.md`

**Sigue en pie, sin cambios:**
- La distinción fuente-de-verdad / derivado (sección 1). Es el encuadre correcto y este documento la
  usa para justificar el Camino C.
- "Lo derivado no necesita backup, necesita ser reconstruible de forma confiable".
- Las 5 salvaguardas de la sección 4. Ninguna la reemplaza un backup.
- La postura sobre la base relacional (sección 3): anotada como dirección, no ahora.
- "Un backup que no se probó restaurando no es un backup: es una suposición" (sección 6). Esto
  **sigue sin resolverse** y es la decisión #5 de abajo.

**Quedó obsoleto o respondido:**
- Sección 2, *"NO MEDIDO: no confirmé si estos proyectos ya tienen backups activados"* → **resuelto:
  no los tienen, ninguno de los dos, ni PITR ni schedules ni protección de borrado.** MEDIDO.
- Sección 6, *"El costo real de backups y de retención con el volumen actual"* → **resuelto:
  ≈$2,3/mes por el paquete completo.** Prod pesa 0,587 GiB, dev 4,192 GiB. MEDIDO.
- Sección 6, *"Si el plan de facturación habilita PITR y backups programados"* → ambos proyectos
  tienen Cloud Functions desplegadas, o sea Blaze, que es el requisito. SUPUESTO — no verifiqué la
  cuenta de facturación directamente, pero PITR exige billing y las functions también.
- Sección 5, *"¿Qué retención queremos?"* → contestado con números en la tabla de arriba.
- Sección 2 asumía que se podía "restaurar" sin más. **Matiz importante que no estaba: la
  restauración siempre crea una base nueva, nunca sobrescribe.** Eso cambia el procedimiento real de
  reparación.
- La sección 2 no mencionaba que **prod está en región única (Santiago)** y dev en multi-región.
  Cambia los precios (Santiago es ~19% más caro) y cambia el perfil de riesgo.

---

## Lo que le queda por decidir a Rafael

| # | Decisión | Mi recomendación | Por qué |
|---|---|---|---|
| 1 | ¿PITR en los dos proyectos? | **Sí, hoy** | Es el único mecanismo con granularidad de minuto y el único que cubre el escenario TASK-245 sin restaurar nada. $0,88/mes entre los dos. |
| 2 | ¿Retención del backup diario? | **7 días en ambos** | Duplica la cobertura de PITR con granularidad diaria. Subirlo a 30 d multiplica el coste por 4 y aporta poco frente al semanal. |
| 3 | ¿Backup semanal? | **Sí en prod (14 semanas, el máximo). No en dev.** | Es el seguro barato contra el bug que nadie ve en 3 meses. En dev no tiene sentido: es una base desechable. |
| 4 | ¿Protección contra borrado? | **Sí en ambos, ya. Es gratis.** | Está en DISABLED en los dos. Cuesta cero y evita la clase de accidente más irreversible que hay. |
| 5 | ¿Probamos una restauración de verdad? | **Sí, en dev, dentro de los primeros 7 días** | Un backup sin ensayar es una suposición (sección 6 del doc del 18/08, sigue vigente). El ensayo en dev cuesta ~$1,68 de restore y despeja el único riesgo que queda. |
| 6 | ¿Export manual antes de vaciar dev? | **Sí, sin excepción** | Ya estaba recomendado el 18/08 y sigue siendo correcto. Además sirve de ensayo del punto 5. |
| 7 | ¿Backup de Firebase Auth? | **Sí, pero como ticket aparte** | Nada de esto respalda las cuentas. `firebase auth:export` periódico. No lo dimensioné. |
| 8 | ¿Prod en región única es aceptable? | **Anotarlo, no actuar ahora** | Migrar de `southamerica-west1` a multi-región no es un cambio de configuración, es una migración de base. Fuera del alcance de este ticket, pero conviene que esté escrito. |

---

## Fuentes

- [Work with point-in-time recovery (PITR)](https://firebase.google.com/docs/firestore/use-pitr)
- [Point-in-time recovery (PITR) overview](https://cloud.google.com/firestore/docs/pitr)
- [Back up and restore data (scheduled backups)](https://firebase.google.com/docs/firestore/backups)
- [Firestore Enterprise pricing (tabla Standard vs Enterprise)](https://firebase.google.com/docs/firestore/enterprise/pricing)
- [gcloud firestore databases clone](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/databases/clone)
- [gcloud firestore export](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/export)
- [gcloud firestore backups schedules create](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create)
- [Exportar e importar datos](https://docs.cloud.google.com/firestore/docs/manage-data/export-import)
- Precios por región: Cloud Billing Catalog API, `GET https://cloudbilling.googleapis.com/v1/services/EE2C-7FAC-5E08/skus`
  (consultada 2026-08-19). Es la misma fuente que alimenta la página pública de precios, que no se
  puede leer automáticamente porque renderiza las tablas con JavaScript.

**Nivel de confianza: 8/10.** Alto en lo medido (tamaños, estado de los proyectos, precios por
región, disponibilidad de comandos en cada CLI — todo lo ejecuté). Alto en la documentación oficial
citada. Lo que baja el número: (a) no verifiqué la retención **mínima** de un schedule, no la
encontré documentada; (b) el desglose del tamaño por colección no lo medí, así que no sé qué parte
del backup es índice derivado que no haría falta respaldar; (c) el procedimiento de reparación
parcial lo tengo leído y razonado, pero **no ensayado** — de ahí que la decisión #5 sea ensayarlo en
dev antes de confiar en él.
