---
id: arch-eval-query-replace-001
title: "Architecture: eval_query Replacement"
stage: architecture
status: complete
date: 2026-03-14
refs: [rsch-eval-query-replace-001]
decisions: [ADR-009, ADR-010, ADR-011]
---

# Architecture: eval_query Replacement

## Overview

The `eval_query` tool executes arbitrary JavaScript in Obsidian's Electron process — a security liability with documented guardrail bypasses (template literal interpolation, constructor chains, bracket notation). Research ([@rsch-eval-query-replace-001]) confirmed that no competing Obsidian MCP server exposes arbitrary code execution, and that static regex analysis is structurally inadequate for sandboxing JS.

This architecture replaces `eval_query` with six purpose-built, constrained MCP tools that wrap Obsidian CLI commands and Dataview DQL queries. The approach was selected from three candidates (Minimal, Clean, Pragmatic) and scored 24/25 by the architecture reviewer for feasibility, pattern consistency, and risk management.

## Goals & Constraints

### Goals
- Remove all arbitrary JavaScript execution from the MCP server
- Maintain coverage of common eval_query use cases (file listing, links, tasks, vault queries)
- Expose Dataview DQL as a safe, declarative query interface
- Follow existing handler patterns — no new abstractions or shared wrappers

### Constraints
- Must follow the project's file-per-domain convention (`tools/*.ts`)
- Handlers must use the established `execObsidian → ok/fail` pattern
- No new runtime dependencies
- Dataview DQL tool must work without a guardrail (fixed template approach)

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Claude Code                         │
│                  (MCP Client)                         │
└─────────────────────┬────────────────────────────────┘
                      │ stdin/stdout (JSON-RPC)
┌─────────────────────▼────────────────────────────────┐
│  src/tools.ts  —  Tool Registry & Dispatch            │
│                                                       │
│  - Remove: eval_query (1 entry)                      │
│  + Add: 6 new query tools                            │
└────┬────────────┬─────────────┬──────────────────────┘
     │            │             │
┌────▼────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────────────┐
│ crud.ts │ │search.ts │ │ vault.ts │ │ query.ts   │  ← NEW
└────┬────┘ └────┬─────┘ └────┬─────┘ └────┬───────┘
     │            │             │             │
┌────▼────────────▼─────────────▼─────────────▼──────┐
│  src/cli.ts  —  CLI Executor                        │
│  execObsidian(command, args, options)                │
└─────────────────────┬──────────────────────────────┘
                      │ child_process.execFile
┌─────────────────────▼────────────────────────────────┐
│              Obsidian CLI (v1.12)                      │
│  files | links | deadends | unresolved | tasks | eval │
└──────────────────────────────────────────────────────┘
```

### Flow Summary

All six new tools follow the same flow: receive validated args from the tool registry → call `execObsidian()` with the appropriate CLI command → return `ok(JSON.stringify(data))` or `fail(error)`. The `dataview_query` tool uses a fixed JavaScript template with `JSON.stringify` to safely embed DQL strings in the `eval` CLI command.

## Component Design

### Component: query.ts (NEW)

- **Responsibility**: Handler module for vault query tools — file listing, link analysis, task queries, and Dataview DQL
- **Location**: `src/tools/query.ts`
- **Interface**:
  ```typescript
  /**
   * Vault query handlers — structured access to vault metadata.
   *
   * "query" vs "search": search.ts handles text/semantic search against note
   * content. query.ts handles structural vault queries — files, links, tasks,
   * and metadata — via Obsidian CLI commands and Dataview DQL.
   */

  export async function listFiles(args: {
    folder?: string;
    ext?: string;
  }): Promise<ToolResponse>

  export async function listLinks(args: {
    file: string;
  }): Promise<ToolResponse>

  export async function findDeadends(
    _args: Record<string, never>
  ): Promise<ToolResponse>

  export async function findUnresolved(
    _args: Record<string, never>
  ): Promise<ToolResponse>

  export async function listTasks(args: {
    file?: string;
    status?: string;
    done?: boolean;
    todo?: boolean;
  }): Promise<ToolResponse>

  export async function dataviewQuery(args: {
    query: string;
  }): Promise<ToolResponse>
  ```
- **Dependencies**: `../cli.js` (execObsidian), `./helpers.js` (ok, fail, vault)
- **Dependents**: `src/tools.ts` (tool registry)
- **Key details**: Each handler is 5–8 lines. The `dataviewQuery` handler constructs a fixed JS template using `JSON.stringify(args.query)` to embed the DQL string safely — the user never writes JavaScript. A JSDoc module comment explains the "query" vs "search" domain boundary per reviewer feedback.

### Component: tools.ts (MODIFIED)

- **Responsibility**: Tool registry — defines all MCP tools and dispatches calls
- **Location**: `src/tools.ts`
- **Changes**:
  - Remove `eval_query` entry (lines 139–154)
  - Remove `import { validateEvalCode }` path (indirect via search import)
  - Add `import * as query from "./tools/query.js"` (matches existing `import * as search` style)
  - Add 6 new tool definitions for query handlers

### Component: search.ts (MODIFIED)

- **Responsibility**: Search handlers — text search, tags, properties, backlinks, orphans
- **Location**: `src/tools/search.ts`
- **Changes**:
  - Remove `evalQuery` function (lines 74–98)
  - Remove `import { validateEvalCode } from "../guardrail.js"` (line 3)

### Component: guardrail.ts (DELETE)

- **Location**: `src/guardrail.ts`
- **Reason**: No remaining consumers. The `dataview_query` tool uses a fixed template approach that makes the guardrail unnecessary.

### Component: guardrail.test.ts (DELETE)

- **Location**: `tests/guardrail.test.ts`
- **Reason**: Test file for deleted module.

## Data Flow

### Standard CLI Query (list_files, list_links, find_deadends, find_unresolved, list_tasks)

```
1. MCP Client sends tool call (e.g., list_links { file: "My Note" })
2. tools.ts dispatches to query.listLinks(args)
3. query.listLinks calls execObsidian("links", { file: "My Note" }, { vault: vault() })
4. cli.ts spawns: obsidian links file="My Note" --vault=VaultName
5. CLI returns JSON to stdout
6. execObsidian parses → { success: true, data: [...] }
7. Handler returns ok(JSON.stringify(data))
```

### Dataview DQL Query (dataview_query)

```
1. MCP Client sends: dataview_query { query: "TABLE file.name FROM #project" }
2. tools.ts dispatches to query.dataviewQuery(args)
3. Handler builds fixed JS template:
     code = `return JSON.stringify(
       await app.plugins.plugins.dataview?.api?.query(${JSON.stringify(dql)})
     )`
   where JSON.stringify("TABLE file.name FROM #project")
   produces: "TABLE file.name FROM #project" (escaped string literal)
4. Handler calls execObsidian("eval", { code }, { vault: vault() })
5. Obsidian executes the fixed template — DQL string is data, not code
6. Dataview plugin processes the DQL query (read-only)
7. Result returned as JSON → ok(JSON.stringify(data))
```

## Integration Points

| Existing System | New Component | Integration Method | Notes |
|-----------------|---------------|-------------------|-------|
| `src/tools.ts` tool registry | `query.ts` handlers | `import * as query` | Matches `import * as search` / `import * as crud` style |
| `src/cli.ts` CLI executor | `query.ts` handlers | `execObsidian()` calls | Same pattern as all existing handlers |
| `src/tools/helpers.ts` | `query.ts` handlers | `ok()`, `fail()`, `vault()` | Shared response helpers |
| Obsidian CLI `eval` | `dataviewQuery` handler | Fixed JS template via `execObsidian("eval", ...)` | Only CLI command reused from old eval_query |
| Dataview plugin | `dataviewQuery` handler | `app.plugins.plugins.dataview.api.query()` | Plugin must be installed; graceful failure if absent |

## File Changes

| Action | Path | Description |
|--------|------|-------------|
| create | `src/tools/query.ts` | 6 query handler functions + JSDoc module comment |
| create | `tests/tools/query.test.ts` | Unit tests for all 6 handlers, including DQL edge cases |
| modify | `src/tools.ts` | Remove eval_query entry; add 6 query tool entries; add `import * as query` |
| modify | `src/tools/search.ts` | Remove `evalQuery` function and guardrail import |
| modify | `tests/tools/search.test.ts` | Remove evalQuery test cases |
| modify | `tests/tools.test.ts` | Update tool count (20→25) and name assertions |
| delete | `src/guardrail.ts` | No remaining consumers |
| delete | `tests/guardrail.test.ts` | Test file for deleted module |

## Decisions

- [@ADR-009]: Remove eval_query entirely — the regex guardrail has documented bypasses and cannot be fundamentally fixed
- [@ADR-010]: Create `query.ts` as a new handler module — domain separation between "search" (text/semantic) and "query" (structural metadata)
- [@ADR-011]: Use a fixed eval template for Dataview DQL — `JSON.stringify` escaping eliminates code injection without a guardrail

## Trade-offs

| Dimension | Chosen Approach | Alternative | Rationale |
|-----------|----------------|-------------|-----------|
| Eval capability | Remove entirely | Keep with improved guardrail | Static regex cannot sandbox JS; known bypasses grant full system access |
| Module organization | New `query.ts` file | Extend `search.ts` | File-per-domain convention; "query" and "search" are distinct domains |
| DQL safety | Fixed template + JSON.stringify | Guardrail on user JS | Template is hardcoded; user never writes JavaScript |
| Handler abstraction | Inline per-handler | Shared CLI wrapper function | Handlers are 5–8 lines; DRY abstraction adds indirection without meaningful dedup |
| Guardrail cleanup | Delete immediately | Keep for future use | Zero remaining consumers; dead code adds maintenance burden |

## Testing Strategy

- **Unit tests** (`tests/tools/query.test.ts`): Mock `execObsidian` via `vi.mock("../cli.js")`. Test each handler for success path, error path, and parameter forwarding. For `dataviewQuery`, verify the generated JS template string is correct.
- **DQL edge cases**: Test queries containing special characters — double quotes, single quotes, backticks, backslashes, unicode characters, newlines — to verify `JSON.stringify` escaping handles all cases correctly (per reviewer feedback).
- **Integration with tool registry** (`tests/tools.test.ts`): Verify tool count is 25 and all 6 new tool names are registered.
- **Regression**: Confirm no remaining imports of `guardrail.ts` after deletion.

## Security Considerations

- **eval_query removal eliminates the primary attack surface**: Arbitrary JS execution in Obsidian's Electron process with full Node.js API access is replaced by constrained, purpose-built tools.
- **dataview_query is safe by construction**: The fixed template `return JSON.stringify(await app.plugins.plugins.dataview?.api?.query(${JSON.stringify(dql)}))` ensures user input is always a string literal argument to `query()`. The user cannot inject executable code because `JSON.stringify` escapes all control characters.
- **DQL is read-only by design**: Dataview's query language cannot modify files, access the filesystem, or make network requests. This is a property of the Dataview plugin, not our code.
- **CLI tools use `execFile`**: All CLI invocations go through the existing `execObsidian` function which uses `execFile` with array args ([@ADR-002]), preventing shell injection.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dataview plugin not installed | M | L | `dataviewQuery` returns a clear error message when `app.plugins.plugins.dataview?.api` is undefined (optional chaining + null check) |
| DQL query with unusual characters breaks template | L | M | `JSON.stringify` handles all edge cases by spec; test suite covers quotes, backticks, unicode, and newlines |
| Users relying on eval_query lose capability | L | M | Document migration path showing DQL/CLI equivalents for common patterns; the 6 new tools cover the majority of use cases |
| CLI command output format changes in future Obsidian versions | L | M | Handlers return raw CLI output when JSON parsing fails; tests can catch format changes early |
| Multi-hop graph traversal no longer possible | L | L | This is an edge case not covered by DQL or CLI; can be addressed by a future purpose-built graph_query tool if demand materializes |

## Migration / Rollout

This is a single-release change with no deprecation period:

1. **Add** `src/tools/query.ts` with 6 handlers and `tests/tools/query.test.ts`
2. **Remove** `eval_query` from `src/tools.ts`, `evalQuery` from `src/tools/search.ts`
3. **Delete** `src/guardrail.ts` and `tests/guardrail.test.ts`
4. **Update** test assertions for new tool count

No feature flags or backwards compatibility shims. Users calling `eval_query` will receive an "Unknown tool" error. The README should document the replacement tools and provide DQL equivalents for common eval_query patterns.

## Open Questions

- [ ] Should `dataview_query` gracefully fail when Dataview is not installed, or should it be conditionally registered? Graceful failure is simpler and matches the current pattern.
- [ ] Should the `list_files` tool support glob patterns, or is folder + extension filtering sufficient for the initial release?
- [ ] Is multi-hop graph traversal a real user need that warrants a future `graph_query` tool, or is it edge-case enough to defer indefinitely?
