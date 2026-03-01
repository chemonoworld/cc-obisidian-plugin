import {
  initEmbeddingStore,
  semanticSearch,
  isAvailable,
} from "../embeddings/index.js";
import { ok, fail } from "./helpers.js";
import type { ToolResponse } from "../types.js";

/**
 * Resolve vault name to filesystem path via the Obsidian CLI.
 */
async function resolveVaultPath(vaultName: string): Promise<string | null> {
  try {
    const { execObsidian } = await import("../cli.js");
    const result = await execObsidian("vaults", { format: "json" });
    if (!result.success || !result.data) return null;

    const vaults = result.data as Array<{ name: string; path?: string }>;
    const match = vaults.find(
      (v) => v.name.toLowerCase() === vaultName.toLowerCase(),
    );
    return match?.path ?? null;
  } catch {
    return null;
  }
}

export async function semanticSearchTool(args: {
  query: string;
  limit?: number;
  reindex?: boolean;
}): Promise<ToolResponse> {
  const { getVault } = await import("../config.js");

  const vaultName = getVault();
  if (!vaultName) {
    return fail("No vault configured. Use set_vault to configure a vault.");
  }

  // Resolve vault path
  const vaultPath = await resolveVaultPath(vaultName);
  if (!vaultPath) {
    return fail(
      `Could not resolve filesystem path for vault "${vaultName}". ` +
        `Make sure the vault is accessible via the Obsidian CLI.`,
    );
  }

  // Initialize store if needed
  if (!isAvailable()) {
    const success = await initEmbeddingStore(vaultPath);
    if (!success) {
      return fail(
        "Semantic search is not available. " +
          "Ensure optional dependencies are installed: " +
          "npm install @huggingface/transformers better-sqlite3 sqlite-vec",
      );
    }
  }

  try {
    const results = await semanticSearch(vaultPath, args.query, {
      limit: args.limit,
      reindex: args.reindex,
    });

    if (results.length === 0) {
      return ok("No results found for the given query.");
    }

    const formatted = results
      .map((r, i) => {
        const heading = r.heading ? ` > ${r.heading}` : "";
        const score = (r.score * 100).toFixed(1);
        return (
          `### ${i + 1}. ${r.filePath}${heading} (${score}% match)\n\n` +
          r.content.slice(0, 500) +
          (r.content.length > 500 ? "..." : "")
        );
      })
      .join("\n\n---\n\n");

    return ok(formatted);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`Semantic search failed: ${msg}`);
  }
}
