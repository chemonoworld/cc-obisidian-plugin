---
feature: semantic-search
phase: research
status: complete
date: 2026-03-01
angles: [local-embedding-models, sqlite-vector-storage, change-detection-incremental-indexing]
---

# Semantic Search — Research Document

## Executive Summary

Semantic search for this Obsidian MCP plugin is feasible using entirely local, open-source components with no external API calls required. The recommended stack is:

- **Embedding model**: `Xenova/bge-m3` (int8) via `@huggingface/transformers` v3
- **Vector storage**: `sqlite-vec` extension on top of `better-sqlite3`
- **Change detection**: Git-based (SHA-256 hash fallback for non-git vaults)
- **Indexing strategy**: On-demand at search time (not continuous file watching)

This approach supports Korean and 100+ other languages, keeps all data local, and fits within a typical Obsidian vault's constraints (~80–150 MB DB for 10k chunks at 1024 dims).

---

## 1. Local Embedding Models

### Primary Library

**`@huggingface/transformers` v3** (formerly `@xenova/transformers`)

- Uses ONNX Runtime under the hood
- In Node.js: automatically uses `onnxruntime-node` (native bindings, not WASM)
- Pipeline API mirrors the Python HuggingFace library
- Install: `npm install @huggingface/transformers`

### Recommended Model

**`Xenova/bge-m3`** at int8 quantization — the best quality model available in transformers.js with Korean support.

| Property | Value |
|----------|-------|
| Dimensions | 1024 |
| Languages | 100+ (Korean supported) |
| Size (int8/q8) | ~570 MB |
| Size (fp32) | ~2.27 GB |
| Max tokens | 8192 |
| Prefix required | No (use CLS pooling) |
| MTEB Multilingual | ~63–64 |
| Retrieval modes | Dense + Sparse + ColBERT (3-in-1) |

**Why BGE-M3 over E5-small**: MTEB Multilingual score 63–64 vs 55.5 — an 8-point gap representing significant real-world quality improvement. 8192 token context (vs 512) handles long notes without truncation. No prefix management needed (simpler code). Dense+sparse hybrid retrieval capability is unique.

### Model Comparison (MTEB Multilingual Benchmark)

| Model | MTEB | Dims | q8 Size | Korean | transformers.js | Status |
|-------|------|------|---------|--------|-----------------|--------|
| multilingual-e5-small | 55.5 | 384 | 118 MB | Passable | Yes | Outclassed |
| embeddinggemma-300m | 61.15 | — | 197 MB (q4) | Good | Yes (complex API) | Fallback |
| **bge-m3** | **~63–64** | **1024** | **570 MB** | **Good** | **Yes (Xenova)** | **Recommended** |
| mE5-large-instruct | 63.2 | — | — | Good | No (ONNX broken) | Unusable |
| dragonkue/BGE-m3-ko | ~64+ | 1024 | — | Best | No (Python only) | Unusable |
| jina-embeddings-v3 | ~65.5 | — | — | Good | No (no ONNX) | Unusable |

**Note**: Models marked "Unusable" lack working ONNX/transformers.js support as of 2026-03.

### Performance Characteristics

- Cold start (model load): 2–5 seconds (bge-m3 int8)
- Per-document inference: ~100–300ms (bge-m3 int8 on Apple Silicon)
- Memory footprint: ~800 MB–1.2 GB RAM for bge-m3 int8
- Batch processing supported and significantly more efficient than single-document calls
- **Trade-off vs e5-small**: ~5–10x slower inference, ~4x more RAM, but substantially better retrieval quality

### Model Management

```typescript
import { pipeline, env } from '@huggingface/transformers';

// Custom cache directory
env.cacheDir = '/path/to/.cache';

// Offline mode
env.localModelPath = '/path/to/models';
env.allowRemoteModels = false;

// Initialize pipeline (dtype: 'int8' required — unquantized models have a known loading bug)
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/bge-m3',
  { dtype: 'int8' }
);

// Embed a query (no prefix needed for BGE-M3, use CLS pooling)
const result = await extractor('안녕하세요', { pooling: 'cls', normalize: true });
const vector = result.tolist()[0]; // number[] of length 1024

// Embed a document passage
const docResult = await extractor('This is a note about architecture.', { pooling: 'cls', normalize: true });
const docVector = docResult.tolist()[0];
```

Model switching is done by creating a new pipeline with a different model ID.

### Fallback Model

If 570MB download is a hard constraint, `onnx-community/embeddinggemma-300m-ONNX` (q4, ~197 MB, MTEB 61.15) is the best sub-300MB option. However, it requires `AutoModel`/`AutoTokenizer` API (not `pipeline()`), mandatory task-specific prefixes, and WASM backend for q8 (WebGPU produces wrong results). Added complexity makes it a fallback, not default.

### Version Note

`@huggingface/transformers` v4 (available under `@next` tag) offers ~4x speedup for BERT models but is **not stable**. Design for v3 and plan an upgrade path later.

---

## 2. SQLite Vector Storage

### Primary Library

**`sqlite-vec`** (by Alex Garcia) + **`better-sqlite3`**

- sqlite-vec: pure C, zero dependencies, MIT/Apache-2.0 licensed
- **sqlite-vss is deprecated** — use sqlite-vec exclusively
- Install: `npm install sqlite-vec better-sqlite3`
- Load: `sqliteVec.load(db)` after creating a `better-sqlite3` instance

### Schema Design (Two-Table Pattern)

```sql
-- Metadata and chunk text
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  heading_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  indexed_at INTEGER NOT NULL,
  UNIQUE(note_path, chunk_index)
);

-- Vector index (rowid = chunks.id)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  embedding FLOAT[1024] distance_metric=cosine
);

-- File-level tracking for change detection
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  last_indexed_at INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL
);
```

### vec0 Virtual Table

```sql
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[1024] distance_metric=cosine,
  note_path TEXT PARTITION KEY,
  +chunk_text TEXT,
  +heading_path TEXT
);
```

Key features (v0.1.6+):
- Distance metrics: `cosine`, `L2`, `L1`, `hamming`
- Metadata columns: filterable in `WHERE` clauses
- Partition keys: shard index by file path
- Auxiliary columns (`+column`): stored but unindexed, returned in `SELECT` without a `JOIN`
- KNN search: `WHERE embedding MATCH ? AND k = 10`

### Insertion

Embeddings are inserted as `Float32Array` directly (for better-sqlite3):

```typescript
const embedding = new Float32Array(vector);
db.prepare('INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)').run(id, embedding);
```

**Note**: `Float32Array.buffer` is required only for `node:sqlite` (Node 23.5+). For `better-sqlite3`, pass `Float32Array` directly.

### Update Pattern (Validation Correction)

`vec0` does **not** support `UPSERT` (`INSERT OR REPLACE`). Updates require delete + reinsert in a transaction:

```typescript
db.transaction(() => {
  db.prepare('DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE note_path = ?)').run(notePath);
  db.prepare('DELETE FROM chunks WHERE note_path = ?').run(notePath);
  // insert new chunks and embeddings
})();
```

### Performance

| Dimensions | 100k vectors query time |
|------------|------------------------|
| 384 | < 10ms |
| 768 | ~30–50ms |
| 1536 | ~105ms |

For a typical Obsidian vault (10k–50k chunks at 1024 dims): **~10–30ms query time**.

**Database size estimate** (10k chunks, 1024 dims):
- Vector data: 10,000 × 1024 × 4 bytes = ~40 MB
- With metadata + chunk text: ~80–150 MB total

### WAL Mode

Enable WAL mode for concurrent read performance:

```sql
PRAGMA journal_mode = WAL;
```

---

## 3. Change Detection & Incremental Indexing

### Primary Strategy: Dual-Track Detection

**Track 1 — Git-based** (preferred for git vaults):

```bash
git diff --name-status <last_indexed_commit>..HEAD
git status --porcelain  # captures untracked/uncommitted new notes
```

- Store last-indexed commit hash in the `files` table or a separate config row
- Status codes: `M`=modified, `A`=added, `D`=deleted, `R`=renamed, `??`=untracked
- Performance: < 100ms for 1000-file vaults

**Track 2 — Hash-based** (fallback for non-git vaults):

- SHA-256 of file content stored in `files.content_hash`
- On index trigger: read all `.md` files, compare hashes
- ~500ms for 1000 files
- Simpler, works everywhere

### Markdown Chunking Strategy (Heading-Aware)

1. Strip frontmatter YAML (store as metadata separately)
2. Split on H2/H3 heading boundaries
3. Fall back to paragraph boundaries (`\n\n`), then line boundaries
4. Chunk size: 400–512 tokens; overlap: 50–100 tokens
5. Prepend heading hierarchy as context prefix:
   `"Project Notes > Architecture > Database Design: [chunk text]"`
6. Normalize wiki-links: `[[Note Name]]` → `Note Name`
7. Keep inline tags (`#tag`) — they carry semantic meaning

### Incremental Update Pattern

```
ON MODIFIED or CREATED:
  BEGIN TRANSACTION
    DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE note_path = ?)
    DELETE FROM chunks WHERE note_path = ?
    [re-chunk file → generate embeddings]
    INSERT INTO chunks (...)
    INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)
    UPDATE files SET content_hash = ?, last_indexed_at = ?, chunk_count = ?
  COMMIT

ON DELETED:
  DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE note_path = ?)
  DELETE FROM chunks WHERE note_path = ?
  DELETE FROM files WHERE path = ?

ON RENAMED (git R status):
  UPDATE chunks SET note_path = <new_path> WHERE note_path = <old_path>
  DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE note_path = <old_path>)
  [reinsert chunks_vec rows with same embeddings under new path reference]
  UPDATE files SET path = <new_path> WHERE path = <old_path>
```

### Index Trigger

**On-demand at search time** (not a continuous file watcher):

1. Check if the index DB exists; if not, run full initial index
2. Run change detection (git diff or hash scan)
3. Re-embed only changed files
4. Execute the search query
5. Return results

**Rationale**: MCP servers are request/response, not long-running daemons. A file watcher approach would require persistent process management that is outside the MCP model.

---

## 4. Codebase Integration Points

Verified by code inspection of the existing plugin source.

### File Structure (New)

```
src/
  embeddings/
    model.ts      — Pipeline init, embed() function
    store.ts      — SQLite setup, insert, search
    chunk.ts      — Markdown splitting logic
    change.ts     — Git/hash change detection
    index.ts      — Re-exports
  tools/
    semantic.ts   — semantic_search tool handler
```

### Integration Hooks

| Location | Change |
|----------|--------|
| `src/tools.ts` | Add `semantic_search` entry to the `tools` array (name/description/schema/handler pattern) |
| `src/types.ts` | Extend types as needed; `SearchResult.score` field already exists |
| `src/config.ts` | Add optional `embeddings` object to `Config` interface |
| `src/main.ts` | Call `initializeEmbeddingStore()` in `main()` before `registerTools()` |

### Tool Design

- Implement as a **separate `semantic_search` tool**, not an extension of the existing `search_notes` tool
- Follow the existing 3-layer error handling pattern: never throw → check success → return `fail()`

### ADR Impact

**ADR-003** needs amendment: allow a custom SQLite index file specifically for vector embeddings as an optional feature (the existing ADR presumably restricts additional SQLite files).

---

## 5. Critical Design Decisions

### Decision 1: On-demand indexing vs. background watcher

**Chosen**: On-demand at search time.

MCP servers are stateless request/response. A background watcher would require process lifecycle management that doesn't fit the model. The latency cost (change detection + incremental re-embedding) is acceptable because only changed files are re-embedded.

### Decision 2: Model selection trade-offs

**Chosen**: `Xenova/bge-m3` int8 (~570 MB).

Korean support is required. MTEB Multilingual benchmark (2025) shows bge-m3 at ~63–64, a full 8 points above multilingual-e5-small (55.5). The strongest alternatives (jina-v3, mE5-large-instruct, bge-m3-ko) lack working ONNX/transformers.js support. bge-m3 offers the best quality available in the transformers.js ecosystem, with 8192 token context and no prefix requirement. The 570 MB download and ~1 GB RAM trade-off is acceptable for a desktop-local tool.

### Decision 3: vec0 update mechanism

**Chosen**: DELETE + INSERT in transaction.

`sqlite-vec` does not support `UPSERT`. This is a confirmed library limitation (not a bug), so the delete+reinsert pattern is the correct approach.

### Decision 4: Separate tool, not search extension

**Chosen**: New `semantic_search` tool.

Semantic search has different latency characteristics (cold start, embedding generation) and different result semantics (similarity score vs. keyword match). Keeping it separate preserves the existing `search_notes` behavior and gives users explicit control.

---

## 6. Recommendations

1. **Start with `Xenova/bge-m3` int8**. Best quality model available in transformers.js with Korean support (MTEB ~63–64). Make the model configurable in `Config.embeddings.model` so users can switch to lighter models (e5-small) or future better models.

2. **Use CLS pooling with normalization**. BGE-M3 uses CLS pooling (not mean pooling like E5). No query/passage prefix needed — simpler code.

3. **Cache the pipeline instance**. Model cold start is 2–5s. Initialize once at plugin start and reuse.

4. **Use WAL mode** on the SQLite DB from the first connection.

5. **Store the DB in a plugin data directory**, not inside the vault itself, to avoid Obsidian's file indexer picking it up.

6. **Plan for v4 upgrade**. When `@huggingface/transformers` v4 stabilizes, a ~4x inference speedup is available with minimal API changes.

7. **Amend ADR-003** before implementation begins to formally allow the vector index SQLite file.
