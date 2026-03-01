import { execFile as nodeExecFile } from "node:child_process";
import type { ParsedCliResult } from "./types.js";

const OBSIDIAN_BIN = process.env.OBSIDIAN_CLI_PATH ?? "obsidian";

/**
 * Build argv array for the Obsidian CLI.
 * Format: [vault=<name>] <command> [key=value | flag]...
 */
export function buildArgv(
  command: string,
  params: Record<string, string | boolean> = {},
  vault?: string | null,
): string[] {
  const args: string[] = [];

  if (vault) {
    args.push(`vault=${vault}`);
  }

  args.push(command);

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "boolean") {
      if (value) {
        args.push(key);
      }
      // skip false booleans entirely
    } else {
      args.push(`${key}=${value}`);
    }
  }

  return args;
}

/** Strip ANSI escape codes and trim whitespace. */
export function cleanOutput(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim();
}

/** Detect CLI-reported errors in stdout (exit codes are unreliable). */
export function detectError(output: string): string | null {
  if (!output) return null;
  if (/^Error:/m.test(output)) return output;
  if (/^No .* found/m.test(output)) return output;
  if (/^Cannot /m.test(output)) return output;
  return null;
}

/**
 * Try to parse stdout as JSON.
 * Strips leading debug/log lines that Obsidian CLI sometimes emits.
 */
export function tryParseJson(raw: string): unknown {
  let text = raw.trim();

  // Find the first line starting with [ or { (skip any preamble lines)
  const lines = text.split("\n");
  const jsonLineIdx = lines.findIndex(
    (l) => l.trimStart().startsWith("[") || l.trimStart().startsWith("{"),
  );
  if (jsonLineIdx > 0) {
    text = lines.slice(jsonLineIdx).join("\n").trim();
  }

  if (!text.startsWith("[") && !text.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Execute an Obsidian CLI command and return a parsed result.
 * Uses execFile (not exec) to prevent shell injection.
 */
export function execObsidian(
  command: string,
  params: Record<string, string | boolean> = {},
  options: { vault?: string } = {},
): Promise<ParsedCliResult> {
  const argv = buildArgv(command, params, options.vault);

  return new Promise((resolve) => {
    nodeExecFile(
      OBSIDIAN_BIN,
      argv,
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            raw: stderr || error.message,
            data: null,
            error: error.message,
          });
          return;
        }

        const cleaned = cleanOutput(String(stdout));
        const errMsg = detectError(cleaned);
        if (errMsg) {
          resolve({
            success: false,
            raw: cleaned,
            data: null,
            error: errMsg,
          });
          return;
        }

        const data = tryParseJson(cleaned);
        resolve({
          success: true,
          raw: cleaned,
          data,
          error: null,
        });
      },
    );
  });
}
