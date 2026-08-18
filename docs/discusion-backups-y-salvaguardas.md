# Backups y salvaguardas antes de borrar la base

**Estado: conversación abierta, sin decisiones tomadas. 2026-08-18.**
Rafael la abrió al plantear que, ya que vamos a borrar la base de dev (y después la de prod, que
confirmó que son todas cuentas de prueba o de amigos que él invitó), convendría crear una rutina de
backup y las salvaguardas para proteger una base futura con datos vivos. También preguntó si tener
un backup de datos, o mover los datos más estáticos a una base relacional.

Esto es el estado de la discusión hasta que se pausó la sesión. **Nada de acá está decidido ni
implementado.**

---

## 1. El encuadre que propongo: separar lo que se respalda de lo que se reconstruye

Es la distinción más útil para este proyecto, y sale directamente de todo lo que se rompió hoy.

Los datos de esta app son de dos naturalezas muy distintas:

**FUENTE DE VERDAD** — si se pierde, se perdió. No hay de dónde sacarlo.
- `users/{uid}/cards` — la colección del usuario (qué tiene, cuántas, en qué estado, a qué precio)
- `users/{uid}/decks` — sus mazos
- `users/{uid}/binders` — sus carpetas
- `users/{uid}/preferences`, `savedMatches`, `savedContacts`
- el perfil del usuario y su cuenta de Auth

**DERIVADO** — se puede volver a calcular a partir de lo anterior más una fuente externa.
- `card_index` — se reconstruye entero con `buildCardIndex`
- `public_cards` — copia derivada de las cartas del usuario (TASK-228)
- `scryfall_cache` — se puede volver a bajar de Scryfall

**La consecuencia práctica**: lo derivado **no necesita backup, necesita ser reconstruible de forma
confiable**. Lo que necesita backup es la fuente de verdad, que es mucho más chica y cambia mucho
menos.

Y esto no es teoría: hoy mismo, el defecto de TASK-245 destruyó metadatos de 6787 cartas y **no fue
pérdida de datos** precisamente porque lo destruido era derivado y `scryfall_cache` seguía intacto.
Un rebuild lo restaura. Ese es el patrón que conviene hacer explícito y sistemático en vez de
descubrirlo cada vez.

---

## 2. Lo que yo haría primero, y es barato

**Activar los backups nativos de Firestore.** Google los ofrece administrados: backups programados
con retención configurable, y recuperación a un punto en el tiempo (PITR). No requiere escribir
código, no requiere mantener un script, y no depende de que nosotros nos acordemos de correrlo.

Además, **una exportación puntual a Cloud Storage justo antes de cada borrado masivo**. Eso es la
red concreta para el plan de limpieza: si borramos dev y algo sale mal, se restaura.

Ese par cubre el 90% del riesgo con muy poco trabajo. Todo lo demás de este documento es opcional
encima de eso.

**NO MEDIDO / SIN VERIFICAR**: no confirmé si estos proyectos ya tienen backups activados, cuál es
el costo real con el volumen actual, ni si el plan de facturación los habilita. Hay que mirarlo
antes de prometer nada.

---

## 3. Sobre mover los datos estáticos a una base relacional

La intuición de Rafael tiene fundamento: los datos de carta de Scryfall son **estáticos,
compartidos entre todos los usuarios, y de sólo lectura**. Eso es exactamente lo que Firestore hace
peor y una base relacional (o incluso un archivo) hace mejor: consultas por atributos arbitrarios,
filtros combinados, ordenamientos. Es literalmente la causa de que exista el `card_index` — se
inventó porque Firestore sólo busca por prefijo y no permite las consultas que la app necesita.

**A favor:**
- Un filtro "tierras rojas de menos de 3 de maná" es una consulta trivial en SQL y hoy requiere
  mantener un índice derivado propio, que es la fuente de la mitad de los bugs de este proyecto.
- Eliminaría la clase entera de defectos "el índice diverge de los documentos".
- Los datos de Scryfall no cambian salvo cuando sale un set nuevo. Se puede regenerar entero.

**En contra, y no es menor:**
- Es un segundo motor de base de datos: otro despliegue, otra cosa que puede caerse, otra que hay
  que respaldar, otro costo fijo. Hoy el proyecto tiene un solo backend y una sola persona.
- Firestore da tiempo real y funcionamiento sin conexión; una relacional no, y habría que decidir
  qué queda de cada lado.
- Hay una alternativa más barata que hace casi lo mismo: **Scryfall publica sus datos en volcados
  masivos**. Se podría generar un índice estático prearmado, servirlo como archivo, y que el cliente
  lo consulte sin base de datos ninguna. Menos partes móviles que una relacional.

**Mi opinión, que es sólo eso**: no lo resolvería ahora. Es un cambio de arquitectura grande, y
ahora mismo hay defectos concretos y medidos con arreglos concretos. Pero **sí lo dejaría anotado
como la dirección correcta**, porque el `card_index` es la fuente recurrente de daño y esta sería la
forma de no necesitarlo. La decisión no urge; el registro de por qué, sí.

---

## 4. Salvaguardas, más allá del backup

Un backup te salva después del desastre. Estas evitan que ocurra. Salen todas de cosas que
efectivamente pasaron en este proyecto:

1. **Que lo derivado se pueda reconstruir con un botón, sin credenciales especiales.** Hoy
   reconstruir el `card_index` requirió que yo disparara una función desde el navegador con la
   sesión de Rafael, porque por script fallaba por permisos. Si la reparación es difícil, no se usa.

2. **Que una escritura que no puede hacer bien su trabajo falle, no que escriba mal.** El defecto de
   hoy escribió una entrada incompleta en vez de negarse. Y el de la semana pasada devolvía
   `applied: 0` mientras la app decía "listo".

3. **Que el borrado sea completo y lo diga.** Es TASK-246: el botón de borrar todo no borra carpetas
   ni mazos. Un borrado parcial deja un estado más raro que no borrar nada.

4. **Que lo que se ve en pantalla y lo que hay en disco se puedan comparar.** La mitad de los
   problemas de hoy fueron "la pantalla dice una cosa, el disco dice otra, y nadie se entera". Una
   verificación de consistencia que se pueda correr a demanda vale más que varios arreglos puntuales.

5. **Antes de cualquier borrado masivo, una exportación.** Sin excepción, aunque sea "sólo dev".

---

## 5. Lo que hay que decidir (pendiente, para retomar)

- ¿Activamos los backups nativos de Firestore ya, en los dos proyectos? (mi recomendación: sí)
- ¿Exportamos dev antes de vaciarlo? (mi recomendación: sí, aunque "no haya nada importante")
- ¿La relacional / índice estático queda como dirección futura anotada, o se evalúa en serio ahora?
  (mi recomendación: anotada, no ahora)
- ¿Qué retención queremos? No es lo mismo poder volver un día que poder volver un mes.

---

## 6. Lo que NO sé y hay que averiguar antes de comprometerse

- Si estos proyectos ya tienen algún backup activado. No lo miré.
- El costo real de backups y de retención con el volumen actual (una cuenta sola tiene 59k cartas).
- Si el plan de facturación de estos proyectos habilita PITR y backups programados.
- Cuánto tarda de verdad una restauración completa. Un backup que no se probó restaurando no es un
  backup: es una suposición.
