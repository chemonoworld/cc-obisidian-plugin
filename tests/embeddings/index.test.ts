import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all sub-modules
vi.mock("../../src/embeddings/store.js", () => {
  const mockStore = {
    upsertFile: vi.fn(),
    deleteFile: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    getIndexedFiles: vi.fn().mockReturnValue([]),
    hasFile: vi.fn().mockReturnValue(false),
    getMeta: vi.fn().mockReturnValue(null),
    setMeta: vi.fn(),
    close: vi.fn(),
  };
  return {
    openStore: vi.fn().mockReturnValue(mockStore),
    chunkId: vi.fn((path: string, idx: number) => `${path}:${idx}`),
    __mockStore: mockStore,
  };
});

vi.mock("../../src/embeddings/chunk.js", () => ({
  chunkMarkdown: vi.fn().mockReturnValue([
    { content: "chunk content", heading: "Heading", index: 0 },
  ]),
}));

vi.mock("../../src/embeddings/model.js", () => ({
  getEmbedding: vi.fn().mockResolvedValue(new Float32Array(1024)),
  getQueryEmbedding: vi.fn().mockResolvedValue(new Float32Array(1024)),
  getEmbeddings: vi.fn().mockResolvedValue([new Float32Array(1024)]),
}));

vi.mock("../../src/embeddings/change.js", () => ({
  detectChanges: vi.fn().mockResolvedValue({
    toAdd: [],
    toDelete: [],
    currentCommit: "abc123",
  }),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue("# Test\n\nContent here"),
    mkdir: vi.fn(),
  };
});

const storeModule = await import("../../src/embeddings/store.js");
const changeModule = await import("../../src/embeddings/change.js");
const modelModule = await import("../../src/embeddings/model.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStore = (storeModule as any).__mockStore;

const {
  initEmbeddingStore,
  semanticSearch,
  isAvailable,
  closeStore,
} = await import("../../src/embeddings/index.js");

describe("embeddings/index facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeStore();
    // Reset mock returns
    mockStore.getMeta.mockReturnValue(null);
    mockStore.getIndexedFiles.mockReturnValue([]);
    mockStore.search.mockReturnValue([]);
  });

  describe("initEmbeddingStore", () => {
    it("returns true on successful init", async () => {
      const result = await initEmbeddingStore("/vault");
      expect(result).toBe(true);
      expect(isAvailable()).toBe(true);
    });

    it("returns true if already initialized", async () => {
      await initEmbeddingStore("/vault");
      const result = await initEmbeddingStore("/vault");
      expect(result).toBe(true);
    });
  });

  describe("semanticSearch", () => {
    it("throws if store not initialized", async () => {
      await expect(
        semanticSearch("/vault", "test query"),
      ).rejects.toThrow("not initialized");
    });

    it("runs indexing on first search", async () => {
      await initEmbeddingStore("/vault");

      vi.mocked(changeModule.detectChanges).mockResolvedValue({
        toAdd: ["note.md"],
        toDelete: [],
        currentCommit: "def456",
      });

      mockStore.search.mockReturnValue([
        {
          filePath: "note.md",
          heading: "Heading",
          content: "chunk content",
          score: 0.95,
          chunkIndex: 0,
        },
      ]);

      const results = await semanticSearch("/vault", "test query");

      expect(changeModule.detectChanges).toHaveBeenCalled();
      expect(modelModule.getQueryEmbedding).toHaveBeenCalledWith("test query", undefined);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
    });

    it("always runs change detection (incremental)", async () => {
      await initEmbeddingStore("/vault");
      mockStore.getMeta.mockReturnValue("prev-commit"); // has last_commit

      await semanticSearch("/vault", "test query");

      // Change detection always runs — it's the efficiency mechanism
      expect(changeModule.detectChanges).toHaveBeenCalledWith(
        "/vault",
        [],
        "prev-commit",
      );
    });

    it("forces full reindex when reindex=true", async () => {
      await initEmbeddingStore("/vault");
      mockStore.getMeta.mockReturnValue("prev-commit");
      mockStore.getIndexedFiles.mockReturnValue([
        { file_path: "existing.md", content_hash: "abc", updated_at: 1 },
      ]);

      await semanticSearch("/vault", "test", { reindex: true });

      // reindex=true passes empty indexed files and null commit to force full scan
      expect(changeModule.detectChanges).toHaveBeenCalledWith(
        "/vault",
        [],
        null,
      );
    });

    it("deletes files marked for deletion", async () => {
      await initEmbeddingStore("/vault");

      vi.mocked(changeModule.detectChanges).mockResolvedValue({
        toAdd: [],
        toDelete: ["old.md"],
        currentCommit: "abc",
      });

      await semanticSearch("/vault", "test");

      expect(mockStore.deleteFile).toHaveBeenCalledWith("old.md");
    });

    it("returns empty array for no results", async () => {
      await initEmbeddingStore("/vault");
      mockStore.getMeta.mockReturnValue("commit");

      const results = await semanticSearch("/vault", "test");
      expect(results).toEqual([]);
    });
  });

  describe("closeStore", () => {
    it("resets availability", async () => {
      await initEmbeddingStore("/vault");
      expect(isAvailable()).toBe(true);

      closeStore();
      expect(isAvailable()).toBe(false);
    });
  });
});
