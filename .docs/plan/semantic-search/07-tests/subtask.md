---
feature: semantic-search
subtask: 07-tests
size: medium
depends-on: [01-chunk, 02-store, 03-model, 04-change, 05-facade, 06-tool-integration]
---

# Unit and Integration Tests

## Goal
Write comprehensive tests for all semantic search modules, following existing test patterns (Vitest, vi.mock).

## Files
- `tests/embeddings/chunk.test.ts` — Chunker unit tests
- `tests/embeddings/store.test.ts` — Store unit tests (mocked sqlite)
- `tests/embeddings/model.test.ts` — Model wrapper unit tests (mocked pipeline)
- `tests/embeddings/change.test.ts` — Change detection unit tests
- `tests/embeddings/index.test.ts` — Facade integration tests
- `tests/tools/semantic.test.ts` — Tool handler unit tests

## Implementation Notes

1. **Test pattern**: Follow `tests/tools/crud.test.ts` pattern:
   - `vi.mock()` at top level for dependencies
   - `beforeEach(() => vi.clearAllMocks())`
   - Descriptive `describe`/`it` blocks

2. **chunk.test.ts** — Pure function, no mocks needed:
   - Basic heading splits
   - Frontmatter stripping
   - Oversized section paragraph fallback
   - Wiki-link normalization
   - Empty content handling

3. **store.test.ts** — Mock better-sqlite3 and sqlite-vec:
   - DB creation and table init
   - upsertFile transaction behavior
   - deleteFile removes chunks and vectors
   - search returns results in correct format
   - getMeta/setMeta round-trip

4. **model.test.ts** — Mock @huggingface/transformers:
   - Pipeline singleton behavior
   - Correct pooling/normalize options
   - Float32Array output
   - Error handling

5. **change.test.ts** — Mock child_process and fs:
   - Git-based detection (mock git commands)
   - Hash-based fallback (mock fs.readdir + readFile)
   - New/modified/deleted file detection
   - Non-git vault fallback

6. **index.test.ts** — Mock all sub-modules:
   - Full search flow: init → detect → index → query
   - Config disabled → returns false
   - Reindex triggers change detection
   - Partial failure handling

7. **semantic.test.ts** — Mock embeddings/index:
   - Tool response format (ok/fail)
   - Error messages for disabled state
   - Result formatting

## Acceptance Criteria
- [ ] All modules have corresponding test files
- [ ] Tests pass with `vitest run`
- [ ] Pure functions tested without mocks
- [ ] External deps properly mocked
- [ ] Error paths covered
- [ ] Edge cases covered (empty input, missing deps)

## Test Plan
Run `npx vitest run tests/embeddings/ tests/tools/semantic.test.ts` — all tests pass.
