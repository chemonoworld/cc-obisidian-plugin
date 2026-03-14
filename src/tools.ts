import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as crud from "./tools/crud.js";
import * as search from "./tools/search.js";
import * as vault from "./tools/vault.js";
import { semanticSearchTool, reindexTool } from "./tools/semantic.js";
import { autoLinkTool } from "./tools/auto-link.js";
import type { ToolResponse } from "./types.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: ToolHandler;
}

const tools: ToolDef[] = [
  // --- CRUD Tools ---
  {
    name: "read_note",
    description:
      "Read the full content of a note from the Obsidian vault. Returns the markdown content.",
    schema: {
      file: z.string().describe("Path to the note file (e.g. 'My Note' or 'folder/My Note')"),
    },
    handler: (a) => crud.readNote(a as { file: string }),
  },
  {
    name: "create_note",
    description: "Create a new note in the Obsidian vault.",
    schema: {
      name: z.string().describe("Name or path for the new note (e.g. 'My Note' or 'folder/subfolder/My Note')"),
      content: z.string().optional().describe("Initial markdown content"),
      overwrite: z.boolean().optional().describe("Overwrite if note already exists"),
    },
    handler: (a) => crud.createNote(a as { name: string; content?: string; overwrite?: boolean }),
  },
  {
    name: "update_note",
    description: "Append or prepend content to an existing note.",
    schema: {
      file: z.string().describe("Path to the note file"),
      content: z.string().describe("Content to add"),
      mode: z
        .enum(["append", "prepend"])
        .optional()
        .describe("Where to add content (default: append)"),
    },
    handler: (a) =>
      crud.updateNote(a as { file: string; content: string; mode?: "append" | "prepend" }),
  },
  {
    name: "delete_note",
    description: "Delete a note from the vault. Moves to trash by default.",
    schema: {
      file: z.string().describe("Path to the note file"),
      permanent: z.boolean().optional().describe("Permanently delete instead of trash"),
    },
    handler: (a) => crud.deleteNote(a as { file: string; permanent?: boolean }),
  },
  {
    name: "move_note",
    description: "Move or rename a note within the vault.",
    schema: {
      file: z.string().describe("Current path of the note"),
      to: z.string().describe("New path for the note"),
    },
    handler: (a) => crud.moveNote(a as { file: string; to: string }),
  },
  {
    name: "set_property",
    description: "Set a frontmatter property on a note.",
    schema: {
      file: z.string().describe("Path to the note file"),
      name: z.string().describe("Property name"),
      value: z.string().describe("Property value"),
    },
    handler: (a) => crud.setProperty(a as { file: string; name: string; value: string }),
  },
  {
    name: "remove_property",
    description: "Remove a frontmatter property from a note.",
    schema: {
      file: z.string().describe("Path to the note file"),
      name: z.string().describe("Property name to remove"),
    },
    handler: (a) => crud.removeProperty(a as { file: string; name: string }),
  },
  {
    name: "daily_note",
    description: "Read or append to today's daily note.",
    schema: {
      action: z.enum(["read", "append"]).optional().describe("Action to perform (default: read)"),
      content: z.string().optional().describe("Content to append (required when action=append)"),
    },
    handler: (a) => crud.dailyNote(a as { action?: "read" | "append"; content?: string }),
  },

  // --- Search Tools ---
  {
    name: "search_notes",
    description:
      "Search notes in the vault. Supports operators: tag:#name, [property:value], [property:>N], path:\"folder\", /regex/, task-todo:, boolean AND/OR/-exclude.",
    schema: {
      query: z.string().describe("Search query with optional operators"),
      format: z.string().optional().describe("Output format (default: json)"),
    },
    handler: (a) => search.searchNotes(a as { query: string; format?: string }),
  },
  {
    name: "list_tags",
    description: "List all tags in the vault with their usage counts.",
    schema: {},
    handler: () => search.listTags(),
  },
  {
    name: "list_properties",
    description: "List all frontmatter properties used across vault notes.",
    schema: {},
    handler: () => search.listProperties(),
  },
  {
    name: "get_backlinks",
    description: "Get all notes that link to the specified note.",
    schema: {
      file: z.string().describe("Path to the note file"),
      format: z.string().optional().describe("Output format (default: json)"),
    },
    handler: (a) => search.getBacklinks(a as { file: string; format?: string }),
  },
  {
    name: "find_orphans",
    description: "Find notes with no incoming links (orphan notes).",
    schema: {},
    handler: () => search.findOrphans(),
  },
  // Security: eval_query is guarded by src/guardrail.ts (multi-layer static analysis).
  // Kept because it enables irreplaceable power-user queries (graph traversal, plugin APIs).
  // Future consideration: AST-based allowlist or code-preview confirmation mechanism.
  {
    name: "eval_query",
    description:
      "Execute JavaScript code against the Obsidian API. Has access to the `app` object (vault, metadataCache, workspace, plugins). Use for advanced queries not covered by other tools.\n\nSecurity: Code is validated by a guardrail that blocks dangerous patterns (eval, require, fetch, Proxy, etc.). Vault write operations are blocked by default — set allow_write=true to enable. See guardrail docs for details.",
    schema: {
      code: z.string().describe("JavaScript code to execute (has access to `app` object)"),
      allow_write: z
        .boolean()
        .optional()
        .describe("Allow vault write operations (default: false)"),
    },
    handler: (a) => search.evalQuery(a as { code: string; allow_write?: boolean }),
  },

  // --- Semantic Search ---
  {
    name: "semantic_search",
    description:
      "Search notes using natural language semantic similarity. Uses local embedding models to find contextually relevant content, even without exact keyword matches. Requires optional dependencies to be installed.",
    schema: {
      query: z.string().min(1).describe("Natural language search query"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (default: 10)"),
      reindex: z
        .boolean()
        .optional()
        .describe("Force re-indexing before search (default: false)"),
      translations: z
        .array(z.string())
        .optional()
        .describe("Additional translated queries for cross-lingual search"),
    },
    handler: (a) =>
      semanticSearchTool(a as { query: string; limit?: number; reindex?: boolean; translations?: string[] }),
  },

  {
    name: "reindex",
    description:
      "Rebuild the semantic search embedding index for the vault. Use this to explicitly trigger reindexing when notes have changed. Defaults to full reindex; set force=false for incremental update only.",
    schema: {
      force: z
        .boolean()
        .optional()
        .describe("Force full reindex (default: true). Set false for incremental update only."),
    },
    handler: (a) => reindexTool(a as { force?: boolean }),
  },

  // --- Auto-Link ---
  {
    name: "auto_link",
    description:
      "Automatically insert [[wiki links]] in a note by finding mentions of other note names in the vault. Scans the note content and wraps unlinked mentions with [[...]]. Skips frontmatter, code blocks, existing links, and URLs.",
    schema: {
      file: z.string().describe("Path to the note file to auto-link"),
      dry_run: z
        .boolean()
        .optional()
        .describe("Preview changes without writing (default: false)"),
    },
    handler: (a) => autoLinkTool(a as { file: string; dry_run?: boolean }),
  },

  // --- Vault Tools ---
  {
    name: "set_vault",
    description:
      "Switch the active Obsidian vault. The choice persists across sessions in ~/.obsidian-cc-mcp/config.json.",
    schema: {
      name: z.string().describe("Name of the vault to switch to"),
    },
    handler: (a) => vault.setVaultTool(a as { name: string }),
  },
  {
    name: "list_vaults",
    description: "List all available Obsidian vaults.",
    schema: {},
    handler: () => vault.listVaults(),
  },
  {
    name: "vault_info",
    description: "Get information about the currently active vault.",
    schema: {},
    handler: () => vault.vaultInfo(),
  },
];

/** Register all tools on the McpServer instance. */
export function registerTools(server: McpServer): void {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      const result = await tool.handler(args as Record<string, unknown>);
      return {
        content: result.content,
        isError: result.isError,
      };
    });
  }
}

/** Handle a tool call by name. Used for testing without a full MCP server. */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  return tool.handler(args);
}

/** Get all tool definitions (for testing). */
export function getAllTools(): readonly ToolDef[] {
  return tools;
}
