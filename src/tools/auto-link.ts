import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { ok, fail } from "./helpers.js";
import type { ToolResponse } from "../types.js";

const EXCLUDED_DIRS = new Set([".obsidian", "node_modules", ".git", ".trash"]);
const MIN_NAME_LENGTH = 2;

/**
 * Recursively walk vault and collect all .md file paths (relative to root).
 */
async function walkNotes(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
      results.push(...(await walkNotes(fullPath, root)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(relative(root, fullPath));
    }
  }
  return results;
}

/**
 * Extract note name from a file path (filename without .md extension).
 */
function noteName(filePath: string): string {
  return basename(filePath, extname(filePath));
}

interface Segment {
  text: string;
  protected: boolean;
}

/**
 * Split content into protected and unprotected segments.
 * Protected: YAML frontmatter, fenced code blocks, inline code,
 *            existing wiki links, markdown links, bare URLs.
 */
function splitByProtectedRegions(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern =
    /^---\n[\s\S]*?\n---\n|```[\s\S]*?```|`[^`\n]+`|\[\[[^\]]+\]\]|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/gm;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), protected: false });
  }

  return segments;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Insert wiki links for unlinked note name mentions.
 * Uses Unicode-aware boundaries so Korean/CJK names work correctly.
 */
function insertLinks(
  content: string,
  noteNames: string[],
  selfName: string,
): { content: string; additions: Array<{ name: string; count: number }> } {
  const additions = new Map<string, number>();

  // Exclude self, too-short names; sort longest first to avoid partial matches
  const candidates = noteNames
    .filter((n) => n !== selfName && n.length >= MIN_NAME_LENGTH)
    .sort((a, b) => b.length - a.length);

  let currentContent = content;

  for (const name of candidates) {
    // Re-split each iteration so newly inserted [[...]] links are protected
    const segments = splitByProtectedRegions(currentContent);
    let changed = false;

    for (const seg of segments) {
      if (seg.protected) continue;

      const escaped = escapeRegex(name);
      // Unicode-aware word boundary: not preceded/followed by letter or digit
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        "giu",
      );
      const matches = seg.text.match(regex);
      if (matches && matches.length > 0) {
        seg.text = seg.text.replace(regex, `[[${name}]]`);
        additions.set(name, (additions.get(name) ?? 0) + matches.length);
        changed = true;
      }
    }

    if (changed) {
      currentContent = segments.map((s) => s.text).join("");
    }
  }

  return {
    content: currentContent,
    additions: [...additions.entries()].map(([name, count]) => ({ name, count })),
  };
}

export async function autoLinkTool(args: {
  file: string;
  dry_run?: boolean;
}): Promise<ToolResponse> {
  const { getVault } = await import("../config.js");
  const { resolveVaultPath } = await import("./semantic.js");

  const vaultName = getVault();
  if (!vaultName) {
    return fail("No vault configured. Use set_vault to configure a vault.");
  }

  const vaultPath = await resolveVaultPath(vaultName);
  if (!vaultPath) {
    return fail(
      `Could not resolve filesystem path for vault "${vaultName}". ` +
        "Make sure the vault is accessible via the Obsidian CLI.",
    );
  }

  // Normalize file path
  const filePath = args.file.endsWith(".md") ? args.file : `${args.file}.md`;
  const fullPath = join(vaultPath, filePath);

  // Read the target note
  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return fail(`Note not found: ${filePath}`);
  }

  // Walk vault to get all note names
  const allFiles = await walkNotes(vaultPath, vaultPath);
  const allNames = [...new Set(allFiles.map(noteName))];
  const selfName = noteName(filePath);

  // Insert links
  const result = insertLinks(content, allNames, selfName);

  if (result.additions.length === 0) {
    return ok("No new links to add. All mentions are already linked or no matching notes found.");
  }

  const summary = result.additions
    .map((a) => `  - [[${a.name}]] x${a.count}`)
    .join("\n");
  const totalLinks = result.additions.reduce((sum, a) => sum + a.count, 0);

  if (args.dry_run) {
    return ok(
      `Dry run: ${totalLinks} link(s) would be added to "${filePath}":\n${summary}\n\n` +
        "Run with dry_run=false to apply changes.",
    );
  }

  // Write back
  await writeFile(fullPath, result.content, "utf-8");

  return ok(`Added ${totalLinks} link(s) to "${filePath}":\n${summary}`);
}

// Export internals for testing
export { insertLinks as _insertLinks, splitByProtectedRegions as _splitByProtectedRegions };
