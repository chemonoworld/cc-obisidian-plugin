---
feature: semantic-search
type: adr
id: ADR-007
status: accepted
date: 2026-03-01
---

# ADR-007: Direct fs.readFile for Bulk Indexing

## Context

During indexing, the system needs to read the content of potentially hundreds or thousands of markdown files from the vault. Two approaches were considered for this read step:

1. **Per-file CLI tool calls**: For each file that needs indexing, call the existing `read_file` MCP tool (or equivalent internal handler) to retrieve content.
2. **Direct `fs.readFile`**: Read files directly from the filesystem using Node's `fs` module in a batch loop within the indexing process.

## Decision

The indexing loop uses `fs.readFile` (Node.js `fs/promises`) directly to read vault files in bulk. It does not route through the MCP tool layer for individual file reads.

## Rationale

- **Performance**: Each MCP tool call involves JSON serialization, schema validation, and handler dispatch overhead. For bulk indexing of hundreds of files, this overhead compounds significantly. Direct `fs` reads are an order of magnitude faster.
- **The MCP tool layer is for external callers**: The `read_file` tool exists to serve MCP clients requesting individual files. Internal bulk operations are not its intended use case.
- **Simplicity**: A direct `fs.readFile` in a `for...of` loop (or with controlled concurrency) is straightforward and easy to reason about. There is no benefit to indirection through the tool layer for a process-internal operation.
- **The vault path is already trusted**: The plugin already operates with direct filesystem access to the vault. Using `fs` is consistent with how other internal operations (e.g., git operations) work.

## Trade-offs

| Gained | Lost |
|---|---|
| Fast bulk reads without per-file overhead | Bypasses any read_file-level access control or logging |
| Simple, direct code | File reads not visible in MCP tool call logs |
| Consistent with existing internal fs usage | Two code paths for reading files (tool vs. direct) |
| Controlled concurrency possible (e.g., p-limit) | |

## Consequences

- `embeddings/index.ts` imports `fs/promises` directly and calls `readFile` for each file in `toAdd`.
- Concurrency should be limited (e.g., 10 parallel reads) to avoid overwhelming the OS file descriptor limit on large vaults.
- Error handling for individual file reads (permissions, deleted between detection and read) must be implemented in the indexing loop — failures on individual files should be logged and skipped, not abort the entire index run.
- This decision applies only to the indexing path. The `semantic_search` tool handler itself still goes through normal MCP dispatch.
