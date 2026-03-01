---
feature: semantic-search
phase: research
type: sources
date: 2026-03-01
---

# Semantic Search — Source Bibliography

## Angle 1: Local Embedding Models

| # | Source | Type | Credibility | Key Takeaway |
|---|--------|------|-------------|--------------|
| 1 | [HuggingFace Transformers.js docs](https://huggingface.co/docs/transformers.js) | Docs | High | Official API reference; pipeline(), env config, dtype options |
| 2 | [npm: @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) | npm | High | v3 stable; confirms rename from @xenova/transformers; download stats |
| 3 | [Xenova/transformers.js GitHub](https://github.com/xenova/transformers.js) | Repo | High | Source repo; Node.js uses onnxruntime-node not WASM; migration notes |
| 4 | [HuggingFace model: Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) | Docs | High | Model card; confirms 384 dims, prefix requirement, int8 support |
| 5 | [HuggingFace model: intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) | Docs | High | Original model card; language coverage, performance benchmarks |
| 6 | [HuggingFace model: Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) | Docs | High | English-only baseline; 23 MB q8; no prefix needed |
| 7 | [HuggingFace model: Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2) | Docs | High | Multilingual alternative; no prefix needed |
| 8 | [HuggingFace model: Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) | Docs | High | Recommended model; 1024 dims, ~570 MB int8, MTEB ~63–64, CLS pooling |
| 9 | [transformers.js v4 announcement / @next tag](https://www.npmjs.com/package/@huggingface/transformers?activeTab=versions) | npm | High | v4 preview; ~4x speedup for BERT; NOT stable as of research date |
| 10 | [ONNX Runtime Node.js docs](https://onnxruntime.ai/docs/get-started/with-javascript/node.html) | Docs | High | Native bindings vs. WASM; explains performance difference in Node |
| 11a | [MMTEB paper (arxiv 2502.13595)](https://arxiv.org/html/2502.13595v1) | Paper | High | MTEB Multilingual benchmark: mE5-small=55.5, bge-m3=~63–64 |
| 11b | [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX) | Docs | High | Fallback model; q4=197MB, MTEB 61.15, complex API |
| 11c | [dragonkue/BGE-m3-ko](https://huggingface.co/dragonkue/BGE-m3-ko) | Docs | Medium | Best Korean F1 but no ONNX; Python only |
| 11d | [mE5-large-instruct ONNX broken](https://huggingface.co/intfloat/multilingual-e5-large-instruct/discussions/22) | Discussion | High | ONNX opset 5 incompatibility; rules out strongest E5 variant |
| 11e | [jina-v3 no ONNX (transformers.js#1072)](https://github.com/huggingface/transformers.js/issues/1072) | Issue | High | No Xenova conversion available for jina-embeddings-v3 |

## Angle 2: SQLite Vector Storage

| # | Source | Type | Credibility | Key Takeaway |
|---|--------|------|-------------|--------------|
| 11 | [sqlite-vec GitHub (asg017/sqlite-vec)](https://github.com/asg017/sqlite-vec) | Repo | High | Primary source; API, vec0 table syntax, auxiliary columns, partition keys |
| 12 | [sqlite-vec npm package](https://www.npmjs.com/package/sqlite-vec) | npm | High | Installation; JS API including sqliteVec.load(); version history |
| 13 | [sqlite-vec docs: vec0 reference](https://alexgarcia.xyz/sqlite-vec/api-reference.html) | Docs | High | KNN syntax, distance metrics, MATCH clause, k parameter |
| 14 | [sqlite-vss deprecation notice](https://github.com/asg017/sqlite-vss) | Repo | High | Confirms sqlite-vss is deprecated; migration to sqlite-vec recommended |
| 15 | [better-sqlite3 GitHub (WiseLibs/better-sqlite3)](https://github.com/WiseLibs/better-sqlite3) | Repo | High | Synchronous API; transaction(), prepare().run(); WAL pragma support |
| 16 | [npm: better-sqlite3](https://www.npmjs.com/package/better-sqlite3) | npm | High | Version, install, Node.js compatibility |
| 17 | [sqlite-vec performance benchmarks](https://alexgarcia.xyz/sqlite-vec/benchmarks.html) | Docs | High | Query time by dimension count; basis for < 10ms claim at 384 dims |
| 18 | [SQLite WAL mode documentation](https://www.sqlite.org/wal.html) | Docs | High | WAL journal mode; concurrent read performance; when to use |

## Angle 3: Change Detection & Incremental Indexing

| # | Source | Type | Credibility | Key Takeaway |
|---|--------|------|-------------|--------------|
| 19 | [git-diff man page](https://git-scm.com/docs/git-diff) | Docs | High | `--name-status` flag; status code meanings (M/A/D/R) |
| 20 | [git-status man page](https://git-scm.com/docs/git-status) | Docs | High | `--porcelain` output format; untracked file detection (`??`) |
| 21 | [Node.js crypto docs: createHash](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options) | Docs | High | SHA-256 file hashing; basis for hash-based fallback |
| 22 | [langchain text splitters (reference)](https://js.langchain.com/docs/modules/data_connection/document_transformers/) | Docs | Medium | Chunking strategy reference; heading-aware splitting patterns |
| 23 | [intfloat/e5 paper on prefix requirements](https://arxiv.org/abs/2212.03533) | Blog | High | Academic basis for query/passage prefix requirement in E5 models |
| 24 | [Smart Connections Obsidian plugin (GitHub)](https://github.com/brianpetro/obsidian-smart-connections) | Repo | Medium | Existence confirmed; implementation details of change detection unverified (not used in our design) |

## Codebase Analysis

| # | Source | Type | Credibility | Key Takeaway |
|---|--------|------|-------------|--------------|
| 25 | `src/tools.ts` (local) | Code | High | Tool registration pattern: name/description/schema/handler array |
| 26 | `src/types.ts` (local) | Code | High | `SearchResult.score` already exists; extension points confirmed |
| 27 | `src/config.ts` (local) | Code | High | `Config` interface structure; optional `embeddings` field placement |
| 28 | `src/main.ts` (local) | Code | High | `main()` initialization order; where `initializeEmbeddingStore()` should be called |
| 29 | ADR-003 (local) | Docs | High | Current SQLite policy; needs amendment for vector index file |

## Credibility Notes

- **High**: Official documentation, primary source repositories, or peer-reviewed papers
- **Medium**: Third-party references, indirect evidence, or sources where specific details were not fully verified
- sqlite-vec exact latest stable version (likely v0.1.6+) was not independently confirmed against the live npm registry during research
