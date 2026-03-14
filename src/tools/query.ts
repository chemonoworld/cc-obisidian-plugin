/**
 * Vault query handlers — structured access to vault metadata.
 *
 * "query" vs "search": search.ts handles text/content search against note
 * content. query.ts handles structural vault queries — files, links, tasks,
 * and metadata — via Obsidian CLI commands and Dataview DQL.
 */

import { execObsidian } from "../cli.js";
import { ok, fail, vault } from "./helpers.js";
import type { ToolResponse } from "../types.js";

export async function listFiles(args: {
  folder?: string;
  ext?: string;
}): Promise<ToolResponse> {
  const params: Record<string, string | boolean> = {};
  if (args.folder !== undefined) params.folder = args.folder;
  if (args.ext !== undefined) params.ext = args.ext;

  const result = await execObsidian("files", params, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function listLinks(args: {
  file: string;
}): Promise<ToolResponse> {
  const result = await execObsidian("links", { file: args.file }, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function findDeadends(): Promise<ToolResponse> {
  const result = await execObsidian("deadends", {}, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function findUnresolved(): Promise<ToolResponse> {
  const result = await execObsidian("unresolved", {}, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function listTasks(args: {
  file?: string;
  status?: string;
  done?: boolean;
  todo?: boolean;
}): Promise<ToolResponse> {
  const params: Record<string, string | boolean> = {};
  if (args.file !== undefined) params.file = args.file;
  if (args.status !== undefined) params.status = args.status;
  if (args.done !== undefined) params.done = args.done;
  if (args.todo !== undefined) params.todo = args.todo;

  const result = await execObsidian("tasks", params, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function dataviewQuery(args: {
  query: string;
}): Promise<ToolResponse> {
  const code = `const dv = app.plugins.plugins["dataview"]?.api; if (!dv) throw new Error("Dataview plugin is not installed or enabled"); const result = await dv.query(${JSON.stringify(args.query)}); if (!result.successful) throw new Error(result.error); return result.value;`;

  const result = await execObsidian("eval", { code }, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}
