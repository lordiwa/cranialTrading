# 23 de 133 pruebas E2E no tienen una sola aserción — medido 2026-09-19

Salió buscando otra cosa: TASK-301 arregló el reset de contraseña y el Developer avisó que un
spec e2t **pre-existente encapsulaba el defecto como premisa** y se iba a poner rojo con el
arreglo. Al verificarlo apareció que ese spec no es una excepción.

## Lo medido

```
27 archivos .spec.ts en e2e/specs/
133 tests en total (coincide con la cifra que declara CLAUDE.md)
 23 tests sin UNA SOLA llamada a expect() en su cuerpo, repartidos en 11 archivos
 24 aserciones envueltas en `if (await ...isVisible())`, en 10 archivos
```

El 17% de la suite E2E no puede fallar. No "falla poco": **no puede fallar**, porque no
afirma nada.

## El caso que lo destapó

`e2e/specs/auth/forgot-password.spec.ts:29`

```ts
test('reset password page rejects mismatched passwords', async ({ resetPasswordPage }) => {
  await resetPasswordPage.goto('fake-oob-code');
  await resetPasswordPage.fillPasswords('NewPassword1!', 'DifferentPassword!');
  await expect(resetPasswordPage.mismatchError).toBeVisible();
  await expect(resetPasswordPage.submitButton).toBeDisabled();
});
```

Este SÍ asevera — el problema es otro y es peor: **navega con un oobCode falso y después espera
que el formulario se pinte.** O sea que su premisa es exactamente el defecto que TASK-301
acaba de arreglar (WG4-O1-01: "con un oobCode inválido se pinta el formulario completo"). El
spec estaba verde porque el bug estaba vivo. Con el arreglo puesto, se pone rojo.

**Consecuencia operativa inmediata:** el gate de push a `develop` exige la suite E2E completa
en verde. Este spec hay que resolverlo ANTES del push de esta tanda, o el gate bloquea el
deploy a dev — y sin deploy a dev el Wrecker no puede re-verificar ningún arreglo.

## El caso que muestra el tamaño del hueco

`e2e/specs/matches/match-management.spec.ts:37`

```ts
test('open match detail modal → shows card comparison + user info', async ({ matchesPage }) => {
  const matchCount = await matchesPage.getMatchCount();
  if (matchCount > 0) {
    await matchesPage.openMatchDetail(0);
    await matchesPage.page.waitForTimeout(1000);
  }
});
```

El nombre promete que "muestra la comparación de cartas y los datos del usuario". El cuerpo no
lo comprueba. Y el cuerpo entero está dentro de un `if (matchCount > 0)`: con la cuenta sin
matches no ejecuta nada y pasa igual. Verificado que el Page Object tampoco asevera por dentro
— no es que la aserción esté escondida, es que no existe.

Sus dos hermanos inmediatos son `save match (ME INTERESA) → moves to Saved tab` y
`discard match → moves to Deleted tab`, los dos igual de vacíos. **Eso explica por qué TASK-309
(ME INTERESA sin guarda de vuelo único: tres clics, tres matches) y TASK-310 (Guardados es un
subconjunto de Enviados) pudieron vivir tanto tiempo con "cobertura" encima.**

## Los 23, por archivo

| Archivo | Tests sin `expect()` |
|---|---|
| `matches/match-management.spec.ts` | 5 |
| `settings/settings-data.spec.ts` | 4 (es el que TASK-303 ya nombra) |
| `contacts/contacts.spec.ts` | 3 |
| `decks/deck-import.spec.ts` | 2 |
| `help/help-legal.spec.ts` | 2 |
| `notifications/toasts-and-notifications.spec.ts` | 2 |
| `decks/deck-crud.spec.ts` | 1 |
| `market/portfolio-impact.spec.ts` | 1 |
| `market/price-movers.spec.ts` | 1 |
| `preferences/preferences-crud.spec.ts` | 1 |
| `settings/settings-profile.spec.ts` | 1 |

## Por qué esto importa más que cualquiera de los tickets de la tanda

TASK-303 está abierto por UN archivo (`settings-data.spec.ts`) y lo llama, con razón, "verde
vacío sobre un flujo que no existe". Lo medido dice que el archivo es el 17% de un patrón,
no un caso aislado. Y el ticket TASK-264 (abierto el 2026-08-21) ya había registrado ~45 usos
de `isVisible` en 18 archivos con un caso vacuo como control positivo: **esto es la misma
familia, un año después, todavía viva y ahora cuantificada.**

Mientras tanto la cifra de 133 tests se cita como si fueran 133 sensores. Son 110.

**Residual honesto:** el recuento de "0 expect" es un conteo sintáctico del cuerpo de cada
`test(...)`. Podría dar un falso positivo si un Page Object aseverara por dentro — lo verifiqué
a mano en el caso de matches (no asevera), pero NO en los 23. El orden de magnitud está medido;
el número exacto puede moverse en uno o dos.
