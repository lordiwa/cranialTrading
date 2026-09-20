# 10 comentarios inválidos de schema bloquean escrituras en 9 tickets — medido 2026-09-20

## Cómo apareció

No se salió a buscarlo. `appendComment` rechazó una escritura legítima sobre TASK-304 con:

```
task payload failed schema validation:
  /comments/0 must have required property 'at';
  /comments/0 must NOT have additional properties;
  /comments/0/author must be equal to one of the allowed values
```

El guard valida el payload **entero** del ticket, no solo el comentario entrante. Así que un
comentario corrupto de antes bloquea **toda** escritura futura sobre ese ticket: ni
`append_comment`, ni `transition_status`, ni `close_task`.

## Barrido completo de `tasks/` (461 comentarios, 10 inválidos)

| Ticket | Índice | Problema | Estado del ticket |
|---|---|---|---|
| TASK-085 | 0 | sin `at`; propiedades extra `date`, `text` | done |
| TASK-085 | 1 | sin `at`; propiedades extra `date`, `text` | done |
| TASK-291 | 0 | `author: "operator"` (fuera del enum) | done |
| **TASK-294** | 0 | `author: "qa-agents/orquestador"` | **todo** |
| TASK-296 | 0 | `author: "operator"` | done |
| TASK-297 | 0 | `author: "operator"` | done |
| TASK-298 | 0 | `author: "operator"` | done |
| TASK-299 | 0 | `author: "operator"` | done |
| TASK-300 | 0 | `author: "operator"` | done |
| **TASK-304** | 0 | `author: "orquestador-qa"`; sin `at`; extra `created_at` | **todo** |

Enum válido (`tasks/schema.json`): `orchestrator`, `developer`, `reviewer`, `researcher`, `uat`,
`backlog-seeder`.

## Qué duele y qué no

**Los 7 ticket cerrados no molestan hoy.** Están en `done` y nadie les va a escribir. Pero
cualquier intento futuro de comentarlos o reabrirlos va a rebotar igual.

**Los dos abiertos sí bloquean trabajo ahora mismo:**

- **TASK-304** — no se le puede registrar la evidencia del AC1, ya medida. Quedó en
  `artifacts/TASK-304-AC1-evidencia.md` lista para pegar.
- **TASK-294** — no se le puede escribir nada ni cerrarlo.

## Por qué no lo reparé

El contrato de hivemind prohíbe escribir una entrada de `comments` con un `Edit` crudo de
`tasks/<KEY>.json`: un edit a mano no pasa por ajv ni por ninguna de las guardas (el done-guard de
uat-only, las dos guardas de loop-mode, el enum de autor, la restricción del comentario de cierre
del reviewer).

Y acá hay una ironía que vale registrar: **estos 10 comentarios existen precisamente porque alguien
los escribió a mano saltando esas guardas.** Repararlos del mismo modo sería repetir la causa.

La distinción honesta: reparar corrupción no es lo mismo que fabricar un comentario. Pero es una
decisión de Mato, no mía, y no corre prisa para los 7 cerrados.

## Reparación propuesta (para cuando Mato la autorice)

Mínima y conservadora, preservando todo el texto:

1. `author` fuera del enum → mapear a `orchestrator`, y **conservar el autor original como prefijo
   literal del body** (`[autor original: qa-agents/orquestador] ...`), para no perder de quién vino.
2. Falta `at` → poner el `created_at`/`date` que el propio comentario ya trae, si lo trae; si no,
   el `created_at` del ticket, marcándolo como reconstruido.
3. Propiedades extra (`date`, `text`, `created_at`) → plegar su contenido dentro de `body` antes de
   quitarlas. TASK-085 es el caso delicado: su texto vive en `text`, no en `body`.

Después de reparar, validar los 297 tickets contra `tasks/schema.json` de una pasada, para no
descubrir el siguiente al intentar cerrar algo.
