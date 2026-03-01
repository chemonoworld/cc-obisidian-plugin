---
feature: semantic-search
subtask: 05-facade
size: medium
depends-on: [01-chunk, 02-store, 03-model, 04-change]
---

# Orchestrator Facade

## Goal
Create the main facade module that orchestrates the full semantic search flow: initialization, change detection, indexing, and querying.

## Files
- `src/embeddings/index.ts` — Facade implementation

## API Contract

```typescript
interface SemanticSearchResult {
  filePath: string
  heading: string | null
  content: string
  score: number          // 0–1, cosine similarity
}

function initEmbeddingStore(): Promise<boolean>
function semanticSearch(
  query: string,
  limit?: number,
  reindex?: boolean
): Promise<SemanticSearchResult[]>
function isAvailable(): boolean
```

## Implementation Notes

1. **initEmbeddingStore()**:
   - Read config to check `embedding.enabled`
   - If not enabled, return false
   - Determine DB path: `embedding.dbPath` or default `<vaultPath>/.obsidian/plugins/cc-plugin/embeddings.db`
   - Open the store via `openStore(dbPath)`
   - Return true on success, false on error (log error, don't throw)
   - Cache the store handle for reuse

2. **semanticSearch()**:
   - If store not initialized, attempt `initEmbeddingStore()`
   - If still not available, throw/return error
   - **Index phase** (runs if first search or `reindex: true`):
     - Get `indexedFiles` from store
     - Get `lastCommit` from store meta
     - Call `detectChanges(vaultPath, indexedFiles, lastCommit)`
     - For `toDelete`: call `store.deleteFile()` for each
     - For `toAdd`: read each file with `fs.readFile()`, `chunkMarkdown()`, `getEmbeddings()`, `store.upsertFile()`
     - Update `store.setMeta('last_commit', currentCommit)`
   - **Query phase**:
     - `getEmbedding(query)` → query vector
     - `store.search(queryVector, limit)` → results
     - Return as `SemanticSearchResult[]`

3. **isAvailable()**: Return true if store is initialized and config is enabled.

4. **Vault path**: Get from `getVault()` in config module. Need to resolve vault name to actual path — check how existing tools resolve this.

5. **Concurrency**: No concurrent indexing. If indexing is in progress, wait or skip.

6. **Error handling**: Catch all errors in indexing phase. If indexing fails partway, return results from whatever was indexed. Log errors but don't crash.

7. **File reading**: Use `fs.readFile(path, 'utf-8')` for reading vault files directly (ADR-007 decision).

8. **Default limit**: 10 results.

## Acceptance Criteria
- [ ] initEmbeddingStore returns false when embedding not enabled
- [ ] initEmbeddingStore opens store and caches handle
- [ ] semanticSearch triggers indexing on first call
- [ ] semanticSearch re-indexes when reindex=true
- [ ] Indexing: detects changes, processes only changed files
- [ ] Indexing: deletes removed files from store
- [ ] Indexing: chunks → embeds → upserts new/modified files
- [ ] Query: embeds query and searches store
- [ ] Returns results sorted by similarity score
- [ ] isAvailable reflects initialization state
- [ ] Handles partial indexing failure gracefully

## Test Plan
- Mock all sub-modules (store, model, chunk, change)
- Init with embedding disabled → false
- Init with embedding enabled → true, store opened
- Search triggers indexing on first call
- Search with reindex=true re-runs change detection
- Changed files are processed (chunk → embed → upsert)
- Deleted files are removed from store
- Query results returned in correct format
- Error in indexing → graceful degradation
