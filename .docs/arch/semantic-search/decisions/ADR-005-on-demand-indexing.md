---
feature: semantic-search
type: adr
id: ADR-005
status: accepted
date: 2026-03-01
---

# ADR-005: On-Demand Indexing at Search Time

## Context

Semantic search requires embedding all vault markdown files into a vector database before queries can be answered. There are two broad approaches for keeping this index up to date:

1. **Background watcher**: A file-system watcher (e.g., `chokidar`) runs continuously, indexing files as they change.
2. **On-demand indexing**: Indexing runs at the moment a search is requested, processing only files that have changed since the last run.

The plugin runs as an MCP server — a short-lived process invoked by the MCP client. There is no persistent daemon to host a background watcher between tool calls.

## Decision

Indexing runs on-demand at search time, not via a background file-system watcher.

On the first call to `semanticSearch()`, and whenever `reindex: true` is passed, the facade:
1. Calls `detectChanges()` to determine what is new, modified, or deleted since the last run.
2. Processes only the changed files.
3. Stores the current git commit (or content hashes) as a watermark.

Subsequent searches reuse the existing index without re-processing unless forced.

## Rationale

- The MCP server process does not persist between client calls in most deployment configurations, making a background watcher impractical.
- Incremental change detection (git diff or content hashing) ensures that repeat searches on an unchanged vault are fast — only the query embedding + vector search runs.
- Eliminates a background process and its associated resource consumption (CPU, memory, file handles).
- Simpler operational model: no watcher lifecycle to manage (start, stop, error recovery).

## Trade-offs

| Gained | Lost |
|---|---|
| No persistent background process | Index is not updated between search calls |
| Simpler lifecycle (no watcher start/stop) | First search after many edits can be slow |
| Works in short-lived MCP server processes | User must trigger `reindex: true` or run a search to pick up recent changes |
| Incremental updates keep repeat searches fast | Cannot proactively warm the index |

## Consequences

- `semanticSearch()` may have a noticeable latency on first call or after bulk edits. Callers should be aware that the first result may include indexing time.
- The `reindex` parameter on the tool gives users explicit control to force a fresh index.
- `index_meta` stores the last processed commit / timestamp so change detection can be efficient across calls.
- A future phase could add an explicit `index_vault` tool for pre-warming without running a search.
