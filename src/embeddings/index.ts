import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { chunkMarkdown } from "./chunk.js";
import { openStore, chunkId } from "./store.js";
import type { StoreHandle, ChunkRecord } from "./store.js";
import { getEmbedding, getEmbeddings } from "./model.js";
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
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[semantic-search] Failed to init store: ${msg}`);
    initialized = false;
    return false;
  }
}

/**
 * Run semantic search over the vault.
 * Indexes changed files on first call or when reindex is true.
 */
export async function semanticSearch(
  vaultPath: string,
  query: string,
  options?: { limit?: number; reindex?: boolean; modelId?: string },
): Promise<SemanticSearchResult[]> {
  if (store === null) {
    throw new Error("Embedding store not initialized. Call initEmbeddingStore() first.");
  }

  const limit = options?.limit ?? 10;
  const modelId = options?.modelId;

  // Always run change detection — it's incremental and cheap (git diff).
  // When reindex is true, pass empty state to force full re-embedding.
  await indexVault(vaultPath, modelId, options?.reindex);

  // Query
  const queryEmbedding = await getEmbedding(query, modelId);
  const results = store.search(queryEmbedding, limit);

  return results.map((r) => ({
    filePath: r.filePath,
    heading: r.heading,
    content: r.content,
    score: r.score,
  }));
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
