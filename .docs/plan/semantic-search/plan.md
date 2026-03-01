---
feature: semantic-search
phase: plan
status: complete
date: 2026-03-01
---

# Semantic Search — Implementation Plan

## Overview

Implement semantic search for the Obsidian MCP plugin using local embedding models (`Xenova/bge-m3` via `@huggingface/transformers`), SQLite vector storage (`sqlite-vec` + `better-sqlite3`), and git-based change detection. The feature is opt-in, on-demand (indexing runs at search time), and stores embeddings in a per-vault SQLite database.

## Subtask Summary

| # | Slug | Size | Depends On | Description |
|---|------|------|------------|-------------|
| 01 | chunk | S | — | Markdown heading-aware chunker |
| 02 | store | M | — | SQLite + vec0 store with CRUD operations |
| 03 | model | S | — | HuggingFace pipeline singleton wrapper |
| 04 | change | M | — | Git/hash change detection |
| 05 | facade | M | 01, 02, 03, 04 | Orchestrator facade: init, index, search |
| 06 | tool-integration | S | 05 | Tool handler, config extension, registration |
| 07 | tests | M | 01, 02, 03, 04, 05, 06 | Unit + integration tests |

## Dependency Graph

```
Wave 1 (parallel):  01-chunk  02-store  03-model  04-change
                        \         |         |        /
                         \        |         |       /
Wave 2:                   \       v         v      /
                            ---→ 05-facade ←------
                                    |
Wave 3:                             v
                            06-tool-integration
                                    |
Wave 4:                             v
                               07-tests
```

## Wave Plan

- **Wave 1** (parallel, no deps): `01-chunk`, `02-store`, `03-model`, `04-change`
- **Wave 2** (depends on all Wave 1): `05-facade`
- **Wave 3** (depends on Wave 2): `06-tool-integration`
- **Wave 4** (depends on all): `07-tests`

## Implementation Notes

### Critical Verified API Details
- **Model**: `Xenova/bge-m3` with `dtype: 'int8'` (MUST be explicit — unquantized loading bug)
- **Pooling**: CLS pooling with `normalize: true`, NO prefix needed
- **sqlite-vec**: NO UPSERT → delete+reinsert in transaction
- **better-sqlite3**: Pass `Float32Array` directly (NOT `.buffer`)
- **Dependencies**: Use `optionalDependencies` in package.json; lazy-load via dynamic `import()` to avoid breaking when not installed

### Conventions to Follow
- ESM modules (`.js` extension in imports)
- 3-layer error handling: never throw → check success → return `fail()`
- Use `ok()` and `fail()` helpers from `src/tools/helpers.ts` in tool handler
- Zod schemas for tool input validation
- Vitest for testing, vi.mock() pattern from existing tests
