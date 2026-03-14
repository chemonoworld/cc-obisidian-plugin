import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface ChunkRecord {
  id: string;
  file_path: string;
  chunk_index: number;
  heading: string | null;
  content: string;
  content_hash: string;
  updated_at: number;
}

export interface SearchResult {
  filePath: string;
  heading: string | null;
  content: string;
  score: number;
  chunkIndex: number;
}

export interface IndexedFile {
  file_path: string;
  content_hash: string;
  updated_at: number;
}

export interface StoreHandle {
  upsertFile(filePath: string, chunks: ChunkRecord[], embeddings: Float32Array[]): void;
  deleteFile(filePath: string): void;
  search(queryEmbedding: Float32Array, limit: number): SearchResult[];
  getIndexedFiles(): IndexedFile[];
  hasFile(filePath: string): boolean;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  close(): void;
}

export function chunkId(filePath: string, chunkIndex: number): string {
  return createHash("sha256").update(`${filePath}:${chunkIndex}`).digest("hex");
}

export function openStore(dbPath: string): StoreHandle {
  // Load better-sqlite3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any;
  try {
    Database = require("better-sqlite3");
  } catch {
    throw new Error(
      "better-sqlite3 is not installed. Run: npm install better-sqlite3\n" +
      "Requires C++ build tools (Xcode CLT on macOS, build-essential on Linux, Visual C++ Build Tools on Windows)."
    );
  }

  // Load sqlite-vec
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sqliteVec: any;
  try {
    sqliteVec = require("sqlite-vec");
  } catch {
    throw new Error(
      "sqlite-vec is not installed. Run: npm install sqlite-vec"
    );
  }

  const db = new Database(dbPath);

  // Load the sqlite-vec extension
  sqliteVec.load(db);

  // Enable WAL mode
  db.pragma("journal_mode = WAL");

  // Create chunks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      heading TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create chunks_vec virtual table — vec0 may not support IF NOT EXISTS in all versions
  try {
    db.exec(`
      CREATE VIRTUAL TABLE chunks_vec USING vec0(
        chunk_id text primary key,
        embedding float[1024] distance_metric=cosine
      )
    `);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Table already exists is fine; any other error is fatal
    if (!msg.includes("already exists") && !msg.toLowerCase().includes("already exists")) {
      throw err;
    }
  }

  // Create index_meta table
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const stmtDeleteVecByFile = db.prepare(
    "DELETE FROM chunks_vec WHERE chunk_id IN (SELECT id FROM chunks WHERE file_path = ?)"
  );
  const stmtDeleteChunksByFile = db.prepare(
    "DELETE FROM chunks WHERE file_path = ?"
  );
  const stmtInsertChunk = db.prepare(`
    INSERT INTO chunks (id, file_path, chunk_index, heading, content, content_hash, updated_at)
    VALUES (@id, @file_path, @chunk_index, @heading, @content, @content_hash, @updated_at)
  `);
  const stmtInsertVec = db.prepare(
    "INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, ?)"
  );
  const stmtSearch = db.prepare(`
    SELECT c.file_path, c.heading, c.content, c.chunk_index, cv.distance
    FROM chunks_vec cv
    JOIN chunks c ON c.id = cv.chunk_id
    WHERE cv.embedding MATCH ? AND k = ?
    ORDER BY cv.distance
  `);
  const stmtGetIndexedFiles = db.prepare(`
    SELECT file_path, content_hash, updated_at
    FROM chunks
    GROUP BY file_path
  `);
  const stmtHasFile = db.prepare(
    "SELECT 1 FROM chunks WHERE file_path = ? LIMIT 1"
  );
  const stmtGetMeta = db.prepare(
    "SELECT value FROM index_meta WHERE key = ?"
  );
  const stmtSetMeta = db.prepare(
    "INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)"
  );

  const doUpsertFile = db.transaction(
    (filePath: string, chunks: ChunkRecord[], embeddings: Float32Array[]) => {
      if (embeddings.length !== chunks.length) {
        throw new Error(
          `upsertFile: chunk count (${chunks.length}) !== embedding count (${embeddings.length})`
        );
      }
      stmtDeleteVecByFile.run(filePath);
      stmtDeleteChunksByFile.run(filePath);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        stmtInsertChunk.run({
          id: chunk.id,
          file_path: chunk.file_path,
          chunk_index: chunk.chunk_index,
          heading: chunk.heading,
          content: chunk.content,
          content_hash: chunk.content_hash,
          updated_at: chunk.updated_at,
        });
        stmtInsertVec.run(chunk.id, embeddings[i]);
      }
    }
  );

  return {
    upsertFile(filePath: string, chunks: ChunkRecord[], embeddings: Float32Array[]): void {
      doUpsertFile(filePath, chunks, embeddings);
    },

    deleteFile(filePath: string): void {
      db.transaction(() => {
        stmtDeleteVecByFile.run(filePath);
        stmtDeleteChunksByFile.run(filePath);
      })();
    },

    search(queryEmbedding: Float32Array, limit: number): SearchResult[] {
      const rows = stmtSearch.all(queryEmbedding, limit) as Array<{
        file_path: string;
        heading: string | null;
        content: string;
        chunk_index: number;
        distance: number;
      }>;
      return rows.map((row) => ({
        filePath: row.file_path,
        heading: row.heading,
        content: row.content,
        score: 1 - row.distance,
        chunkIndex: row.chunk_index,
      }));
    },

    getIndexedFiles(): IndexedFile[] {
      return stmtGetIndexedFiles.all() as IndexedFile[];
    },

    hasFile(filePath: string): boolean {
      return stmtHasFile.get(filePath) !== undefined;
    },

    getMeta(key: string): string | null {
      const row = stmtGetMeta.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    setMeta(key: string, value: string): void {
      stmtSetMeta.run(key, value);
    },

    close(): void {
      db.close();
    },
  };
}
