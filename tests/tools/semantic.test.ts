import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/cli.js", () => ({
  execObsidian: vi.fn().mockResolvedValue({
    success: true,
    raw: "",
    data: [{ name: "TestVault", path: "/Users/test/vault" }],
    error: null,
  }),
}));

vi.mock("../../src/config.js", () => ({
  getVault: vi.fn(() => "TestVault"),
}));

vi.mock("../../src/embeddings/index.js", () => ({
  initEmbeddingStore: vi.fn().mockResolvedValue(true),
  semanticSearch: vi.fn().mockResolvedValue([]),
  isAvailable: vi.fn().mockReturnValue(false),
}));

const embeddingsIndex = await import("../../src/embeddings/index.js");
const configModule = await import("../../src/config.js");
const { semanticSearchTool } = await import("../../src/tools/semantic.js");

describe("semanticSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configModule.getVault).mockReturnValue("TestVault");
    vi.mocked(embeddingsIndex.isAvailable).mockReturnValue(false);
    vi.mocked(embeddingsIndex.initEmbeddingStore).mockResolvedValue(true);
    vi.mocked(embeddingsIndex.semanticSearch).mockResolvedValue([]);
  });

  it("returns error when no vault configured", async () => {
    vi.mocked(configModule.getVault).mockReturnValue(null);

    const res = await semanticSearchTool({ query: "test" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No vault configured");
  });

  it("initializes store if not available", async () => {
    const res = await semanticSearchTool({ query: "test" });

    expect(embeddingsIndex.initEmbeddingStore).toHaveBeenCalledWith(
      "/Users/test/vault",
    );
    expect(res.isError).toBe(false);
  });

  it("returns error with details when init fails", async () => {
    vi.mocked(embeddingsIndex.initEmbeddingStore).mockRejectedValue(
      new Error("better-sqlite3 is not installed"),
    );

    const res = await semanticSearchTool({ query: "test" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("better-sqlite3 is not installed");
  });

  it("returns formatted results on success", async () => {
    vi.mocked(embeddingsIndex.isAvailable).mockReturnValue(true);
    vi.mocked(embeddingsIndex.semanticSearch).mockResolvedValue([
      {
        filePath: "notes/test.md",
        heading: "Section A",
        content: "This is relevant content.",
        score: 0.92,
      },
      {
        filePath: "notes/other.md",
        heading: null,
        content: "Another result.",
        score: 0.85,
      },
    ]);

    const res = await semanticSearchTool({ query: "test query", limit: 5 });

    expect(res.isError).toBe(false);
    const text = res.content[0].text;
    expect(text).toContain("notes/test.md");
    expect(text).toContain("Section A");
    expect(text).toContain("92.0%");
    expect(text).toContain("notes/other.md");
    expect(text).toContain("85.0%");
  });

  it("returns message when no results found", async () => {
    vi.mocked(embeddingsIndex.isAvailable).mockReturnValue(true);

    const res = await semanticSearchTool({ query: "obscure query" });

    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain("No results");
  });

  it("handles search errors gracefully", async () => {
    vi.mocked(embeddingsIndex.isAvailable).mockReturnValue(true);
    vi.mocked(embeddingsIndex.semanticSearch).mockRejectedValue(
      new Error("model download failed"),
    );

    const res = await semanticSearchTool({ query: "test" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("model download failed");
  });
});
