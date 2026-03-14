// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineInstance: any = null;
let currentModelId: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

const DEFAULT_MODEL = 'Xenova/bge-m3';

async function getPipeline(modelId: string) {
  if (pipelineInstance && currentModelId === modelId) {
    return pipelineInstance;
  }
  // If a load is already in flight for a different model, let it finish first
  if (pipelinePromise) {
    return pipelinePromise;
  }
  pipelinePromise = (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      pipelineInstance = await pipeline('feature-extraction', modelId, { dtype: 'fp16' });
      currentModelId = modelId;
      return pipelineInstance;
    } catch (e) {
      if (
        (e as Error).message?.includes('Cannot find module') ||
        (e as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND'
      ) {
        throw new Error('Embedding dependencies not installed. Run `npm install @huggingface/transformers`.');
      }
      const msg = (e as Error).message ?? String(e);
      if (msg.includes('ENOSPC') || msg.includes('no space')) {
        throw new Error(
          `Not enough disk space to download model "${modelId}". ` +
          `Models are cached at ~/.cache/huggingface/hub/ — free up space and retry.`
        );
      }
      if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        throw new Error(
          `Network error while downloading model "${modelId}". ` +
          `Check your internet connection and retry. Models are cached at ~/.cache/huggingface/hub/`
        );
      }
      if (msg.includes('404') || msg.includes('not found')) {
        throw new Error(
          `Model "${modelId}" not found on Hugging Face Hub. ` +
          `Verify the model ID is correct (default: Xenova/bge-m3).`
        );
      }
      throw new Error(`Failed to load embedding model "${modelId}": ${msg}`);
    } finally {
      pipelinePromise = null;
    }
  })();
  return pipelinePromise;
}

export async function getEmbedding(text: string, modelId: string = DEFAULT_MODEL): Promise<Float32Array> {
  const pipe = await getPipeline(modelId);
  const output = await pipe(text, { pooling: 'cls', normalize: true });
  const array = output.tolist()[0] as number[];
  return new Float32Array(array);
}

/**
 * Generate embedding for a search query.
 * Separate function to allow query-specific processing in the future.
 */
export async function getQueryEmbedding(text: string, modelId: string = DEFAULT_MODEL): Promise<Float32Array> {
  return getEmbedding(text, modelId);
}

export async function getEmbeddings(texts: string[], modelId: string = DEFAULT_MODEL): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await getEmbedding(texts[0], modelId)];

  // Batch: pass array to pipeline for efficient processing
  const pipe = await getPipeline(modelId);
  const output = await pipe(texts, { pooling: 'cls', normalize: true });
  const arrays = output.tolist() as number[][];
  return arrays.map((arr: number[]) => new Float32Array(arr));
}

export function isModelLoaded(): boolean {
  return pipelineInstance !== null;
}
