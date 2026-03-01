---
feature: semantic-search
phase: architecture
status: complete
date: 2026-03-01
approach: pragmatic
---

# Semantic Search — Architecture

## Overview

Semantic search enables natural-language queries over vault content using local embedding models. It is opt-in, on-demand (indexing runs at search time), and stores embeddings in a per-vault SQLite database.

---

## Component Architecture

```
MCP Client
    │
    ▼
MCP Server
    │
    ▼
Tool Registry
    │
    ▼
tools/semantic.ts          ← Tool handler (semantic_search)
    │
    ▼
embeddings/index.ts        ← Facade: initEmbeddingStore(), semanticSearch()
    ├── embeddings/model.ts    — Pipeline singleton, embed()
    ├── embeddings/store.ts    — SQLite + vec0 CRUD
    ├── embeddings/chunk.ts    — Markdown heading-aware splitter
    └── embeddings/change.ts   — Git/hash change detection

SQLite DB: <vaultPath>/.obsidian/plugins/cc-plugin/embeddings.db
```

---

## File Structure

```
src/
  embeddings/
    model.ts      — Pipeline singleton, embed()
    store.ts      — SQLite + vec0 CRUD
    chunk.ts      — Markdown heading-aware splitter
    change.ts     — Git/hash change detection
    index.ts      — Facade: initEmbeddingStore(), semanticSearch()
  tools/
    semantic.ts   — semantic_search tool handler
```

---

## Module API Contracts

### model.ts

```typescript
function getEmbedding(text: string): Promise<Float32Array>
function getEmbeddings(texts: string[]): Promise<Float32Array[]>
function isModelLoaded(): boolean
```

Downloads and caches `Xenova/bge-m3` (or configured model) via `@huggingface/transformers`. Singleton pipeline — initialized once per process.

---

### store.ts

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

interface StoreHandle {
  upsertFile(filePath: string, chunks: Chunk[], embeddings: Float32Array[]): void
  deleteFile(filePath: string): void
  search(queryEmbedding: Float32Array, limit: number): SearchResult[]
  getIndexedFiles(): IndexedFile[]  // { file_path, content_hash, updated_at }
  hasFile(filePath: string): boolean
  close(): void
}

function openStore(dbPath: string): StoreHandle
```

---

### chunk.ts

```typescript
interface ChunkOptions {
  maxTokens?: number      // default: 512
  overlap?: number        // default: 0
}

interface Chunk {
  content: string
  heading: string | null
  index: number
}

function chunkMarkdown(content: string, options?: ChunkOptions): Chunk[]
```

Splits on `##` headings. Falls back to paragraph splits when a section exceeds `maxTokens`.

---

### change.ts

```typescript
interface IndexedFile {
  file_path: string
  content_hash: string
}

interface ChangeSet {
  toAdd: string[]       // new or modified file paths
  toDelete: string[]    // removed file paths
  currentCommit: string | null
}

function detectChanges(
  vaultPath: string,
  indexedFiles: IndexedFile[],
  lastCommit: string | null
): Promise<ChangeSet>
```

Uses git diff when available. Falls back to SHA-256 content hashing for non-git vaults.

---

### index.ts

```typescript
function initEmbeddingStore(): Promise<boolean>
function semanticSearch(
  query: string,
  limit?: number,
  reindex?: boolean
): Promise<SemanticSearchResult[]>
function isAvailable(): boolean

interface SemanticSearchResult {
  filePath: string
  heading: string | null
  content: string
  score: number          // 0–1, cosine similarity
}
```

Facade that orchestrates: detect changes → read files → chunk → embed → upsert → query.

---

### semantic.ts

```typescript
function semanticSearchTool(args: {
  query: string
  limit?: number
  reindex?: boolean
}): Promise<ToolResponse>
```

Registered in the tool registry. Calls `initEmbeddingStore()` then `semanticSearch()`. Returns formatted markdown results or an error message.

---

## Data Flow

### Indexing Flow (runs at first search or when `reindex: true`)

```
detectChanges(vaultPath, indexedFiles, lastCommit)
    │
    ├── toDelete → store.deleteFile()
    │
    └── toAdd → for each file:
                  fs.readFile(filePath)
                  → chunkMarkdown(content)
                  → getEmbeddings(chunks.map(c => c.content))
                  → store.upsertFile(filePath, chunks, embeddings)

store.set('last_commit', currentCommit)
```

### Query Flow

```
query string
    │
    ▼
getEmbedding(query) → Float32Array
    │
    ▼
store.search(queryEmbedding, limit)
    │
    ▼
convert vec0 distances → similarity scores (1 - distance)
    │
    ▼
SemanticSearchResult[]
```

---

## SQLite Schema

```sql
CREATE TABLE chunks (
  id           TEXT PRIMARY KEY,
  file_path    TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  heading      TEXT,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id   PRIMARY KEY,
  embedding  float[1024] distance_metric=cosine
);

CREATE TABLE index_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Stores: last_commit, schema_version
```

---

## Config Extension

```typescript
interface Config {
  defaultVault: string
  embedding?: EmbeddingConfig
}

interface EmbeddingConfig {
  model?: string      // HuggingFace model ID; default: 'Xenova/bge-m3'
  dbPath?: string     // Absolute path; default: <vault>/.obsidian/plugins/cc-plugin/embeddings.db
  enabled: boolean    // Must be true to activate; default: false
}
```

---

## Tool Definition (Zod Schema)

```typescript
const semanticSearchSchema = z.object({
  query:   z.string().min(1).describe('Natural language search query'),
  limit:   z.number().int().min(1).max(50).optional().default(10)
             .describe('Maximum number of results to return'),
  reindex: z.boolean().optional().default(false)
             .describe('Force re-indexing before search'),
})
```

---

## Error Handling Matrix

| Scenario | Behavior |
|---|---|
| `embedding.enabled` is false or missing | Tool returns: "Semantic search is not enabled. Set `embedding.enabled: true` in config." |
| Model download fails (no internet) | Returns error with model name and suggestion to check connectivity |
| `sqlite-vec` not installed | Returns error: "sqlite-vec extension not found. Run `npm install sqlite-vec`." |
| `@huggingface/transformers` not installed | Returns error: "Embedding dependencies not installed. Run `npm install`." |
| Vault path not set | Returns error: "No vault configured." |
| DB write fails (disk full, permissions) | Logs error, returns partial results if any indexed, else error message |
| Indexing timeout (large vault) | Returns results from previously indexed content with a warning |
| Empty vault (no .md files) | Returns empty results with message: "No markdown files found in vault." |
| Query embedding fails | Returns error with raw exception message for debugging |

---

## New Dependencies

Added as `optionalDependencies` in `package.json` to avoid breaking installs for users who do not enable semantic search:

```json
{
  "optionalDependencies": {
    "@huggingface/transformers": "^3.x",
    "better-sqlite3": "^11.0.0",
    "sqlite-vec": "^0.1.x"
  }
}
```

---

## Integration Points

Four existing files are touched, with approximately 15 lines total of new code:

| File | Change |
|---|---|
| `src/config.ts` | Add `embedding?: EmbeddingConfig` to `Config` interface |
| `src/tools/index.ts` | Register `semantic_search` tool from `tools/semantic.ts` |
| `src/server.ts` | No change required (tool registry handles dispatch) |
| `package.json` | Add `optionalDependencies` block |

---

## Implementation Phases

### Phase 1 — Core Infrastructure
Files: `embeddings/chunk.ts`, `embeddings/store.ts`, `embeddings/model.ts`

Deliverables:
- Markdown chunker with heading awareness
- SQLite store with vec0 virtual table
- HuggingFace pipeline wrapper

### Phase 2 — Change Detection + Orchestrator
Files: `embeddings/change.ts`, `embeddings/index.ts`

Deliverables:
- Git-based and hash-based change detection
- Facade that orchestrates full indexing and search flow

### Phase 3 — Tool Integration
Files: `tools/semantic.ts`, `src/config.ts`, `src/tools/index.ts`

Deliverables:
- Zod-validated tool handler
- Config type extension
- Tool registration

### Phase 4 — Testing + Polish
Deliverables:
- Unit tests for chunk, store, change, index
- Integration test with a small fixture vault
- Error message review
- README update documenting opt-in setup
