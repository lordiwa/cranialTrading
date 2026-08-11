#!/usr/bin/env node
// Hook de SessionStart: inyecta el contrato de orquestador de hivemind en el
// contexto de cada sesion nueva.
//
// POR QUE EXISTE. El contrato vivia solo en prosa (CLAUDE.md + el skill
// hivemind:orchestrator-routing, cuya propia descripcion dice "always load at
// the start of every orchestrator chat"). Eso es circular: el mecanismo que
// hace cumplir el contrato depende de que el modelo ya se acuerde de cargarlo.
// El 2026-08-11 no se cargo, y la sesion entera trabajo sin delegar. Un hook no
// depende de que nadie se acuerde.
//
// Salida: JSON en stdout con hookSpecificOutput.additionalContext, que Claude
// Code inyecta en el contexto. Si algo falla, sale en silencio con codigo 0 —
// un hook roto NUNCA debe impedir que arranque la sesion.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const contrato = fs.readFileSync(path.join(here, 'hivemind-contract.md'), 'utf8');
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contrato,
      },
    }),
  );
} catch {
  // silencio deliberado: ver cabecera
}
