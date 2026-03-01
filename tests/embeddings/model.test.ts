import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @huggingface/transformers module
const mockPipeline = vi.fn();
vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipeline,
}));

const { getEmbedding, getEmbeddings, isModelLoaded } = await import(
  "../../src/embeddings/model.js"
);

// Shared mock extractor that persists across tests (like the real singleton)
const fakeVector = Array.from({ length: 1024 }, (_, i) => i * 0.001);
const mockExtractor = vi.fn().mockResolvedValue({
  tolist: () => [fakeVector],
});

describe("model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockExtractor);
  });

  it("isModelLoaded returns boolean", () => {
    expect(typeof isModelLoaded()).toBe("boolean");
  });

  it("getEmbedding creates pipeline with correct params and returns Float32Array", async () => {
    const result = await getEmbedding("test text");

    // Verify pipeline was created with correct params
    expect(mockPipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/bge-m3",
      { dtype: "int8" },
    );

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(1024);

    // Verify CLS pooling with normalization
    expect(mockExtractor).toHaveBeenCalledWith("test text", {
      pooling: "cls",
      normalize: true,
    });
  });

  it("reuses pipeline singleton for same model (no new pipeline() call)", async () => {
    // First call creates the pipeline
    await getEmbedding("first");
    const createCount = mockPipeline.mock.calls.length;

    // Second call with same model should reuse
    await getEmbedding("second");
    expect(mockPipeline.mock.calls.length).toBe(createCount);

    // But extractor should have been called for both
    expect(mockExtractor).toHaveBeenCalledWith("second", {
      pooling: "cls",
      normalize: true,
    });
  });

  it("getEmbeddings returns array of Float32Arrays via batch", async () => {
    // Mock batch output: pipeline returns nested array for multiple inputs
    mockExtractor.mockResolvedValueOnce({
      tolist: () => [fakeVector, fakeVector, fakeVector],
    });

    const results = await getEmbeddings(["text1", "text2", "text3"]);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r).toBeInstanceOf(Float32Array);
      expect(r.length).toBe(1024);
    }

    // Verify batch call: array of texts passed to pipeline
    expect(mockExtractor).toHaveBeenCalledWith(
      ["text1", "text2", "text3"],
      { pooling: "cls", normalize: true },
    );
  });

  it("creates new pipeline for different model ID", async () => {
    await getEmbedding("test", "Xenova/multilingual-e5-small");

    expect(mockPipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/multilingual-e5-small",
      { dtype: "int8" },
    );
  });

  it("isModelLoaded returns true after pipeline init", async () => {
    await getEmbedding("init");
    expect(isModelLoaded()).toBe(true);
  });
});
