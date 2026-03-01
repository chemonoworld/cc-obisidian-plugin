import { execObsidian } from "../cli.js";
import { getVault, setVault as configSetVault } from "../config.js";
import { ok, fail } from "./helpers.js";
import type { ToolResponse } from "../types.js";

export async function listVaults(_args: Record<string, never> = {}): Promise<ToolResponse> {
  const result = await execObsidian("vaults", { format: "json" });
  if (!result.success) return fail(result.error ?? "Unknown error");

  if (result.data) {
    return ok(JSON.stringify(result.data, null, 2));
  }
  return ok(result.raw);
}

export async function vaultInfo(_args: Record<string, never> = {}): Promise<ToolResponse> {
  const currentVault = getVault();
  const result = await execObsidian(
    "vault",
    { info: "name" },
    { vault: currentVault ?? undefined },
  );
  if (!result.success) return fail(result.error ?? "Unknown error");

  const info = {
    configuredVault: currentVault,
    cliResponse: result.data ?? result.raw,
  };
  return ok(JSON.stringify(info, null, 2));
}

export async function setVaultTool(args: {
  name: string;
}): Promise<ToolResponse> {
  if (process.env.OBSIDIAN_VAULT) {
    return fail(
      `Cannot override vault: OBSIDIAN_VAULT environment variable is set to ` +
      `"${process.env.OBSIDIAN_VAULT}" and takes precedence. Unset it to use set_vault.`,
    );
  }
  await configSetVault(args.name);
  return ok(`Vault set to "${args.name}". This will persist across sessions.`);
}
