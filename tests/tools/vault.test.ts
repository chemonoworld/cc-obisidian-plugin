import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/cli.js", () => ({
  execObsidian: vi.fn(),
}));
vi.mock("../../src/config.js", () => ({
  getVault: vi.fn(() => "TestVault"),
  setVault: vi.fn(),
}));

const { execObsidian } = await import("../../src/cli.js");
const { setVault } = await import("../../src/config.js");
const mockExec = vi.mocked(execObsidian);
const mockSetVault = vi.mocked(setVault);

const { listVaults, vaultInfo, setVaultTool } = await import(
  "../../src/tools/vault.js"
);

describe("Vault tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listVaults", () => {
    it("returns vault list", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '[{"name":"A","id":"1"}]',
        data: [{ name: "A", id: "1" }],
        error: null,
      });
      const res = await listVaults();
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual([{ name: "A", id: "1" }]);
    });

    it("returns error on failure", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "Cannot list vaults",
      });
      const res = await listVaults();
      expect(res.isError).toBe(true);
    });
  });

  describe("vaultInfo", () => {
    it("returns vault info with configured vault", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "TestVault",
        data: null,
        error: null,
      });
      const res = await vaultInfo();
      expect(res.isError).toBe(false);
      const info = JSON.parse(res.content[0].text);
      expect(info.configuredVault).toBe("TestVault");
    });
  });

  describe("setVaultTool", () => {
    afterEach(() => {
      delete process.env.OBSIDIAN_VAULT;
    });

    it("sets vault and returns confirmation", async () => {
      mockSetVault.mockResolvedValue(undefined);
      const res = await setVaultTool({ name: "NewVault" });
      expect(res.isError).toBe(false);
      expect(res.content[0].text).toContain("NewVault");
      expect(mockSetVault).toHaveBeenCalledWith("NewVault");
    });

    it("returns error when OBSIDIAN_VAULT env var is set", async () => {
      process.env.OBSIDIAN_VAULT = "EnvVault";
      const res = await setVaultTool({ name: "NewVault" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("OBSIDIAN_VAULT");
      expect(mockSetVault).not.toHaveBeenCalled();
    });
  });
});
