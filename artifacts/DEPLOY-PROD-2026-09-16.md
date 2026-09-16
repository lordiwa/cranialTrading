# Cierre verificado del despliegue a produccion — 2026-09-16

Promocion de los seis fixes del wargaming del 2026-09-15 (TASK-291, 296, 297,
298, 299, 300) desde `develop` a `main`, con la verificacion medida de que el
codigo desplegado es efectivamente el que se probo.

## 1. Estado previo verificado (no supuesto)

| Cosa | Medicion |
|---|---|
| `develop` vs `origin/develop` | sincronizadas en `eff12b6` (un `git fetch` corrigio un ref local viejo que hacia parecer 2 commits sin pushear) |
| CI de `develop` | run **35050896331** sobre `eff12b6`: type-check, unit-tests, build, e2e (suite COMPLETA) y deploy-dev **todos success** |
| QA en dev | reporte `~/qa-agents/reports/cranialtrading/2026-09-16/REPORTE.md` — 6 de 6 fixes vivos, 8 regresiones verdes, 7 rojas contra el codigo pre-fix, **cero bugs nuevos** |
| Tests unitarios locales | 189 archivos / **2435 tests** verdes (106,7 s) |
| Build local | `npx vite build` ok, emite `assets/index-BsVSvNzG.js` |
| Version | `1.59.14` en `develop`; `main` venia en `1.59.13` |

Commit previo al merge en `develop`: `808591a` (solo `state/` y `artifacts/`,
cero cambios en `src/`, o sea cero impacto sobre el bundle de produccion).
Pusheado a `origin/develop` antes de promover.

## 2. Merge

- **SHA del merge:** `3db4c7f` — `merge(develop): despliegue a produccion de los 6 fixes del wargaming — TASK-291, 296, 297, 298, 299, 300 y bump 1.59.14`
- **Estrategia:** `--no-ff`, igual que la promocion anterior (`ad1e749`, dos padres).
- **Conflictos:** ninguno. `main` no habia avanzado desde `ad1e749`.
- **Verificado despues del merge:** `package.json` en `main` dice `1.59.14`, y
  `git diff develop main` es **vacio** — el arbol de `main` quedo identico al de
  `develop`, no una aproximacion.
- 15 commits entraron a `main`, incluidos los seis fixes y TASK-290.
- Vuelta inmediata a `develop` despues de pushear (la regla dev-first se violo
  por omision el 2026-08-24 por quedarse en `main`).

## 3. CI de produccion

Run **35057241576** (CI/CD, rama `main`, sha `3db4c7f`): **success**.

| Job | Resultado |
|---|---|
| type-check | success |
| unit-tests | success |
| build | success |
| e2e (`--grep @smoke` en `main`) | success |
| **deploy-prod** | **success** |
| deploy-dev | skipped (correcto: no es `develop`) |

SonarCloud Analysis (run 35057241478): success.

## 4. Bundle de produccion verificado

| | Antes del deploy | Despues |
|---|---|---|
| Asset | `assets/index-CuGIZsPj.js` | `assets/index-BsVSvNzG.js` |
| last-modified | 2026-09-15T03:14:41Z | 2026-09-16T04:55:50Z |
| HTTP de la home | 200 | 200 |

El hash del nombre cambio, que es la senal minima. La senal fuerte es esta: el
sha256 del bundle **descargado de produccion** es
`b070bf5de034355f7c406d45135b8e9ab15d5700e1aa975120477bd221ae0e3d`, **identico
byte a byte** al del build local de este mismo arbol. Produccion no esta
sirviendo "algo nuevo": esta sirviendo exactamente este codigo.

## 5. Regresiones corridas CONTRA PRODUCCION

Solo las que no escriben un byte. Las dos dieron **verde**, y las dos tienen
control pre-deploy, que es lo que convierte el verde en evidencia.

### wg-008 — el carrito cobra el precio del vendedor (TASK-298)

Anonima, el carrito vive en localStorage. Misma prueba, misma maquina, misma
URL, mismo vendedor (`@qa_mtg`), misma carta; lo unico que cambio en el medio
fue el deploy:

| | 04:37 (pre-deploy) | 05:0x (post-deploy) |
|---|---|---|
| Publicado por el vendedor | $0,97 | $0,97 |
| Card Kingdom dice | $2,49 | $2,49 |
| **El carrito cobra** | **$2,49** (ROJA) | **$0,97** (VERDE) |

CK sigue reportando $2,49 — o sea el lookup sigue resolviendo y la prueba
sigue midiendo lo que decia medir; lo que dejo de pasar es que ese retail pise
el precio del vendedor.

### wg-006 — el aviso de validacion no se recorta en movil (TASK-296)

Sin huella en produccion por construccion: `auth.ts` valida el formato ANTES de
crear ningun usuario de Auth. Medido en viewport movil:
`scrollWidth=294 clientWidth=294 oculto=0px, text-overflow=clip,
white-space=normal`. Pre-fix eran **179 px ocultos**.

### Lo que NO se corrio, y por que

Las otras cuatro regresiones (wg-001, wg-007, wg-n1, wg-n4) exigen sesion o
escriben documentos reales (wg-001 persiste un pedido de compra). El terreno QA
de produccion no existe para eso — se midio de paso que `@qa_buyer` devuelve
**"404 - Usuario no encontrado"** en prod, que es la app respondiendo bien, no
una regresion del deploy. Re-sembrar ese terreno es escribir en produccion y
**necesita autorizacion explicita de Mato**; no se hizo.

## 6. Estado de los tickets

Los seis (291, 296, 297, 298, 299, 300) ya estaban en `done` con sus
`linked_commits` cargados desde `52ed7b4`. **No se pudo anotar el deploy como
comentario en los tickets**: las herramientas MCP del task-store
(`append_comment` / `transition_status` / `close_task`) siguen sin autorizacion
en esta sesion, igual que en las del 2026-09-15 y 2026-09-16, y el contrato
prohibe suplirlas editando `tasks/*.json` a mano. Este documento es la
constancia; el comentario queda listo para pegar cuando haya una sesion con
permisos.

TASK-290 sigue en `todo` por el mismo motivo (su evidencia esta en
`artifacts/TASK-290-evidencia.md`), pese a que su codigo ya viajo a produccion
dentro de este merge.

## 7. Lo que queda

1. **Decision de Mato:** re-sembrar el terreno QA en produccion para poder
   re-verificar alla las seis pruebas que exigen sesion. Es escritura en
   produccion; no se ejecuta sin su OK.
2. Una sesion con permisos de MCP para cerrar TASK-290 y anotar este deploy en
   los seis tickets. Van 7 tickets esperando ese permiso.
3. La causa del vaciado de `public_cards` sigue sin determinar (TASK-290 repuso
   el dato, no explico quien lo borra).
