import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { chunkMarkdown } from "./chunk.js";
import { openStore, chunkId } from "./store.js";
import type { StoreHandle, ChunkRecord } from "./store.js";
import { getQueryEmbedding, getEmbeddings } from "./model.js";
import { detectChanges } from "./change.js";
import { createHash } from "node:crypto";

export interface SemanticSearchResult {
  filePath: string;
  heading: string | null;
  content: string;
  score: number;
}

let store: StoreHandle | null = null;
let initialized = false;

export function isAvailable(): boolean {
  return initialized && store !== null;
}

/**
 * Initialize the embedding store.
 * Returns true if initialized successfully, false otherwise.
 */
export async function initEmbeddingStore(
  vaultPath: string,
  dbPath?: string,
): Promise<boolean> {
  if (store !== null) return true;

  const resolvedDbPath =
    dbPath ??
    join(vaultPath, ".obsidian", "plugins", "cc-plugin", "embeddings.db");

  try {
    await mkdir(dirname(resolvedDbPath), { recursive: true });
    store = openStore(resolvedDbPath);
    initialized = true;
    return true;
  } catch (e) {
    initialized = false;
    throw e;
  }
}

/**
 * Run semantic search over the vault.
 * Indexes changed files on first call or when reindex is true.
 */
export async function semanticSearch(
  vaultPath: string,
  query: string,
  options?: { limit?: number; reindex?: boolean; modelId?: string; translations?: string[] },
): Promise<SemanticSearchResult[]> {
  if (store === null) {
    throw new Error("Embedding store not initialized. Call initEmbeddingStore() first.");
  }

  const limit = options?.limit ?? 10;
  const modelId = options?.modelId;

  // Always run change detection — it's incremental and cheap (git diff).
  // When reindex is true, pass empty state to force full re-embedding.
  await indexVault(vaultPath, modelId, options?.reindex);

  // Build list of all queries (original + translations)
  const queries = [query, ...(options?.translations ?? [])];

  if (queries.length === 1) {
    // Single query — fast path
    const queryEmbedding = await getQueryEmbedding(query, modelId);
    const results = store.search(queryEmbedding, limit);
    return results.map((r) => ({
      filePath: r.filePath,
      heading: r.heading,
      content: r.content,
      score: r.score,
    }));
  }

  // Multi-query: round-robin interleave by rank.
  // Each query contributes equally so translation results aren't drowned out
  // by the original query's noise.
  const searchLimit = limit * 2;
  const perQuery: Array<Array<{ key: string; filePath: string; heading: string | null; content: string; score: number }>> = [];

  for (const q of queries) {
    const embedding = await getQueryEmbedding(q, modelId);
    const results = store.search(embedding, searchLimit);
    perQuery.push(
      results.map((r) => ({
        key: `${r.filePath}\0${r.chunkIndex}`,
        filePath: r.filePath,
        heading: r.heading,
        content: r.content,
        score: r.score,
      })),
    );
  }

  // Round-robin: pick rank 0 from each query, then rank 1, etc. Skip duplicates.
  const seen = new Set<string>();
  const merged: SemanticSearchResult[] = [];
  const maxRank = Math.max(...perQuery.map((r) => r.length));

  for (let rank = 0; rank < maxRank && merged.length < limit; rank++) {
    for (const results of perQuery) {
      if (rank >= results.length) continue;
      const r = results[rank];
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      merged.push({ filePath: r.filePath, heading: r.heading, content: r.content, score: r.score });
      if (merged.length >= limit) break;
    }
  }

  return merged;
}

/**
 * Index changed files in the vault.
 */
async function indexVault(vaultPath: string, modelId?: string, forceAll?: boolean): Promise<void> {
  if (store === null) return;

  const indexedFiles = forceAll
    ? []
    : store.getIndexedFiles().map((f) => ({
        file_path: f.file_path,
        content_hash: f.content_hash,
      }));
  const lastCommit = forceAll ? null : store.getMeta("last_commit");

  const changes = await detectChanges(vaultPath, indexedFiles, lastCommit);

  // Delete removed files
  for (const filePath of changes.toDelete) {
    store.deleteFile(filePath);
  }

  // Process added/modified files
  for (const filePath of changes.toAdd) {
    try {
      const fullPath = join(vaultPath, filePath);
      const content = await readFile(fullPath, "utf-8");
      const contentHash = createHash("sha256").update(content).digest("hex");

      const chunks = chunkMarkdown(content);
      if (chunks.length === 0) continue;

      const chunkRecords: ChunkRecord[] = chunks.map((c) => ({
        id: chunkId(filePath, c.index),
        file_path: filePath,
        chunk_index: c.index,
        heading: c.heading,
        content: c.content,
        content_hash: contentHash,
        updated_at: Date.now(),
      }));

      const texts = chunks.map((c) => c.content);
      const embeddings = await getEmbeddings(texts, modelId);

      store.upsertFile(filePath, chunkRecords, embeddings);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[semantic-search] Failed to index ${filePath}: ${msg}`);
      // Continue with other files
    }
  }

  // Update last commit
  if (changes.currentCommit !== null) {
    store.setMeta("last_commit", changes.currentCommit);
  }
}

/**
 * Close the store and reset state.
 */
export function closeStore(): void {
  if (store !== null) {
    store.close();
    store = null;
    initialized = false;
  }
}
