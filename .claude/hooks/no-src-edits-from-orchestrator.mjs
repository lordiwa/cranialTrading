#!/usr/bin/env node
/**
 * Bloquea Edit/Write/NotebookEdit sobre src/ desde el HILO PRINCIPAL (el orquestador).
 *
 * POR QUE EXISTE: el 2026-08-11 el orquestador escribio codigo de produccion e investigo
 * en el hilo principal tres veces en una sola sesion, pese a que CLAUDE.md y el hook de
 * SessionStart lo prohiben. El enforcement vivia solo en prosa, y la prosa no lo detuvo.
 * Este hook es la parte mecanica.
 *
 * COMO DISTINGUE al orquestador de un subagente: los subagentes de Claude Code corren con
 * CLAUDE_AGENT_NAME / CLAUDE_SUBAGENT_NAME o con un session_id propio distinto del de la
 * sesion principal. Si detectamos CUALQUIER señal de subagente, dejamos pasar.
 *
 * FALLA ABIERTO A PROPOSITO: si algo sale mal en este hook, sale 0 y deja pasar. Un hook
 * roto nunca debe bloquear el trabajo.
 */

let raw = ''
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
    try {
        const input = JSON.parse(raw || '{}')
        const tool = input.tool_name || ''
        if (!['Edit', 'Write', 'NotebookEdit'].includes(tool)) return process.exit(0)

        const filePath = String(input.tool_input?.file_path || input.tool_input?.notebook_path || '')
        if (!filePath) return process.exit(0)

        const normalized = filePath.replace(/\\/g, '/')
        const inSrc = /(^|\/)src\//.test(normalized)
        if (!inSrc) return process.exit(0)

        // Señales de subagente: si hay alguna, NO bloqueamos.
        const isSubagent = Boolean(
            process.env.CLAUDE_AGENT_NAME ||
            process.env.CLAUDE_SUBAGENT_NAME ||
            process.env.CLAUDE_AGENT_TYPE ||
            input.agent_name ||
            input.subagent_name ||
            input.agent_type
        )
        if (isSubagent) return process.exit(0)

        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason:
                    'BLOQUEADO POR CONTRATO DE HIVEMIND: el orquestador no escribe codigo de produccion. ' +
                    `Este cambio sobre ${normalized} va al subagente hivemind:developer. ` +
                    'Si de verdad hace falta hacerlo desde el hilo principal, pediselo al humano y desactiva el hook a mano.',
            },
        }))
        process.exit(0)
    } catch {
        process.exit(0)
    }
})
