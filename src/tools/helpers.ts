import { getVault } from "../config.js";
import type { ToolResponse } from "../types.js";

export function ok(text: string): ToolResponse {
  return { content: [{ type: "text", text }], isError: false };
}

export function fail(text: string): ToolResponse {
  return { content: [{ type: "text", text }], isError: true };
}

export function vault(): string | undefined {
  return getVault() ?? undefined;
}
