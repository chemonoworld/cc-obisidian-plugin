import { execObsidian } from "../cli.js";
import { ok, fail, vault } from "./helpers.js";
import type { ToolResponse } from "../types.js";

export async function searchNotes(args: {
  query: string;
  format?: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "search",
    { query: args.query, format: args.format ?? "json" },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function listTags(_args: Record<string, never> = {}): Promise<ToolResponse> {
  const result = await execObsidian(
    "tags",
    { all: true, counts: true, format: "json" },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function listProperties(_args: Record<string, never> = {}): Promise<ToolResponse> {
  const result = await execObsidian(
    "properties",
    { all: true, format: "tsv" },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw);
}

export async function getBacklinks(args: {
  file: string;
  format?: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "backlinks",
    { file: args.file, format: args.format ?? "json" },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function findOrphans(_args: Record<string, never> = {}): Promise<ToolResponse> {
  const result = await execObsidian("orphans", {}, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function evalQuery(args: {
  code: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "eval",
    { code: args.code },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}
