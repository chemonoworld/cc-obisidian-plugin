import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

const { readFile, writeFile, mkdir } = await import("node:fs/promises");
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

// Re-import config module fresh for each test
let loadConfig: () => Promise<void>;
let getVault: () => string | null;
let setVault: (name: string) => Promise<void>;

describe("config", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock("node:fs/promises", () => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
    }));

    const mod = await import("../src/config.js");
    loadConfig = mod.loadConfig;
    getVault = mod.getVault;
    setVault = mod.setVault;

    // Clear env
    delete process.env.OBSIDIAN_VAULT;
  });

  afterEach(() => {
    delete process.env.OBSIDIAN_VAULT;
  });

  describe("loadConfig", () => {
    it("reads config file and sets defaultVault", async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ defaultVault: "TestVault" })
      );
      await loadConfig();
      expect(getVault()).toBe("TestVault");
    });

    it("handles missing config file gracefully", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      await loadConfig();
      expect(getVault()).toBeNull();
    });

    it("handles invalid JSON gracefully", async () => {
      mockReadFile.mockResolvedValue("not json");
      await loadConfig();
      expect(getVault()).toBeNull();
    });
  });

  describe("getVault", () => {
    it("returns env var when set", async () => {
      process.env.OBSIDIAN_VAULT = "EnvVault";
      mockReadFile.mockResolvedValue(
        JSON.stringify({ defaultVault: "FileVault" })
      );
      await loadConfig();
      expect(getVault()).toBe("EnvVault");
    });

    it("returns runtime override over persisted value", async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ defaultVault: "FileVault" })
      );
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);
      await loadConfig();
      await setVault("RuntimeVault");
      expect(getVault()).toBe("RuntimeVault");
    });

    it("returns persisted value when no override", async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ defaultVault: "FileVault" })
      );
      await loadConfig();
      expect(getVault()).toBe("FileVault");
    });

    it("returns null when nothing configured", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      await loadConfig();
      expect(getVault()).toBeNull();
    });
  });

  describe("setVault", () => {
    it("updates in-memory state immediately", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);
      await loadConfig();
      await setVault("NewVault");
      expect(getVault()).toBe("NewVault");
    });

    it("writes config to file", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockWriteFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);
      await loadConfig();
      await setVault("NewVault");
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining("config.json"),
        expect.stringContaining('"NewVault"'),
        "utf-8"
      );
    });
  });
});
