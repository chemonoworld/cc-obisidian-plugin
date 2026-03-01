import {
  initEmbeddingStore,
  semanticSearch,
  isAvailable,
} from "../embeddings/index.js";
import { ok, fail } from "./helpers.js";
import type { ToolResponse } from "../types.js";

/**
 * Resolve vault name to filesystem path.
 * Tries Obsidian CLI first, then falls back to reading obsidian.json directly.
 */
async function resolveVaultPath(vaultName: string): Promise<string | null> {
  // Try CLI first
  try {
    const { execObsidian } = await import("../cli.js");
    const result = await execObsidian("vaults", { format: "json" });
    if (result.success && result.data) {
      const vaults = result.data as Array<{ name: string; path?: string }>;
      const match = vaults.find(
        (v) => v.name.toLowerCase() === vaultName.toLowerCase(),
      );
      if (match?.path) return match.path;
    }
  } catch {
    // CLI unavailable or failed — try fallback
  }

  // Fallback: read Obsidian's config file directly
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir, platform } = await import("node:os");

    let configPath: string;
    const os = platform();
    if (os === "darwin") {
      configPath = join(homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
    } else if (os === "win32") {
      configPath = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "obsidian", "obsidian.json");
    } else {
      configPath = join(homedir(), ".config", "obsidian", "obsidian.json");
    }

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      vaults?: Record<string, { path?: string }>;
    };
    if (!config.vaults) return null;

    const lowerName = vaultName.toLowerCase();
    for (const vault of Object.values(config.vaults)) {
      if (!vault.path) continue;
      // Match by folder name
      const folderName = vault.path.split("/").pop() ?? vault.path.split("\\").pop() ?? "";
      if (folderName.toLowerCase() === lowerName) {
        return vault.path;
      }
    }
  } catch {
    // Config file not found or unreadable
  }

  return null;
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
    try {
      await initEmbeddingStore(vaultPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(
        `Semantic search init failed: ${msg}\n\n` +
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
