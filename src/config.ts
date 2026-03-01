import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Config } from "./types.js";

const CONFIG_DIR = join(homedir(), ".obsidian-cc-mcp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/** Persisted config (loaded from config file). */
let persistedConfig: Config = { defaultVault: null };

/** Runtime override set via setVault(). */
let runtimeVault: string | null = null;

/**
 * Load config from ~/.obsidian-cc-mcp/config.json.
 * Silently handles missing file or invalid JSON.
 */
export async function loadConfig(): Promise<void> {
  persistedConfig = { defaultVault: null };
  runtimeVault = null;

  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const parsed: Config = JSON.parse(raw as string);
    persistedConfig = parsed;
  } catch {
    // Missing file or invalid JSON — start with no default
  }
}

/**
 * Get the full config object.
 */
export function getConfig(): Config {
  return persistedConfig;
}

/**
 * Get the active vault name.
 * Priority: ENV > runtime override > persisted config.
 */
export function getVault(): string | null {
  if (process.env.OBSIDIAN_VAULT) {
    return process.env.OBSIDIAN_VAULT;
  }
  if (runtimeVault !== null) {
    return runtimeVault;
  }
  return persistedConfig.defaultVault ?? null;
}

/**
 * Set vault name at runtime and persist to config file.
 */
export async function setVault(name: string): Promise<void> {
  runtimeVault = name;

  const config: Config = { defaultVault: name };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}
