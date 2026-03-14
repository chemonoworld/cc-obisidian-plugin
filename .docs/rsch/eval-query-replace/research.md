---
id: rsch-eval-query-replace-001
stage: rsch
feature: eval-query-replace
title: "Research: eval_query Replacement Strategy"
created: 2026-03-14
updated: 2026-03-14
tags: [rsch, eval-query-replace, security]
status: active
refs: []
decisions: []
---

# Research: eval_query Replacement Strategy

## Executive Summary

The `eval_query` tool — which executes arbitrary JavaScript in Obsidian's Electron process — is a security liability that no other Obsidian MCP server replicates. All three competing servers (cyanheads, jacksteamdev, MarkusPfundstein) use purpose-built, constrained tool interfaces instead. The current regex-based guardrail has documented bypasses (template literals, constructor chains, bracket notation) and cannot be fundamentally fixed because static regex analysis is structurally inadequate for sandboxing arbitrary code, as confirmed by the vm2 postmortem.

The eval_query tool can be replaced without significant capability loss through two complementary strategies: (1) wrapping the ~96 unwrapped Obsidian CLI v1.12+ commands as purpose-built MCP tools — particularly `files`, `links`, `unresolved`, `deadends`, `tasks`, `tags:rename`, `property:read`, `outline`, and `aliases` — and (2) exposing Dataview DQL as a safe, declarative query interface for complex vault queries. DQL is read-only by design and cannot access the filesystem, network, or execute arbitrary code, making it safe to expose via MCP with no guardrail needed.

Removal of eval_query from the codebase is clean: it has zero consumers beyond its own guardrail, and deletion touches only four files (`guardrail.ts`, `tests/guardrail.test.ts`, the `eval_query` entry in `tools.ts`, and `evalQuery` in `search.ts`).

---

## 1. Security Analysis: Why eval_query Must Be Replaced

### The Execution Environment

Code submitted through `eval_query` runs inside Obsidian's Electron main process via the Obsidian CLI `eval` command. This process has:

- Full Node.js API access (`fs`, `child_process`, `net`, etc.)
- Complete filesystem read/write on the host machine
- Shell command execution capability
- Access to all Obsidian internal APIs and loaded plugins

There is no sandbox — the code runs with the full privileges of the Obsidian desktop application.

### Known Guardrail Bypasses

The current `src/guardrail.ts` uses multi-layer static regex analysis. Three confirmed bypass vectors exist:

| Bypass | Example | Why It Passes |
|--------|---------|---------------|
| Template literal interpolation | `` ${require('fs')} `` | Template literal stripping is simplified; does not handle nested expressions |
| Constructor chain | `({}).constructor.constructor('return process')()` | Not in blocked pattern list; reaches `Function` constructor indirectly |
| Bracket notation for writes | `app.vault.adapter['write'](...)` | Write patterns only check dot-notation access |

### Why Static Regex Cannot Be Fixed

The vm2 project (the most sophisticated Node.js sandbox) was abandoned in 2023 after years of CVEs, with maintainers concluding that sandboxing JavaScript within JavaScript is fundamentally impossible without VM-level isolation. The guardrail approach — blocking known-bad patterns — is a "whack-a-mole" game: every new bypass requires a new regex, while attackers only need to find one uncovered path.

---

## 2. Competitive Landscape: No Other MCP Server Uses eval

All three known Obsidian MCP servers avoid arbitrary code execution entirely:

| Server | Tools | Approach | eval? |
|--------|-------|----------|-------|
| cyanheads/obsidian-mcp-server | 8 purpose-built tools | Obsidian Local REST API with constrained interfaces | No |
| jacksteamdev/obsidian-mcp-tools | Semantic search + Templater | Explicitly states "never gives AI direct access to vault files" | No |
| MarkusPfundstein/mcp-obsidian | 7 tools with JsonLogic search | Obsidian Local REST API; JsonLogic for structured queries | No |

The industry pattern is clear: purpose-built, constrained tools rather than general-purpose code execution.

---

## 3. Replacement Strategy: CLI Command Wrapping

### Available CLI Commands

Obsidian CLI v1.12+ exposes approximately 115 commands. The current plugin wraps only ~19 of these. High-priority unwrapped commands that directly replace common `eval_query` use cases:

| CLI Command | Replaces eval_query Pattern | Priority |
|-------------|----------------------------|----------|
| `files` / `file` | File listing, metadata queries | High |
| `folders` / `folder` | Directory traversal | High |
| `links` | Outgoing link enumeration (`app.metadataCache.getFileCache().links`) | High |
| `unresolved` | Broken/dangling link detection | High |
| `deadends` | Files with no outgoing links | High |
| `tasks` / `task` | Task listing and management | High |
| `tags:rename` | Bulk tag renaming | High |
| `property:read` | Read specific frontmatter property value | High |
| `outline` | Document structure / heading extraction | Medium |
| `aliases` | Alias management | Medium |

### Implementation Pattern

New tools follow the established `ToolDef` pattern in `src/tools.ts`:

```typescript
{
  name: "list_links",
  description: "List all outgoing links from a note.",
  schema: {
    file: z.string().describe("Path to the note file"),
  },
  handler: (a) => search.listLinks(a as { file: string }),
}
```

Each handler calls `execObsidian()` with the appropriate CLI command, matching the existing pattern in `src/tools/search.ts`.

---

## 4. Replacement Strategy: Dataview DQL

### What DQL Provides

Dataview DQL is a declarative, SQL-like query language for Obsidian vaults supporting four output types: `TABLE`, `LIST`, `TASK`, and `CALENDAR`. It enables complex vault queries — filtering by metadata, dates, tags, links — without any code execution.

**Key safety properties:**
- Read-only by design — cannot modify files
- No filesystem access beyond vault metadata
- No network access
- No code execution (unlike DataviewJS, which had CVE-2021-42057)

### Exposure as MCP Tool

DQL can be safely exposed via a fixed eval template that prevents code injection:

```typescript
// Safe: DQL string is passed as data, not code
const code = `return JSON.stringify(
  await app.plugins.plugins.dataview?.api?.query(${JSON.stringify(dql)})
)`;
```

The `JSON.stringify` wrapper ensures the DQL string is treated as a literal value, not executable code. The eval target is a fixed template — the user-supplied DQL string cannot break out of the `query()` argument.

### DQL vs eval_query Coverage

| Use Case | eval_query | DQL | CLI Tools |
|----------|-----------|-----|-----------|
| List files with property X | Yes | Yes | `property:read` |
| Find tasks due this week | Yes | Yes | `tasks` |
| Graph traversal (2+ hops) | Yes | Partial | No |
| Plugin API access | Yes | No | No |
| Bulk tag rename | Yes | No | `tags:rename` |
| File/folder listing | Yes | No | `files`/`folders` |
| Heading/outline extraction | Yes | No | `outline` |

DQL + CLI tools together cover the majority of eval_query use cases. The remaining gap — multi-hop graph traversal and direct plugin API access — represents power-user scenarios that may warrant a future, more carefully scoped tool.

---

## 5. MCP Specification Guidance

The MCP specification (2025-03-26 draft) provides relevant guidance:

- **"Tools represent arbitrary code execution and must be treated with appropriate caution"** — the spec explicitly acknowledges the risk
- **Tool annotations** available: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` — new replacement tools should use these
- **Human-in-the-loop** is a SHOULD-level requirement — purpose-built tools with clear descriptions better support user review than opaque code blobs

---

## 6. Codebase Context

### Removal Surface

The eval_query tool has zero consumers beyond its own guardrail. Removal is clean:

| File | Action |
|------|--------|
| `src/guardrail.ts` | Delete entirely |
| `tests/guardrail.test.ts` | Delete entirely |
| `src/tools.ts:139-154` | Remove `eval_query` entry from tools array |
| `src/tools/search.ts:74-98` | Remove `evalQuery` function |
| `src/tools/search.ts:3` | Remove `validateEvalCode` import |

### New Tool Integration Points

New CLI-wrapping tools follow the existing patterns:
- **Tool definition**: `ToolDef` in `src/tools.ts` (name/description/schema/handler)
- **Handler implementation**: Export async function from `src/tools/search.ts` (or a new file for the DQL tool)
- **CLI execution**: `execObsidian(command, args, { vault: vault() })` pattern
- **Response**: `ok(JSON.stringify(data))` / `fail(error)` helpers

---

## 7. Recommendations

1. **Remove eval_query immediately.** The guardrail provides a false sense of security. Known bypasses grant full system access. No competing server exposes eval.

2. **Wrap high-priority CLI commands first.** Start with `links`, `unresolved`, `deadends`, `tasks`, and `property:read` — these cover the most common eval_query patterns with minimal implementation effort.

3. **Add a `dataview_query` tool for DQL.** Use the fixed-template approach with `JSON.stringify` for safe parameter injection. Gate availability on Dataview plugin being installed.

4. **Apply MCP tool annotations** to all new tools: `readOnlyHint: true` for query tools, `destructiveHint: false`, `idempotentHint: true`.

5. **Do not implement DataviewJS support.** It has the same security profile as eval_query (CVE-2021-42057) and provides no safety benefit.

6. **Document the migration** for any users relying on eval_query, showing equivalent DQL or CLI tool alternatives for common patterns.

---

## 8. Open Questions

- **Dataview plugin availability**: Should `dataview_query` fail gracefully when Dataview is not installed, or should it not be registered at all? Graceful failure is simpler; conditional registration is cleaner.

- **Graph traversal gap**: Multi-hop link traversal (e.g., "find all notes 2 links away from X") cannot be expressed in DQL or single CLI commands. Is this a real user need that requires a purpose-built `graph_query` tool, or is it edge-case enough to defer?

- **CLI command stability**: The Obsidian CLI is relatively new (v1.12+). Are command names and output formats stable enough to rely on, or should tool implementations include version checking?

- **Phased rollout**: Should eval_query be removed in the same release that adds replacement tools, or should there be a deprecation period with a warning message directing users to alternatives?
