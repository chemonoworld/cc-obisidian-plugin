---
feature: obsidian-cc-plugin
phase: research
status: complete
date: 2026-02-28
angles: [mcp-sdk, obsidian-cli, db-like-search]
---

# Research: Obsidian Claude Code MCP Plugin

## Executive Summary

MCP server (TypeScript/Node.js) that wraps the Obsidian CLI v1.12 to give Claude Code
structured access to an Obsidian vault. Key challenge: making markdown vault searchable
like a database. Solution: leverage Obsidian CLI's `search` operators, `eval` command
(full API access), and `base:query` for structured queries.

## 1. MCP SDK (TypeScript)

### Package & Setup
- `@modelcontextprotocol/sdk` v1.x (stable) + `zod` (peer dependency)
- Two APIs: `McpServer` (high-level, Zod-native) vs `Server` (low-level, explicit)
- **Recommendation**: Use low-level `Server` + `setRequestHandler` for v1.x compatibility
- `"type": "module"` required in package.json

### Transport
- **stdio** for Claude Code (spawns server as child process, JSON-RPC over stdin/stdout)
- Never use `console.log()` — corrupts protocol stream. Use `console.error()` for debug.
- HTTP/SSE also supported but unnecessary for local use

### Configuration
- **Claude Code**: `.mcp.json` at project root or `claude mcp add` CLI
- **Claude Desktop**: `claude_desktop_config.json`
- Supports env variable expansion: `${VAULT_PATH:-/default/path}`

### Primitives
- **Tools**: Model-initiated actions (search, read, write, etc.)
- **Resources**: Read-only data with URI addressing (vault://notes/*)
- **Prompts**: User-initiated templates (/summarize-note, /find-related)

### Tool Return Format
```typescript
return {
  content: [{ type: "text", text: JSON.stringify(result) }],
  isError: false // or true for expected failures
};
```

## 2. Obsidian CLI v1.12

### Architecture
- IPC bridge to running Obsidian Electron instance (not standalone)
- Syntax: `obsidian [vault=<name>] <command> [param=value ...] [flags]`
- `vault=` must be first arg. Accepts vault name or ID (not path).
- Output: per-command `format=json|tsv|csv|yaml|md|paths|tree|text`

### Key Commands for This Plugin

#### CRUD
| Command | Usage |
|---------|-------|
| `create` | `create name="Note" content="# Hello" [template=] [overwrite]` |
| `read` | `read file="Note"` or `read path="folder/note.md"` |
| `append` | `append file="Note" content="text" [inline]` |
| `prepend` | `prepend file="Note" content="text" [inline]` |
| `move` | `move file="Note" to="new/path.md"` |
| `delete` | `delete file="Note" [permanent]` |
| `rename` | `rename file="Note" name="NewName"` |

#### Search (DB-like)
| Command | Usage |
|---------|-------|
| `search` | `search query="tag:#work [status:active]" format=json limit=50` |
| `search:context` | Same + surrounding lines (grep-style) |
| `tags all` | `tags all counts format=json` — all vault tags with counts |
| `tag` | `tag name="work" verbose` — files with specific tag |
| `backlinks` | `backlinks file="Note" format=json` |
| `orphans` | `orphans` — no incoming links |
| `properties` | `properties all format=json` — all frontmatter properties |
| `property:read` | `property:read name="status" file="Note"` |

#### Search Operators (in `query=`)
- Full text: `meeting notes` (AND), `"exact phrase"`, `term1 OR term2`, `-exclude`
- Tag: `tag:#work` (uses metadata cache, fast)
- Path: `path:"Projects/Active"`
- File: `file:"report"`
- Frontmatter: `[status:active]`, `[priority:>3]`, `[due:<2026-03-01]`
- Scope: `line:(foo bar)`, `block:(foo bar)`, `section:(foo bar)`
- Regex: `/pattern/`
- Tasks: `task-todo:keyword`, `task-done:keyword`

#### The Power Tool: `eval`
```bash
obsidian eval code="app.vault.getFiles().length"
obsidian eval code="app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Note.md'))"
```
- Full access to Obsidian's `app` object (Vault, MetadataCache, Workspace)
- Can run Dataview queries if plugin installed
- Can access any installed plugin API

#### Bases (Database Views)
```bash
obsidian base:query file="Tasks.base" format=json
obsidian base:query file="Tasks.base" view="Active" format=json
```
- Queries pre-configured .base file views
- Bug: debug line may prefix JSON output (strip with `sed '1d'`)

### Known Issues
- Exit codes unreliable (always 0, even on failure) — validate stdout
- `properties format=json` returns YAML (bug) — use `format=tsv`
- `tags counts` without `all` returns empty — use `tags all counts`
- 13 documented silent failures across 57 test scenarios

### Performance
- Search: 6x faster than grep (uses Obsidian's in-memory index)
- Graph queries: 60x faster than file scanning
- Token efficiency: 70,000x vs raw file reads

## 3. DB-Like Search Strategy

### Layered Approach (Best to Worst)

**Layer 1 — Obsidian Search Operators (Primary)**
- `obsidian search query="[property:value] tag:#tag path:folder" format=json`
- Covers 80% of structured queries with zero custom code
- Uses Obsidian's pre-built index

**Layer 2 — `eval` with MetadataCache (Structured)**
- For complex queries: multi-property filters, computed fields, link graph traversal
- Access `app.metadataCache.getFileCache()` for parsed frontmatter, tags, links, headings
- Access Dataview API if installed: `app.plugins.plugins['dataview'].api.pages('#tag')`

**Layer 3 — `base:query` (Database Views)**
- For existing Bases configurations
- Returns structured table data as JSON/CSV

### Tool Design for AI Agents (Best Practices)
- Never return full content for list queries — metadata only
- Hard limit: default 25 results, max 100
- Always return `{ total, returned, truncated }` metadata
- Layered retrieval: search → select → read full content
- Support pagination with offset/limit

## 4. Runtime Vault Configuration

### Requirements
- User can set vault path/name at runtime (not just at startup)
- Default path must persist across sessions

### Implementation
- Store config in `~/.obsidian-cc-mcp/config.json`
- Provide `set_vault` tool for runtime switching
- Environment variable `OBSIDIAN_VAULT` as override
- CLI has `vaults` command to list available vaults

## 5. Critical Design Decisions

1. **CLI vs REST API vs Direct Filesystem**: CLI chosen — fastest, uses Obsidian's index,
   official support, no additional plugin dependency
2. **`eval` for complex queries**: Enables full Obsidian API access without building
   custom index. Trade-off: requires Obsidian running.
3. **No custom SQLite index needed**: Obsidian's built-in index (via CLI search + eval)
   eliminates the need to maintain a separate database
4. **stdio transport**: Standard for Claude Code local servers
