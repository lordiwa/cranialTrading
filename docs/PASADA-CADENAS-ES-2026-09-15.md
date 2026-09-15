# Pasada de cadenas con `✓` — 2026-09-15 (TASK-297 AC3)

> Este contenido pertenece al comentario de TASK-297 en el task-store. En
> esta sesión las herramientas del task-store no están autorizadas, así que
> queda documentado acá; hay que volcarlo al comentario del ticket cuando se
> pueda y, si se quiere, borrar este archivo en ese momento.

## Método

`grep -n "✓" src/locales/es.json` (y lo mismo en `en.json` / `pt.json`, que
llevan el mismo defecto en las mismas claves, Regla 6 de CLAUDE.md) para
listar cada clave con el símbolo. Por cada clave, `grep -rn "<clave completa
en dot-path>" src/` para encontrar TODOS sus call sites y ver con qué `type`
de `toastStore.show(...)` se dispara (o si no es un toast en absoluto). Solo
se toca una clave cuando **todos** sus call sites son `toastStore.show(...,
'success')` — porque `BaseToast.vue:52` dibuja su propio SVG de check
únicamente para ese tipo, así que ahí el `✓` de la cadena es un ícono
duplicado. Si algún call site usa otro `type`, o la clave no es un toast, se
deja sin tocar.

## Resultado, clave por clave

| Clave | Superficie real (grep) | Diagnóstico | Acción |
|---|---|---|---|
| `cards.addModal.success` | `toastStore.show(..., 'success')` | Doble ícono (ya arreglada en TASK-297 original, commit `76784c0`) | Ya arreglada, fuera del alcance de esta pasada |
| `cards.grid.interestSent` | Texto de botón inline en `CollectionGridCardFull.vue:547` (`{{ t('cards.grid.interestSent') }}`), no es un toast | El `✓` es legítimo — no hay recuadro de `BaseToast` que dibuje ningún ícono ahí | **No se toca** |
| `decks.messages.created` | `toastStore.show(..., 'success')` — único call site, `stores/decks.ts:466` | Doble ícono | **Arreglada** (3 locales) |
| `decks.messages.deleted` | `toastStore.show(..., 'success')` — único call site de ESTA clave, `stores/decks.ts:579` (nota: `decks.messages.deletedWithCardWarning`, `deletedWithCards` y `deletedCardsKept` son claves hermanas distintas, sin `✓`, no tocadas) | Doble ícono | **Arreglada** (3 locales) |
| `matches.contactModal.emailCopied` | `toastStore.show(..., 'success')` en dos call sites: `SavedContactCard.vue:26` y `MatchCard.vue:149` | Doble ícono en ambos | **Arreglada** (3 locales) |
| `matches.contactModal.contactSaved` | `toastStore.show(..., 'success')` — único call site, `MatchCard.vue:192` | Doble ícono | **Arreglada** (3 locales) |
| `contacts.messages.saved` | `toastStore.show(..., 'success')` — único call site, `stores/contacts.ts:42` | Doble ícono | **Arreglada** (3 locales) |
| `matches.messages.saved` | La MISMA clave se dispara en dos call sites de `stores/matches.ts` con dos `type` distintos: línea 438 con `'info'` y línea 464 con `'success'` | Ambiguo: en el camino `'success'` es doble ícono (el checkmark de texto duplica el SVG de check); en el camino `'info'` NO es doble ícono (`BaseToast` dibuja un ícono de información distinto, no un check) — sacarle el `✓` "arregla" el camino success pero cambia el mensaje del camino info sin que nadie lo haya pedido para ese caso, y no se puede resolver sin partir la clave en dos (otro alcance). Nota adicional: el formato acá es distinto al resto de la familia — el `✓` va de SUFIJO ("Match guardado ✓"), no de prefijo | **No se toca, declarada** |
| `matches.messages.completed` | Cero usos en `src/` (medido con `grep -rn "matches.messages.completed\|matches\\.messages\\." src/`) | Clave muerta — no se renderiza en ningún lado hoy | **No se toca** (borrar claves muertas es otro alcance; se deja declarada por si alguien la reactiva sin notar el `✓` de sufijo) |

## Candado extendido

`tests/unit/locales/brokenStrings.task297.test.ts`, describe "AC3: resto de
la familia del doble icono" — cubre las 5 claves arregladas × 3 locales (15
aserciones) más una aserción explícita de que `cards.grid.interestSent`
CONSERVA su `✓` (para que nadie la toque por accidente pensando que es parte
de la misma familia). Rojo capturado antes de tocar los locales (15
fallos, uno por clave×locale, todos por la razón correcta: el `✓` seguía
presente); reportado verbatim en el hand-off de la sesión que escribió este
documento.

## Qué queda fuera de esta pasada, explícitamente

- `matches.messages.saved` y `matches.messages.completed`, por las razones
  de la tabla de arriba.
- Cualquier otra clave sin `✓` no fue evaluada por esta pasada — el alcance
  fue específicamente "cadenas con `✓`", no una auditoría general de i18n.
