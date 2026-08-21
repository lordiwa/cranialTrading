# TASK-257 AC4 — medicion contra dev (2026-08-21)

Medido por el ORQUESTADOR con firebase-admin + ADC contra `cranial-trading-dev`,
sobre el codigo de `441d03a`. El AC4 pide medicion y no lectura de codigo porque el
guard `provisioningUids` no tiene unit test (declarado por el developer).

Instrumentos (en este mismo directorio):
- `scratch-ac4-usernames-audit.mjs` — solo lectura. Snapshot de `/users` y
  `/usernames`; marca HUERFANO todo `/usernames/<norm>` cuyo uid apunte a un
  `/users/<uid>` inexistente o cuyo campo `username` no sea `<norm>`.
- `scratch-ac4-limpiar-cuentas-e2e.mjs` — diff de dos snapshots; borra SOLO lo
  aparecido entre ambos. Dry-run por defecto. No toca Firebase Auth.

## Linea base (antes de correr nada)

```
{"users":2,"usernames":2,"orphans":0}
```
`rafael_m` -> yoU2gaJARfe72oW7GK2GkQxSgCe2, `RafaMoose` -> jV6gJqf3csPA4vRfO2k9Vb5ejYo2.
Snapshot: `TASK-257-ac4-snapshot-antes.json`.

## Corridas

`npm run e2e:auth` CUATRO veces (no una: la carrera es probabilistica y una sola
corrida verde no distingue "arreglado" de "tuve suerte"). Puerto 4173 verificado
libre antes de arrancar. Las cuatro **15/15 passed** (52,4 s / 42,2 s / 47,0 s /
57,3 s), incluyendo las cuatro veces
`register.spec.ts:12 Registration > successful registration` — que es el test que
crea la cuenta real y el que producia el huerfano.

## Resultado — snapshot despues de las 4 corridas

```
{"users":6,"usernames":6,"orphans":0}
```

Diff contra la linea base: **4 usuarios nuevos y 4 indices nuevos, uno por corrida,
relacion 1:1 y todos coherentes**:

```
/users/pVoPuRZpMPXboK4UVd7Hvx3bRYj1 -> e2euser1787291059756
/users/DkdTugHe5dZaW1p9tRkxuuKJCoC3 -> e2euser1787291169394
/users/iEA2CA3QVqaaFWxKKQYUkRZugGF3 -> e2euser1787291217421
/users/nhlGNZttZ5fe40e2KDOcgUCw9l53 -> e2euser1787291267656

/usernames/e2euser1787291059756 -> pVoPuRZpMPXboK4UVd7Hvx3bRYj1 (doc dice: e2euser1787291059756)
/usernames/e2euser1787291169394 -> DkdTugHe5dZaW1p9tRkxuuKJCoC3 (doc dice: e2euser1787291169394)
/usernames/e2euser1787291217421 -> iEA2CA3QVqaaFWxKKQYUkRZugGF3 (doc dice: e2euser1787291217421)
/usernames/e2euser1787291267656 -> nhlGNZttZ5fe40e2KDOcgUCw9l53 (doc dice: e2euser1787291267656)
```

Snapshot: `TASK-257-ac4-snapshot-despues-4corridas.json`.

## Por que esto discrimina (control negativo, medido ANTES, no de laboratorio)

La forma del ANTES esta medida y registrada en el propio ticket: cinco huerfanos
`/usernames/e2euser<ts>` apuntando a un uid cuyo documento decia `test_<ts>`,
producidos por corridas de ESTE MISMO test con el codigo anterior. El email de
`register.spec.ts` es `test_<ts>@e2etest.com`, asi que `test_<ts>` es exactamente
lo que el self-heal deriva de `email.split('@')[0]`.

En estas 4 corridas **no aparecio ni un solo documento con username `test_<ts>`**, y
la relacion usuario:indice fue 1:1 en vez de 1:2. O sea que el self-heal no corrio
ninguna de las cuatro veces: no es que el huerfano se limpio despues, es que no se
genero. Ese es el cambio de comportamiento que el AC4 pide demostrar.

**Limite honesto de esta evidencia:** n=4 sobre una carrera probabilistica no es una
prueba de imposibilidad. El residual declarado por el developer sigue en pie — el
guard no puede garantizar el orden en que el SDK dispara `onAuthStateChanged`. Lo
que esta medicion establece es que la ventana se cerro lo suficiente como para que
un flujo que fallaba de forma sistematica (5 de 5 huerfanos historicos) ahora no
falle en 4 de 4. No hay control negativo de laboratorio (revertir el fix y
re-correr) porque eso exigia modificar `src/` desde el hilo principal.

## Limpieza (AC4, segunda mitad)

`scratch-ac4-limpiar-cuentas-e2e.mjs --yes` borro los 8 documentos creados por las
4 corridas (4 en `/users` con `recursiveDelete`, 4 en `/usernames`). Re-medicion
final:

```
{"users":2,"usernames":2,"orphans":0}
```

Dev volvio EXACTO a la linea base. Snapshot:
`TASK-257-ac4-snapshot-final-tras-limpieza.json`.

**Firebase Auth NO se toco** — las 4 cuentas de Auth quedaron, sumandose a las 226
historicas ya anotadas como pregunta abierta el 2026-08-21. Es la misma decision que
en TASK-256 y sigue sin dimensionarse.

---

## HALLAZGO POSTERIOR QUE PONE EN DUDA TODO LO DE ARRIBA (2026-08-21, ~07:00Z)

Minutos despues de la limpieza, una re-medicion incidental (iba a validar el sensor
con un control sembrado, que fallo por otro motivo) dio:

```
{"users":3,"usernames":4,"orphans":1}
HUERFANO: /usernames/rafael -> SBeZwweb8jQ87DMOYaOYe9J0yxX2 (doc dice: unique_1787295510378)
```

Forense (`scratch-257-forense.mjs`):

```
/users/SBeZwweb8jQ87DMOYaOYe9J0yxX2 | username=unique_1787295510378 | createdAt=2026-08-21T06:58:31.389Z
/usernames/rafael               -> SBeZwweb8jQ87DMOYaOYe9J0yxX2  createdAt=1787295511.029
/usernames/unique_1787295510378 -> SBeZwweb8jQ87DMOYaOYe9J0yxX2  createdAt=1787295511.208
```

**DOS reservas para el MISMO uid, separadas por 179 ms.** El flujo explicito reservo
`rafael`; el self-heal corrio igual, encontro `rafael` ya tomado (por el propio flujo
explicito), derivo `unique_<ts>`, lo reservo, y su `setDoc` gano. `/usernames/rafael`
quedo huerfano. Es la firma exacta del bug de AC1, con el fix supuestamente puesto.

**NO SE BORRO NADA: es evidencia viva.**

### Las dos lecturas posibles, y por que no se pueden separar sin preguntar

1. **El registro corrio contra codigo VIEJO.** `441d03a` esta commiteado pero **NO
   pusheado**, asi que `cranial-trading-dev.web.app` sirve el bundle de `develop`
   pusheado, SIN el guard. Si el registro se hizo ahi, este huerfano no dice nada
   sobre el fix y la medicion de arriba sigue valiendo.
2. **El registro corrio contra el codigo NUEVO** (localhost / preview con el build
   actual). Entonces el guard `provisioningUids` NO cierra la carrera, el AC4 NO
   esta cumplido, y los 4 verdes de arriba solo dicen que el camino E2E headless
   no la dispara — no que la carrera este cerrada.

La diferencia entre las dos lecturas es total y **no es decidible con los datos que
tengo**: nada en Firestore registra que build escribio el documento. Hay que
preguntarle al humano donde se hizo ese registro.

**Estado del AC4 mientras tanto: EN DUDA, no cumplido.** La conclusion de arriba
queda condicionada a la respuesta.

### RESUELTO: era el nightly contra el sitio DESPLEGADO, o sea codigo VIEJO

Tres hechos medidos, sin hipotesis:

1. `gh run list`: **`Nightly E2E (dev)` corrio 2026-08-21T06:57:34Z** (branch `main`,
   conclusion success). La cuenta de Auth se creo **06:58:30Z**, 56 segundos despues.
2. El nightly corre contra `https://cranial-trading-dev.web.app`, cuyo bundle es el
   de `origin/develop`. **Ni `441d03a` (este fix) ni `f6b15b2` (TASK-256) estan en el
   remoto** — verificado con `git merge-base --is-ancestor`, los dos dan NO. O sea
   que el sitio corre el codigo VIEJO, sin el guard `provisioningUids`.
3. `git show origin/develop:e2e/specs/auth/register.spec.ts` linea 65 todavia dice
   `username: 'rafael'` — el target viejo. El cambio a `rafael_m` esta en el commit
   sin pushear.

Secuencia exacta que produjo el huerfano, ya sin ninguna pieza libre: el test
`duplicate username blocks registration` pidio `rafael`, que estaba LIBRE (yo mismo
lo habia limpiado a las 05:52); el flujo explicito lo reservo a `.029`; el self-heal
**sin guard** derivo `unique_1787295510378` de `email.split('@')[0]`, lo reservo a
`.208`, y su `setDoc` gano. `/usernames/rafael` quedo huerfano apuntando a un doc que
dice `unique_1787295510378`.

**CONCLUSION: el huerfano NO refuta el fix — lo CONFIRMA.** Es una reproduccion
independiente y no provocada del bug con el codigo viejo, producida por CI y no por
el orquestador. Es el control negativo de laboratorio que no se podia fabricar sin
modificar `src/` desde el hilo principal: mismo test, misma base, MISMO camino, sin
el guard -> huerfano; con el guard -> 4 de 4 corridas sin huerfano. **El AC4 vuelve a
CUMPLIDO, y con mas evidencia que antes, no menos.**

Efecto secundario a tener en cuenta: **mientras `441d03a` no se pushee, el nightly va
a volver a generar este huerfano todas las noches.**

### Hallazgo lateral, distinto del huerfano (NO tocado)

`/usernames/RafaMoose` esta guardado SIN normalizar, pero `normalizeUsername()`
(`src/utils/username.ts`) hace `trim().toLowerCase()`. O sea que
`resolveUsernameToUid('RafaMoose')` busca `/usernames/rafamoose`, que no existe, cae
al fallback legacy `where('username','==','rafamoose')`, y el doc dice `RafaMoose`
-> tampoco matchea -> **devuelve null**. Ese perfil probablemente no resuelve.
No es un huerfano y esta fuera del alcance de TASK-257; ademas el sensor de arriba
compara literal (`docUsername !== norm`) y por eso lo da por coherente. Anotado como
pregunta abierta, sin tocar.
