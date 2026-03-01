import { execObsidian } from "../cli.js";
import { ok, fail, vault } from "./helpers.js";
import type { ToolResponse } from "../types.js";

export async function readNote(args: {
  file: string;
}): Promise<ToolResponse> {
  const result = await execObsidian("read", { file: args.file }, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw);
}

export async function createNote(args: {
  name: string;
  content?: string;
  overwrite?: boolean;
}): Promise<ToolResponse> {
  const params: Record<string, string | boolean> = {};
  // CLI requires "path" for full paths with "/", "name" for simple names
  if (args.name.includes("/")) {
    params.path = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
  } else {
    params.name = args.name;
  }
  if (args.content) params.content = args.content;
  if (args.overwrite) params.overwrite = true;

  const result = await execObsidian("create", params, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Created ${args.name}`);
}

export async function updateNote(args: {
  file: string;
  content: string;
  mode?: "append" | "prepend";
}): Promise<ToolResponse> {
  const command = args.mode === "prepend" ? "prepend" : "append";
  const result = await execObsidian(
    command,
    { file: args.file, content: args.content },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Updated ${args.file}`);
}

export async function deleteNote(args: {
  file: string;
  permanent?: boolean;
}): Promise<ToolResponse> {
  const params: Record<string, string | boolean> = { file: args.file };
  if (args.permanent) params.permanent = true;

  const result = await execObsidian("delete", params, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Deleted ${args.file}`);
}

export async function moveNote(args: {
  file: string;
  to: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "move",
    { file: args.file, to: args.to },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Moved ${args.file} to ${args.to}`);
}

export async function setProperty(args: {
  file: string;
  name: string;
  value: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "property:set",
    { file: args.file, name: args.name, value: args.value },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Set ${args.name}=${args.value} on ${args.file}`);
}

export async function removeProperty(args: {
  file: string;
  name: string;
}): Promise<ToolResponse> {
  const result = await execObsidian(
    "property:remove",
    { file: args.file, name: args.name },
    { vault: vault() },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw || `Removed ${args.name} from ${args.file}`);
}

export async function dailyNote(args: {
  action?: "read" | "append";
  content?: string;
}): Promise<ToolResponse> {
  const action = args.action ?? "read";
  if (action === "append") {
    if (!args.content) {
      return fail("content is required when action is append");
    }
    const result = await execObsidian(
      "daily:append",
      { content: args.content },
      { vault: vault() },
    );
    if (!result.success) return fail(result.error ?? "Unknown error");
    return ok(result.raw || "Appended to daily note");
  }

  const result = await execObsidian("daily:read", {}, { vault: vault() });
  if (!result.success) return fail(result.error ?? "Unknown error");
  return ok(result.raw);
}
