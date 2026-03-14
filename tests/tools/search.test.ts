import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/cli.js", () => ({
  execObsidian: vi.fn(),
}));
vi.mock("../../src/config.js", () => ({
  getVault: vi.fn(() => "TestVault"),
}));

const { execObsidian } = await import("../../src/cli.js");
const mockExec = vi.mocked(execObsidian);

const {
  searchNotes,
  listTags,
  listProperties,
  getBacklinks,
  findOrphans,
  evalQuery,
} = await import("../../src/tools/search.js");

describe("Search tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchNotes", () => {
    it("returns JSON-formatted results on success", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '[{"file":"a.md"}]',
        data: [{ file: "a.md" }],
        error: null,
      });
      const res = await searchNotes({ query: "tag:#work" });
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual([{ file: "a.md" }]);
    });

    it("passes format=json by default", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await searchNotes({ query: "test" });
      expect(mockExec).toHaveBeenCalledWith(
        "search",
        { query: "test", format: "json" },
        { vault: "TestVault" },
      );
    });

    it("returns error on failure", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "No notes found matching query",
      });
      const res = await searchNotes({ query: "nonexistent" });
      expect(res.isError).toBe(true);
    });
  });

  describe("listTags", () => {
    it("returns tags with counts", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '{"work":5}',
        data: { work: 5 },
        error: null,
      });
      const res = await listTags();
      expect(res.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        "tags",
        { all: true, counts: true, format: "json" },
        { vault: "TestVault" },
      );
    });
  });

  describe("listProperties", () => {
    it("returns TSV properties", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "name\ttype\nstatus\ttext",
        data: null,
        error: null,
      });
      const res = await listProperties();
      expect(res.isError).toBe(false);
      expect(res.content[0].text).toContain("status");
    });
  });

  describe("getBacklinks", () => {
    it("returns backlinks for a file", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '[{"file":"b.md"}]',
        data: [{ file: "b.md" }],
        error: null,
      });
      const res = await getBacklinks({ file: "a.md" });
      expect(res.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        "backlinks",
        { file: "a.md", format: "json" },
        { vault: "TestVault" },
      );
    });
  });

  describe("findOrphans", () => {
    it("returns orphan notes", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '["orphan.md"]',
        data: ["orphan.md"],
        error: null,
      });
      const res = await findOrphans();
      expect(res.isError).toBe(false);
    });
  });

  describe("evalQuery", () => {
    it("executes eval command for safe code", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "42",
        data: null,
        error: null,
      });
      const res = await evalQuery({ code: "app.vault.getFiles().length" });
      expect(res.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        "eval",
        { code: "app.vault.getFiles().length" },
        { vault: "TestVault" },
      );
    });

    it("returns JSON data when available", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '{"count":42}',
        data: { count: 42 },
        error: null,
      });
      const res = await evalQuery({ code: "app.vault.getFiles()" });
      expect(JSON.parse(res.content[0].text)).toEqual({ count: 42 });
    });

    it("blocks dangerous code via guardrail", async () => {
      const res = await evalQuery({ code: 'require("fs")' });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("guardrail");
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("blocks vault writes by default", async () => {
      const res = await evalQuery({
        code: 'app.vault.create("new.md", "content")',
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("write");
    });

    it("allows vault writes when allow_write=true", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "ok",
        data: null,
        error: null,
      });
      const res = await evalQuery({
        code: 'app.vault.create("new.md", "content")',
        allow_write: true,
      });
      expect(res.isError).toBe(false);
    });
  });
});
