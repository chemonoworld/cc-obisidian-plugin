---
feature: semantic-search
subtask: 02-store
size: medium
depends-on: []
---

# SQLite + vec0 Vector Store

## Goal
Create a SQLite-backed vector store using `better-sqlite3` and `sqlite-vec` that supports chunk CRUD and KNN vector search.

## Files
- `src/embeddings/store.ts` — Store implementation

## API Contract

```typescript
interface Chunk {
  id: string            // sha256 of file_path + chunk_index
  file_path: string
  chunk_index: number
  heading: string | null
  content: string
  content_hash: string
  updated_at: number
}

interface SearchResult {
  filePath: string
  heading: string | null
  content: string
  score: number         // 0–1, cosine similarity
  chunkIndex: number
}

interface IndexedFile {
  file_path: string
  content_hash: string
  updated_at: number
}

interface StoreHandle {
  upsertFile(filePath: string, chunks: Chunk[], embeddings: Float32Array[]): void
  deleteFile(filePath: string): void
  search(queryEmbedding: Float32Array, limit: number): SearchResult[]
  getIndexedFiles(): IndexedFile[]
  hasFile(filePath: string): boolean
  getMeta(key: string): string | null
  setMeta(key: string, value: string): void
  close(): void
}

function openStore(dbPath: string): StoreHandle
```

## Implementation Notes

1. **Lazy loading**: Use dynamic `import()` for `better-sqlite3` and `sqlite-vec` since they are optionalDependencies. If import fails, throw a descriptive error.
2. **Schema init**: On `openStore()`, create tables if not exist:
   ```sql
   CREATE TABLE IF NOT EXISTS chunks (
     id TEXT PRIMARY KEY, file_path TEXT NOT NULL, chunk_index INTEGER NOT NULL,
     heading TEXT, content TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
   );
   CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
     chunk_id PRIMARY KEY, embedding float[1024] distance_metric=cosine
   );
   CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   ```
3. **WAL mode**: Enable `PRAGMA journal_mode = WAL` on first connection
4. **vec0 load**: Call `sqliteVec.load(db)` after creating the database instance
5. **NO UPSERT**: vec0 does not support INSERT OR REPLACE. The `upsertFile()` method must DELETE all existing chunks for the file, then INSERT new ones, in a single transaction.
6. **Float32Array**: Pass `Float32Array` directly to better-sqlite3 prepared statements (NOT `.buffer`)
7. **Search**: Use `WHERE embedding MATCH ? AND k = ?` syntax for KNN search. Join with chunks table for metadata. Convert distance to similarity: `score = 1 - distance`.
8. **ID generation**: `sha256(file_path + ':' + chunk_index)` using Node.js `crypto.createHash`
9. **schema_version**: Store `schema_version` in `index_meta` table for future migrations

## Acceptance Criteria
- [ ] Opens/creates SQLite database at specified path
- [ ] Loads sqlite-vec extension successfully
- [ ] Creates all three tables on first open
- [ ] WAL mode enabled
- [ ] upsertFile: inserts chunks + embeddings in transaction
- [ ] upsertFile: replaces existing file chunks (delete+reinsert)
- [ ] deleteFile: removes all chunks and vectors for a file
- [ ] search: returns top-k results sorted by similarity
- [ ] search: scores are 0–1 range
- [ ] getIndexedFiles: returns all unique files with their hashes
- [ ] close: properly closes the database connection
- [ ] Descriptive error if better-sqlite3 or sqlite-vec not installed

## Test Plan
- Open store → tables exist
- Insert file chunks → searchable
- Upsert same file → old chunks replaced, new ones searchable
- Delete file → no longer in search results
- Search with k=5 → returns max 5 results
- getIndexedFiles → returns correct file list
- getMeta/setMeta → round-trip values
- Close → no errors
Note: Tests will need actual sqlite-vec installed or mocking.
