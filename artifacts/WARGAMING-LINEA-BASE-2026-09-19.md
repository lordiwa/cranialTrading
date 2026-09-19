# Línea base del Wrecker contra DEV — 2026-09-19

Corrida de las 21 regresiones adversariales de `qa-agents/tests/regression/cranialtrading/`
contra `https://cranial-trading-dev.web.app` (proyecto `cranial-trading-dev`), ANTES de
tocar una sola línea de código de producción. Es el control negativo compartido que los AC1
de TASK-301 a TASK-307 exigen a nivel de suite.

**Resultado: 12 rojo / 9 verde, en 6.1 minutos.** Corrida secuencial (workers 1, retries 0 —
la config del Wrecker prohíbe reintentos a propósito: un reintento que "a veces pasa"
destruye la señal).

Comando exacto, reproducible:

```
cd /opt/data/home/qa-agents
unset AGENT_BROWSER_EXECUTABLE_PATH
export PLAYWRIGHT_BROWSERS_PATH=/opt/data/home/.cache/ms-playwright
export QA_ENV_FILE=.env.wargaming
npx playwright test --reporter=list
```

## Corrección medida: esta máquina SÍ puede correr E2E

El bundle de sesión afirmaba desde el 2026-09-16 que esta máquina no podía correr E2E, por
un `EACCES: permission denied, mkdir '/opt/hermes/.playwright/__dirlock'`. Medido hoy: esa
ruta es de `root` y efectivamente no es escribible, **pero apuntando
`PLAYWRIGHT_BROWSERS_PATH` a `~/.cache/ms-playwright` los navegadores instalan sin problema**.
Verificado con un launch real contra dev: HTTP 200, título `Inicio | Cranial Trading`.

La nota del bundle generalizó de "esta ruta falla" a "esta máquina no puede", que es el modo
de fallo de siempre en este proyecto: lo leído citado como medido.

**Trampa que costó una corrida entera:** los dos repos usan versiones distintas de Playwright
— cranialTrading 1.58.2 (chromium build 1208), qa-agents 1.63.0 (build 1243). Instalar desde
cranialTrading deja a qa-agents sin navegador y **las 21 pruebas fallan por infraestructura
con exit code 0**, indistinguible a simple vista de 21 hallazgos confirmados. Hay que instalar
desde CADA repo. La primera corrida de hoy fue exactamente ese falso rojo y no se usa como
evidencia de nada.

## Las 12 en ROJO — los defectos vivos en dev

| Spec | Ticket | Qué afirma que hoy no se cumple |
|---|---|---|
| `wg-n1-totales-en-venta.spec.ts:75` | (ola 1, sin ticket abierto en esta tanda) | agregar una carta A LA VENTA cambia la cifra EN VENTA sin recargar |
| `wg4-o1-01-reset...:70` | TASK-301 | con un oobCode inválido no puede pintarse un formulario usable |
| `wg4-o1-01-reset...:93` | TASK-301 | tras enviar con código inválido queda error persistente y una salida |
| `wg4-o2-01-contadores...:53` | TASK-294 (re-confirmado) | los contadores de filas de /collection coinciden entre sí |
| `wg4-o2-01-contadores...:93` | TASK-294 (re-confirmado) | una carta solo-wishlist no está dentro de CARTAS QUE TENGO |
| `wg4-o2-02-exportar...:57` | TASK-302 | alguna ruta declarada ofrece exportar la colección |
| `wg4-o2-02b-verde-vacio...:61` | TASK-303 | el spec que sostiene UC-10 no envuelve sus aserciones en `if isVisible()` |
| `wg4-o2-03-paridad-de-precios...:91` | TASK-304 | ninguna carta muestra precios distintos en /collection y en /@usuario |
| `wg4-o3a-01-carrito-sin-items...:101` | TASK-305 | un carrito sin `items[]` no deja el perfil público en negro |
| `wg4-o3a-01-carrito-sin-items...:150` | TASK-305 | un carrito con items de tipo equivocado no miente el contador |
| `wg4-o3a-02-precio-del-pedido...:89` | TASK-306 | un carrito con el precio adulterado no persiste ese precio |
| `wg4-o3b1-01-sobreventa...:90` | TASK-307 | un pedido por más unidades de las que hay no vacía la línea en silencio |

Mensaje literal del rojo de TASK-307, que es el más caro de los dos críticos:

> La carta "Darksteel Citadel" desapareció por completo de la colección del vendedor. El
> pedido pedía 3 unidades y había 2: un pedido imposible de cumplir entero no puede borrar la
> fila, con su estado VENDO, su condición y su edición. Causa leída en el SUT
> (`src/utils/buyRequest.ts:60-70`, `planFulfillment`): `newQuantity = card.quantity -
> item.quantity`, y si `newQuantity <= 0` la acción es `delete`.

## Las 9 en VERDE — arreglos de olas anteriores que siguen en pie

`wg-001` (pedido duplicado, 2 pruebas), `wg-006` (aviso truncado en móvil), `wg-007` (cadenas
rotas, 2 pruebas), `wg-008` (el carrito cobra el precio del vendedor), `wg-n4` (AGREGAR sin
carta elegida — es TASK-300, ya cerrado), y los dos controles positivos de la tanda: el
"SIN oobCode" de `wg4-o1-01` y el "un valor que no parsea como JSON deja la vitrina intacta"
de `wg4-o3a-01`.

Los dos controles positivos verdes son los que hacen legible a los rojos de sus propios
archivos: el mismo spec, la misma sesión, el mismo terreno — lo único que cambia es el
ataque. Un archivo entero en rojo habría sido sospechoso de terreno roto; estos no lo son.

## Tickets sin regresión escrita todavía

TASK-308 a TASK-317 (salvo TASK-316/317, cubiertos parcialmente por el spec de sobreventa)
no tienen spec adversarial. Su re-verificación va a necesitar que el Wrecker escriba la
regresión correspondiente DESPUÉS del fix, que es justamente lo que la política v0.23.0 pide.
