---
feature: eval-query-replace
type: adr
id: ADR-010
title: Create query.ts as New Handler Module
status: accepted
date: 2026-03-14
refs: [arch-eval-query-replace-001, rsch-eval-query-replace-001]
---

# ADR-010: Create query.ts as New Handler Module

## Context

Six new tool handlers are being added to replace `eval_query` ([@ADR-009]). These handlers need a home in the `src/tools/` directory. Two options exist:

1. Add them to the existing `src/tools/search.ts` module
2. Create a new `src/tools/query.ts` module

The project follows a file-per-domain convention: `crud.ts` for CRUD operations, `search.ts` for text search operations, `vault.ts` for vault management, `semantic.ts` for semantic search, `auto-link.ts` for wiki link insertion.

## Decision

Create a new `src/tools/query.ts` module containing all six replacement handlers: `listFiles`, `listLinks`, `findDeadends`, `findUnresolved`, `listTasks`, and `dataviewQuery`.

## Rationale

- **Domain separation**: "search" and "query" are distinct concerns. `search.ts` handles text/semantic search against note content (full-text search, tags, properties, backlinks). `query.ts` handles structural vault queries — file metadata, link topology, task enumeration, and declarative DQL queries. These are different domains with different CLI commands.
- **File-per-domain convention**: The project already has one handler file per domain (`crud.ts`, `search.ts`, `vault.ts`, `semantic.ts`, `auto-link.ts`). Adding a sixth follows the established pattern.
- **Cohesion**: All six handlers query vault structure and metadata. They share the same import set (`execObsidian`, `ok`, `fail`, `vault`) and follow the same implementation pattern. Grouping them together is natural.
- **Size management**: `search.ts` currently has 5 handlers (after removing `evalQuery`). Adding 6 more would make it the largest handler file at 11 handlers, diluting its focus.

## Alternatives Considered

### Extend search.ts

- **Description**: Add all 6 handlers to the existing `src/tools/search.ts`
- **Pros**: No new file; fewer imports in `tools.ts`
- **Cons**: Mixes text search with structural queries; makes `search.ts` the largest handler file; weaker cohesion
- **Rejected because**: Violates the file-per-domain convention; "list files" and "find dead ends" are not search operations

### Split into Multiple Files

- **Description**: Create separate files (e.g., `links.ts`, `files.ts`, `tasks.ts`, `dataview.ts`)
- **Pros**: Maximum single-responsibility per file
- **Cons**: 4 new files for 6 small handlers (5–8 lines each); excessive fragmentation; 4 new imports in `tools.ts`
- **Rejected because**: Over-engineering — the handlers are too small to justify individual files

## Consequences

### Positive
- Clean domain boundary between text search and structural queries
- Follows the established file-per-domain convention
- `tools.ts` gains one import (`import * as query`) matching the existing style
- Module-level JSDoc comment makes the domain boundary explicit for future contributors

### Negative
- One additional file in `src/tools/` (now 6 handler files)

### Mitigations
- The JSDoc comment at the top of `query.ts` explains the "query" vs "search" distinction, preventing confusion about where to put future handlers

## Related Decisions

- [@ADR-009]: Removal of eval_query creates the need for replacement handlers
- [@ADR-011]: `dataviewQuery` is the most complex handler in the new module
