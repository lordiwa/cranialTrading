# Prompt para construir los componentes en Figma (sesión interactiva)

Pegá esto en tu Claude Code **interactivo** (terminal foreground), donde el MCP de
Figma está conectado (`/mcp` → figma → connected). Esta sesión background no puede
usar el MCP de Figma (OAuth interactivo no carga en headless).

---

Tenés el MCP de Figma conectado con write-to-canvas. Construí los componentes del
design system de Cranial Trading en mi archivo Figma:
`https://www.figma.com/design/e3sqsTngAP72nkjqSpfmdO/Untitled`

**Fuente de verdad de los specs:** `design/component-specs.md` (en el repo). Leelo
entero antes de empezar. Los tokens ya están importados como estilos de Figma:
Color styles `color/bg`, `color/text/silver(/70/50/30/20/10/5)`,
`color/accent/neon(/40/15/10/5)`, `color/error/rust(/10/5)`, `color/warning(/40/15/10/5)`,
`color/info(/5)`; Text styles `typography/h1..tiny`; Effect styles `boxShadow/*`.

**Construí 3 Component Sets** (en una página "Components"), aplicando esos estilos
por nombre (no hardcodees hex). Orden:

1. **Button** — Variant(primary|secondary|danger|filled) × Size(normal|small) ×
   State(default|hover|active|disabled). Auto-layout, min-h 44, radius 3, texto Bold.
   Paddings y mapeo fill/border/text por estado según la tabla de `component-specs.md`.
2. **Input** — State(default|focus|disabled|error) + bool Clearable. Alto 40, padding
   12×8, fill `color/bg/primary`, borde 1px `color/text/silver/10`, radius 3,
   placeholder neón 40%. focus→borde 2px neón; error→borde 2px rust + texto error.
3. **Badge** — Variant(busco|cambio|vendo|success|solo|deseado|error|info|warning).
   Padding 8×4, `typography/tiny` Medium, radius 2, borde 1px. Mapeo por variante
   según la tabla (deseado/warning→`color/warning`; info→`color/info`).

Antes de crear cada variante, confirmá que el nombre exacto del estilo en el archivo
coincide (si Tokens Studio aplanó distinto, ajustá el prefijo). Cuando termines,
listame qué Component Sets y cuántas variantes creaste.
