---
feature: semantic-search
subtask: 03-model
size: small
depends-on: []
---

# HuggingFace Pipeline Singleton Wrapper

## Goal
Create a singleton wrapper around `@huggingface/transformers` pipeline for embedding text using the configured model (default: `Xenova/bge-m3`).

## Files
- `src/embeddings/model.ts` — Pipeline wrapper

## API Contract

```typescript
function getEmbedding(text: string): Promise<Float32Array>
function getEmbeddings(texts: string[]): Promise<Float32Array[]>
function isModelLoaded(): boolean
```

## Implementation Notes

1. **Lazy loading**: Use dynamic `import('@huggingface/transformers')` since it's an optionalDependency. If import fails, throw descriptive error: "Embedding dependencies not installed. Run `npm install`."
2. **Singleton pipeline**: Initialize the pipeline once and cache it:
   ```typescript
   let pipelineInstance: any = null;

   async function getPipeline(modelId: string) {
     if (!pipelineInstance) {
       const { pipeline } = await import('@huggingface/transformers');
       pipelineInstance = await pipeline('feature-extraction', modelId, { dtype: 'int8' });
     }
     return pipelineInstance;
   }
   ```
3. **dtype: 'int8'**: MUST be explicit. Unquantized models have a known loading bug.
4. **CLS pooling**: Use `{ pooling: 'cls', normalize: true }` for all embeddings. NO prefix needed for BGE-M3.
5. **Output conversion**: The pipeline returns a Tensor. Use `.tolist()[0]` to get `number[]`, then convert to `Float32Array`.
6. **Batch processing**: For `getEmbeddings()`, process texts individually through the pipeline (transformers.js v3 handles batching internally when possible).
7. **Model ID**: Accept model ID as parameter or read from config. Default to `Xenova/bge-m3`.
8. **isModelLoaded()**: Return `pipelineInstance !== null`.
9. **Error wrapping**: Catch pipeline creation errors (network issues, model not found) and re-throw with context.

## Acceptance Criteria
- [ ] Lazy-loads @huggingface/transformers via dynamic import
- [ ] Creates pipeline singleton (initialized once)
- [ ] Returns Float32Array of 1024 dimensions for bge-m3
- [ ] Uses CLS pooling with normalization
- [ ] Uses dtype: 'int8' explicitly
- [ ] getEmbeddings processes multiple texts
- [ ] isModelLoaded returns correct state
- [ ] Descriptive error if transformers package not installed
- [ ] Descriptive error if model download fails

## Test Plan
- Mock @huggingface/transformers pipeline
- getEmbedding returns Float32Array of correct dimensions
- getEmbeddings returns array of Float32Arrays
- Pipeline created only once (singleton)
- isModelLoaded reflects initialization state
- Error handling for missing package
