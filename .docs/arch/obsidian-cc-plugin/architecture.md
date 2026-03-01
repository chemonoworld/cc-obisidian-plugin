---
feature: obsidian-cc-plugin
phase: architecture
approach: pragmatic
status: complete
date: 2026-02-28
decisions: [ADR-001, ADR-002, ADR-003, ADR-004]
tools_count: 17
---

# Architecture: Obsidian Vault MCP Server

## Overview

MCP server (TypeScript/Node.js) that wraps Obsidian CLI v1.12 to give Claude Code
structured CRUD + search access to an Obsidian vault. The architecture is a thin CLI
wrapper — no custom database, no indexing, no REST API dependency. Obsidian's built-in
index (via CLI) handles all the heavy lifting.

## File Structure

```
cc-obisidian-plugin/
  package.json              — type: module, dependencies, scripts
  tsconfig.json             — ES2022, NodeNext modules, strict
  vitest.config.ts          — Test configuration
  .mcp.json                 — Example Claude Code MCP config
  src/
    index.ts                — Entry: Server creation, transport, handler registration (~80 lines)
    cli.ts                  — CLI executor: execObsidian(), arg building, output parsing (~120 lines)
    config.ts               — Config persistence: vault load/save, env override (~50 lines)
    types.ts                — Shared types: CliResult, SearchResponse, etc. (~60 lines)
    tools.ts                — Tool registry & dispatch router (~40 lines)
    tools/
      crud.ts               — CRUD handlers: read, create, update, delete, move, properties, daily
      search.ts             — Search handlers: search, tags, properties, backlinks, orphans, eval
      vault.ts              — Vault handlers: list, info, set
  tests/
    cli.test.ts             — CLI executor unit tests (mocked execFile)
    config.test.ts          — Config load/save tests (mocked fs)
    tools/
      crud.test.ts          — CRUD handler tests (mocked cli)
      search.test.ts        — Search handler tests (mocked cli)
      vault.test.ts         — Vault handler tests (mocked cli + config)
```

## Component Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Claude Code                         │
│                  (MCP Client)                         │
└─────────────────────┬────────────────────────────────┘
                      │ stdin/stdout (JSON-RPC)
┌─────────────────────▼────────────────────────────────┐
│  src/index.ts  —  MCP Server (StdioServerTransport)  │
│                                                       │
│  ListTools → allTools[]                               │
│  CallTool  → handleToolCall(name, args)               │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│  src/tools.ts  —  Tool Registry & Dispatch            │
│                                                       │
│  allTools: Tool[]     (definitions)                   │
│  handleToolCall()     (routes to handler module)      │
└────┬────────────┬─────────────┬──────────────────────┘
     │            │             │
┌────▼────┐ ┌────▼─────┐ ┌────▼─────┐
│ crud.ts │ │search.ts │ │ vault.ts │  Tool Handler Modules
└────┬────┘ └────┬─────┘ └────┬─────┘
     │            │             │
┌────▼────────────▼─────────────▼──────────────────────┐
│  src/cli.ts  —  CLI Executor                          │
│                                                       │
│  execObsidian(command, args, options) → ParsedCliResult│
│  buildArgv()  |  cleanOutput()  |  detectError()      │
└─────────────────────┬────────────────────────────────┘
                      │ child_process.execFile
┌─────────────────────▼────────────────────────────────┐
│              Obsidian CLI (v1.12)                      │
│      (requires running Obsidian desktop app)          │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  src/config.ts  —  Config Persistence                 │
│                                                       │
│  ~/.obsidian-cc-mcp/config.json                       │
│  getVault() | setVault() | loadConfig()               │
│  Priority: ENV > runtime > persisted                  │
└──────────────────────────────────────────────────────┘
```

## MCP Tools (17 total)

### CRUD Tools (8)
| Tool | CLI Command | Description |
|------|-------------|-------------|
| `read_note` | `read file=X` | Read full note content |
| `create_note` | `create name=X content=Y` | Create new note |
| `update_note` | `append/prepend file=X content=Y` | Append/prepend to note |
| `delete_note` | `delete file=X` | Delete note (trash/permanent) |
| `move_note` | `move file=X to=Y` | Move/rename note |
| `set_property` | `property:set name=X value=Y file=Z` | Set frontmatter property |
| `remove_property` | `property:remove name=X file=Z` | Remove frontmatter property |
| `daily_note` | `daily:read` / `daily:append` | Read/append daily note |

### Search Tools (6)
| Tool | CLI Command | Description |
|------|-------------|-------------|
| `search_notes` | `search query=X format=json` | Structured search with operators |
| `list_tags` | `tags all counts format=json` | List all tags with counts |
| `list_properties` | `properties all format=tsv` | List all frontmatter properties |
| `get_backlinks` | `backlinks file=X format=json` | Notes linking to a note |
| `find_orphans` | `orphans` | Notes with no incoming links |
| `eval_query` | `eval code=X` | Execute JS against Obsidian API |

### Vault Tools (3)
| Tool | CLI Command | Description |
|------|-------------|-------------|
| `set_vault` | (config write) | Switch active vault at runtime |
| `list_vaults` | `vaults format=json` | List available vaults |
| `vault_info` | `vault info=name` | Current vault info |

## Search Query Operators (available in `search_notes`)

```
Full text:    meeting notes     (AND)
Phrase:       "exact match"
Tags:         tag:#work tag:#urgent
Frontmatter:  [status:active] [priority:>3] [due:<2026-03-01]
Path:         path:"Projects/Active"
File name:    file:"report"
Regex:        /pattern/
Tasks:        task-todo:keyword  task-done:keyword
Boolean:      space=AND  OR  -exclude
Scope:        line:(foo bar)  block:(foo bar)  section:(foo bar)
```

## Config Persistence

File: `~/.obsidian-cc-mcp/config.json`
```json
{ "defaultVault": "MyVault" }
```

Resolution priority:
1. `process.env.OBSIDIAN_VAULT` (highest)
2. Runtime override (via `set_vault` tool, in-memory)
3. Persisted `defaultVault` from config file
4. `null` (let CLI use its own default)

## Error Handling (3 layers)

1. **CLI Layer** (`cli.ts`): Returns `ParsedCliResult { success, data, error }`. Never throws.
   - Detects errors from stdout content (exit codes unreliable)
   - Pattern matching: `/^Error:/`, `/^No .* found/`, `/^Cannot /`
2. **Tool Layer** (`tools/*.ts`): Checks `result.success`, throws `Error` if false.
3. **Dispatch Layer** (`tools.ts`): Catches all throws, returns MCP `{ isError: true }`.

## Key Design Decisions

- **ADR-001**: CLI over REST API/direct filesystem — uses Obsidian's index, no dependencies
- **ADR-002**: `execFile` over `exec` — array args eliminate shell injection
- **ADR-003**: No custom SQLite index — CLI search operators + eval cover all needs
- **ADR-004**: Module-level config state — singleton via Node.js module cache

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```
