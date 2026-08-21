# TASK-257 — estado al pausar (2026-08-21)

Escrito por el orquestador antes de una pausa con `/clear`. **El ticket NO esta
cerrado**: falta medir el AC4 y falta la revision en contexto fresco.

## Commit

`441d03a` en `develop`, **sin pushear**. 3 archivos, +105/-38:
`src/services/userLookup.ts`, `src/stores/auth.ts`,
`tests/unit/services/userLookup.test.ts`.

## AC1 — la traza, que CONFIRMA la hipotesis del ticket

`src/stores/auth.ts:196`, dentro del listener `onAuthStateChanged`, hay un
`void loadUserData(firebaseUser.uid)` **sin await**. Firebase dispara ese listener
apenas `createUserWithEmailAndPassword` (o `signInWithPopup`) autentica al usuario
— ANTES de que `register()` / `loginWithGoogle()` terminen su propio
`reserveUsername` + `setDoc(users/{uid})` secuencial. Como `/users/{uid}` todavia
no existe en ese instante, `loadUserData` toma la rama de self-heal y hace SU
PROPIO `reserveUniqueUsername` + `setDoc`, derivando el username de
`displayName || email.split('@')[0]`.

Quedan dos reservas y dos escrituras independientes compitiendo por el mismo uid.
Gana el ultimo `setDoc`; el `/usernames/{norm}` del perdedor queda huerfano.

**Encaja letra por letra con lo medido:** el email de `register.spec.ts` es
`test_<ts>@e2etest.com`, asi que `email.split('@')[0]` da `test_<ts>` — que es
exactamente lo que decia el documento de los 5 huerfanos `/usernames/e2euser<ts>`.

## AC2 — la lectura

`resolveUsernameToUid` ahora compara `data.username === norm` antes de confiar en
el puntero del indice. Si no coincide, cae al fallback legacy en vez de servir el
perfil equivocado.

## AC3 — el rojo, capturado ANTES del fix

```
TASK-257 regression: index points to a doc whose username field is DIFFERENT
(orphan) -> does not serve that profile, falls through to legacy
AssertionError: expected { id: 'U9', ...(1) } to be null
- Expected: null
+ Received: { "data": { "username": "test_123" }, "id": "U9" }
  > tests/unit/services/userLookup.test.ts:77:20
```

## AC4 — la escritura: IMPLEMENTADA, NO MEDIDA

Guard `provisioningUids` (Set a nivel de modulo en `auth.ts`) que marca el uid
mientras el flujo explicito reserva y escribe. El self-heal se saltea entero si el
uid esta marcado. Aplicado tambien a `loginWithGoogle` por ser el hermano exacto
(Regla 1/6).

**RESIDUAL DECLARADO POR EL PROPIO DEVELOPER, no descubierto despues:** el guard se
pone apenas se conoce el uid, sin await de por medio, asi que cierra la ventana todo
lo posible desde esta capa — pero **no garantiza** el orden en que el SDK de Firebase
dispara el listener respecto de cuando nuestro codigo retoma tras el await. Es la
mejor defensa disponible sin tocar el SDK, no una prueba. **Por eso el AC4 pide
MEDICION y no lectura de codigo.**

Tampoco hay unit test para esa mitad: el developer lo declara explicitamente como
dificil de testear de forma determinista sin mockear el SDK. La evidencia de esa
mitad **tiene que ser la medicion**.

## AC5 — medido por el orquestador contra PRODUCCION (solo lectura)

**El huerfano existe en produccion, vivo:** `/usernames/rafael` -> uid
`385E6XCLhGhqOqzEalrQBRX6Bym2`, cuyo documento dice `rafael_mtg`. Entrar a
`/@rafael` en produccion sirve el perfil de OTRA persona. Es 1 sobre 3 indices.

Prod ademas: `/users`=2, `/usernames`=3, `/contact_info`=2, `/market_data`=0, y
**196 cuentas en Auth**. No se borro nada, como manda el AC.

## AC6 — gate, corrido por el orquestador sobre este mismo codigo

- `npm run test:unit`: **2239/2239** verde, 168 archivos (eran 2238: 1 test nuevo).
- `npm run lint`: 0 errores, 126 warnings — identico al conteo previo.
- `npx vite build`: OK, 19,48 s.

## LO QUE FALTA PARA CERRAR

1. **Medir el AC4**, que le toca al orquestador: snapshot de `/usernames` y `/users`
   en dev con firebase-admin, correr `e2e:auth`, re-medir, y verificar que no quedo
   ningun indice apuntando a un uid cuyo doc diga otro username. Ojo: `e2e:auth`
   **crea cuentas reales** — hay que limpiarlas despues, como se hizo en TASK-256.
2. **Reviewer en contexto fresco.** Pasarle el residual del AC4 declarado arriba y
   pedirle que juzgue si la evidencia por medicion alcanza, dado que no hay test.
3. Antes de cualquier E2E: verificar que nadie escuche en el puerto **4173**.
