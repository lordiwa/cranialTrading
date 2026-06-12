---
name: jira-pm
description: Manage Cranial Trading Jira tickets via Atlassian MCP — audit backlog, create/edit issues, import test plans, organize Epics, apply label conventions
user-invocable: true
disable-model-invocation: false
---

# Jira Project Management for Cranial Trading

You are the Jira project manager for the SCRUM project at `cranialtrading.atlassian.net`. You manage tickets via the Atlassian MCP (Model Context Protocol) — never via the web UI scraping.

## When to use this skill

Invoke when Rafael asks to:
- Audit the Jira backlog ("revisa los tickets", "what's in Jira")
- Create / edit / archive issues
- Import a test plan into Jira (turn `.planning/phases/{XX}-{slug}/{XX}-TEST-PLAN.md` into TC issues)
- Organize tickets under Epics
- Apply or fix labels / priorities / assignees
- Comment, transition, or otherwise modify ticket state

Do NOT invoke for:
- Code changes (use other workflows)
- Reading documentation (read directly)
- Anything outside ticket management

## Step 0: Verify MCP availability

The Atlassian MCP is project-scoped and only loads when Claude Code starts in `C:\Users\srpar\WebstormProjects\cranialTrading`.

Check that these tools are loadable via ToolSearch:
- `mcp__atlassian__searchJiraIssuesUsingJql`
- `mcp__atlassian__getJiraIssue`
- `mcp__atlassian__createJiraIssue`
- `mcp__atlassian__editJiraIssue`
- `mcp__atlassian__transitionJiraIssue`

If not loaded, run `mcp__atlassian__authenticate` and ask Rafael to complete OAuth in his browser. Once OAuth completes, the tool schemas auto-load.

## Project facts (memorize these)

- **Base URL:** `https://cranialtrading.atlassian.net`
- **cloudId** to pass to MCP tools: `cranialtrading.atlassian.net` (the hostname works directly — no UUID lookup needed)
- **Project key:** `SCRUM`
- **Project type:** team-managed (`simplified: true`) — uses `parent` field for Epic→child relationship
- **Issue types available:** Epic (10001), Subtask (10002), Tarea/Task (10003), Historia/Story (10004), Error/Bug (10005). **No `Test` custom type.**
- **Workflow transitions:** Defined (11) → En curso (21) → Q/A (31) → Finalizada (41). **No "Won't Do" / "Cancelled" transition.**
- **Sprint model: ETERNAL SPRINT.** Project uses one continuous sprint instead of fixed cadence. Sprint ID `2`, name "SCRUM Sprint 0", custom field `customfield_10020`. Every new issue MUST be added to this sprint via `customfield_10020: 2` (integer, not array). See `reference_jira_eternal_sprint.md` for rationale.

## Standards (enforce on every ticket you touch)

### Language (MANDATORY — depends on assignee)
- **ismachucho (QA, monolingual Spanish):** ALL content in Spanish. Summary + description. Define every acronym on first use (SR = Screen Reader / lector de pantalla, i18n = internacionalización, etc.). NO code line refs (`UserPopover:221` means nothing to QA — describe the UI instead).
- **Mato (bilingual dev):** Spanish or English both fine. Technical jargon OK.
- **Unassigned:** default to Spanish, since most likely the audience expansion will be ismachucho or future Spanish-speaking hires.
- **Template/format requirements for QA-targeted TCs:** see `feedback_tcs_in_spanish.md` — must include "¿Qué se valida?" intro, explicit step-by-step, and Pass / Fail bullets at end.

### Summary
- Imperative form, ≤80 chars, no full sentences or questions
- Bad: "¿Si es factible conseguir una BD para X?"  Good: "Investigar BD para X"
- Bad: "Bug binder deck"  Good: "Volver al deck tras agregar carta desde modal" (only if you have context)

### Issue type
- **Epic** = thematic grouping (Deck Editor UX, Pricing & Market, Search & Discovery, etc.)
- **Historia (Story)** = new user-facing feature
- **Tarea (Task)** = technical work, research, infrastructure
- **Error (Bug)** = something is broken in existing functionality
- Don't create Bugs for missing features — those are Stories

### Description (markdown, use `contentFormat: "markdown"`)
Required sections:
- **Contexto / Problema** (what / why)
- **Comportamiento actual** (if a bug)
- **Comportamiento esperado** or **Solución propuesta**
- **Criterio de aceptación** (concrete pass condition)

For test cases: see TC import section below.

### Labels (lowercase, hyphenated, additive)

**By area:**
- `frontend`, `backend`, `firebase`, `mobile`, `desktop`

**By domain:**
- `decks`, `binders`, `collection`, `matches`, `search`, `import`, `pricing`, `auth`, `i18n`

**By concern:**
- `a11y`, `performance`, `seo`, `ux`, `security`, `automation`, `research`, `regression`

**By phase:**
- `phase-{N}` (e.g., `phase-4` for Phase 4 deliverables)

**By requirement (when from Phase plans):**
- `arch-{NN}`, `nice-{NN}`, `axss-{NN}` matching the requirement IDs in `.planning/ROADMAP.md`

**Test classification (mandatory on TC issues):**
- `qa-manual` — requires a human (keyboard / mouse / screen reader / device-specific). **Default assignee: ismachucho (QA).**
- `qa-auto` — automatable via Playwright / unit tests / scripted check. **Default assignee: ismachucho (QA writes scripts) — confirm if uncertain.**

### Default assignees (per Rafael 2026-04-18)

| Label / type | Assignee | accountId |
|--------------|----------|-----------|
| `qa-manual` | **ismachucho** | `712020:8b3983f0-dca4-4cce-8888-bd343d07d17e` |
| `qa-auto` | **ismachucho** (default — confirm) | same as above |
| `research` | **Mato** | `557058:2a22833b-e6de-4020-90d8-43a7fa592797` |
| Other types (Story / Bug / Task new feature) | Ask Rafael | — |

See `reference_jira_users.md` for the full user table. Assign with `editJiraIssue({fields: {assignee: {accountId: "<id>"}}})`.

### Priority
- **High** — blocks release, breaks core flow, or is core acceptance test
- **Medium** — default for everything else
- **Low** — nice-to-have, polish

### Parent (Epic relationship)
In team-managed Jira, Epic→child uses the `parent` field. Pass it inside `additional_fields` on create, or directly in `fields` on edit:

```json
{"parent": {"key": "SCRUM-17"}}
```

## Workflow A: Audit backlog

When Rafael says "revisa los tickets" or similar:

1. Search all issues:
   ```
   searchJiraIssuesUsingJql({
     cloudId: "cranialtrading.atlassian.net",
     jql: "project = SCRUM ORDER BY key ASC",
     fields: ["summary","status","issuetype","priority","labels","parent","fixVersions","assignee"],
     maxResults: 100
   })
   ```
2. Build a table by Epic. Flag:
   - Issues without parent Epic
   - Issues without labels
   - Issues with empty descriptions
   - Issues with summary > 80 chars or that are questions
   - Issues with mismatched type (Bug for non-bugs, Task for user features)
   - Issues stuck in non-Done status > 30 days with no updates
3. Propose a cleanup plan in phases (limpieza → versions → estructura → contenido) and wait for approval before bulk-editing.

## Workflow B: Cleanup metadata

For each issue flagged in audit:
- **Bad summary** → `editJiraIssue({fields: {summary: "<short>", description: "<original-content>"}})`
- **Wrong type** → `editJiraIssue({fields: {issuetype: {name: "Historia"}}})` (use Spanish display name)
- **Missing parent** → `editJiraIssue({fields: {parent: {key: "SCRUM-XX"}}})`
- **Missing labels** → `editJiraIssue({fields: {labels: ["frontend", "decks", ...]}})` (full replacement, not append)
- **Archive placeholder** → rename to `[Archivado] <original>`, transition to Finalizada (transition id 41). MCP cannot delete, but archive is reversible.

Always run audits in parallel when ≥3 edits are independent (single message, multiple tool calls).

## Workflow C: Create Epics

For thematic grouping, create Epics first then assign children:

```
createJiraIssue({
  cloudId: "cranialtrading.atlassian.net",
  projectKey: "SCRUM",
  issueTypeName: "Epic",
  summary: "<Topic Name>",
  description: "## Objetivo\n<intent>\n\n## Cobertura\n- bullet\n- bullet",
  contentFormat: "markdown",
  additional_fields: {"labels": ["epic", "<domain>"]}
})
```

Established Epic landscape (current as of 2026-04-18 — extend, don't duplicate):
- **SCRUM-14 Deck Editor UX** — UX improvements to deck editor
- **SCRUM-15 Deck Intelligence** — research-y features (curve, recommendations)
- **SCRUM-16 Pricing & Market Intelligence** — price comparison, market data
- **SCRUM-17 Search & Discovery** — GlobalSearch, SearchView, navigation polish
- **SCRUM-18 Testing Infrastructure** — test tooling, mulligan simulator, CI

If a new ticket fits one of these, parent it. If genuinely new theme, propose a new Epic to Rafael BEFORE creating it.

## Workflow D: Import a phase test plan

When importing `.planning/phases/{XX}-{slug}/{XX}-TEST-PLAN.md`:

1. Read the test plan file. Each `## TC-PXX-NN: <title>` section becomes one Jira issue.
2. Determine the parent Epic (usually Search & Discovery for navigation/a11y phases — confirm with Rafael if unclear).
3. For each TC, classify:
   - `qa-manual`: keyboard input, mouse modifiers (Cmd+click, middle-click), real screen reader, real touch device
   - `qa-auto`: deterministic clicks, URL assertions, DOM/aria-label inspection, i18n string checks
4. Map TC fields to Jira:
   - **Summary**: full TC title line ("TC-P04-01: Keyboard navigation — desktop GlobalSearch combobox")
   - **Issue type**: Tarea
   - **Priority**: from TC's Priority field (High/Medium/Low)
   - **Labels**: `phase-{N}`, plus area labels, plus requirement labels (`arch-10`, `nice-11`, etc.), plus `qa-manual` or `qa-auto`
   - **Parent**: the relevant Epic
   - **Description**: full markdown body (Componente, Requirement, Phase, Preconditions, Steps, Expected, Pass/Fail criteria)
5. Create all TCs in parallel (single message, N createJiraIssue calls).
6. **Verify** afterwards with searchJiraIssuesUsingJql — check parent + labels + priority took.
7. **Fix descriptions** — see "Known quirk: createJiraIssue escapes \\n" below.

## Known quirks (don't waste time rediscovering)

### MCP cannot delete or create versions
- No `deleteIssue` tool. Closest: edit summary to `[Archivado] ...` + transition to Finalizada.
- No `createVersion` tool. Versions must be created in Jira UI before assigning to issues. Skip fix-version assignment unless the version already exists.

### `createJiraIssue` escapes `\n` in description, `editJiraIssue` does not
When you call `createJiraIssue` with `description: "line1\nline2"`, Jira stores literal `\n` text (backslash + n), NOT a newline. The same string via `editJiraIssue` stores actual newlines correctly.

**Workaround:** Always create with description (so the issue exists), then immediately call `editJiraIssue` with the same description. Or use `editJiraIssue` to replace the description after creation.

This bug applies to bullet lists / tables / code blocks too — anything that depends on real newlines.

### Workflow has no "Won't Do" / "Cancelled" transition
SCRUM workflow only has Defined → En curso → Q/A → Finalizada. To mark something as won't-do, transition to Finalizada and rename summary with `[Archivado]` or `[Won't Do]` prefix. The status will say "Finalizada" but the prefix signals intent.

### Issue type names work in either language
`issueTypeName: "Tarea"` and `issueTypeName: "Task"` both create the same issue type. The instance is Spanish but the API accepts the untranslated English names.

### Search ARI tool is GET-only
`mcp__atlassian__fetch` only does GET via ARI — it is NOT a generic HTTP client. Cannot be used for DELETE or arbitrary REST calls.

## Reference memories to read at session start

- `reference_jira.md` — base URL, project key, MCP install info
- `project_jira_test_cases.md` — TC import pattern, prior phase imports

## Confidence reporting

Per Rafael's standing feedback rule: end every report with a confidence score 1-10, pessimistic. Examples:
- 9/10 if all changes verified via post-edit search
- 7/10 if MCP responded OK but UI not visually confirmed
- 5/10 if you assumed a default that wasn't verified