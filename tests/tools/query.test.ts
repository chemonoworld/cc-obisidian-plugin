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
  listFiles,
  listLinks,
  findDeadends,
  findUnresolved,
  listTasks,
  dataviewQuery,
} = await import("../../src/tools/query.js");

describe("Query tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listFiles", () => {
    it("returns JSON-formatted file list on success", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '["a.md","b.md"]',
        data: ["a.md", "b.md"],
        error: null,
      });
      const res = await listFiles({});
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual(["a.md", "b.md"]);
    });

    it("passes folder and ext params correctly", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await listFiles({ folder: "notes", ext: "md" });
      expect(mockExec).toHaveBeenCalledWith(
        "files",
        { folder: "notes", ext: "md" },
        { vault: "TestVault" },
      );
    });

    it("omits undefined optional params", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await listFiles({});
      expect(mockExec).toHaveBeenCalledWith(
        "files",
        {},
        { vault: "TestVault" },
      );
    });

    it("returns error on failure", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "No files found",
      });
      const res = await listFiles({});
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toBe("No files found");
    });
  });

  describe("listLinks", () => {
    it("returns links for a file", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '[{"target":"b.md"}]',
        data: [{ target: "b.md" }],
        error: null,
      });
      const res = await listLinks({ file: "a.md" });
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual([{ target: "b.md" }]);
    });

    it("passes file param correctly", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await listLinks({ file: "note.md" });
      expect(mockExec).toHaveBeenCalledWith(
        "links",
        { file: "note.md" },
        { vault: "TestVault" },
      );
    });
  });

  describe("findDeadends", () => {
    it("returns deadend notes", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '["dead.md"]',
        data: ["dead.md"],
        error: null,
      });
      const res = await findDeadends();
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual(["dead.md"]);
    });

    it("returns error on failure", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "Cannot access vault",
      });
      const res = await findDeadends();
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toBe("Cannot access vault");
    });
  });

  describe("findUnresolved", () => {
    it("returns unresolved links", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '["missing.md"]',
        data: ["missing.md"],
        error: null,
      });
      const res = await findUnresolved();
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual(["missing.md"]);
    });

    it("returns error on failure", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "Unknown error",
      });
      const res = await findUnresolved();
      expect(res.isError).toBe(true);
    });
  });

  describe("listTasks", () => {
    it("returns tasks with no filters", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '[{"text":"Buy milk","done":false}]',
        data: [{ text: "Buy milk", done: false }],
        error: null,
      });
      const res = await listTasks({});
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual([
        { text: "Buy milk", done: false },
      ]);
      expect(mockExec).toHaveBeenCalledWith(
        "tasks",
        {},
        { vault: "TestVault" },
      );
    });

    it("passes file, status, done, and todo params", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await listTasks({ file: "todo.md", status: "x", done: true, todo: false });
      expect(mockExec).toHaveBeenCalledWith(
        "tasks",
        { file: "todo.md", status: "x", done: true, todo: false },
        { vault: "TestVault" },
      );
    });
  });

  describe("dataviewQuery", () => {
    it("constructs correct eval template and returns result", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: '{"headers":["File"],"values":[]}',
        data: { headers: ["File"], values: [] },
        error: null,
      });
      const res = await dataviewQuery({ query: "TABLE file.name FROM #tag" });
      expect(res.isError).toBe(false);
      expect(JSON.parse(res.content[0].text)).toEqual({
        headers: ["File"],
        values: [],
      });
    });

    it("embeds query via JSON.stringify in the eval code", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "{}",
        data: {},
        error: null,
      });
      await dataviewQuery({ query: "LIST FROM #work" });
      const calledCode = (mockExec.mock.calls[0][1] as { code: string }).code;
      expect(calledCode).toContain('dv.query("LIST FROM #work")');
      expect(calledCode).toContain("Dataview plugin is not installed or enabled");
      expect(calledCode).toContain("result.value");
    });

    it("calls execObsidian with eval command", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "ok",
        data: null,
        error: null,
      });
      await dataviewQuery({ query: "LIST" });
      expect(mockExec).toHaveBeenCalledWith(
        "eval",
        expect.objectContaining({ code: expect.any(String) }),
        { vault: "TestVault" },
      );
    });

    it("handles Dataview unavailable error", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "Dataview plugin is not installed or enabled",
      });
      const res = await dataviewQuery({ query: "LIST" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("Dataview");
    });

    it("correctly escapes quotes in DQL query", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await dataviewQuery({ query: 'TABLE file.name WHERE status = "done"' });
      const calledCode = (mockExec.mock.calls[0][1] as { code: string }).code;
      // JSON.stringify wraps the query in quotes and escapes inner quotes
      expect(calledCode).toContain(
        'dv.query("TABLE file.name WHERE status = \\"done\\"")',
      );
    });

    it("correctly escapes backticks in DQL query", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await dataviewQuery({ query: "LIST WHERE file.name = `test`" });
      const calledCode = (mockExec.mock.calls[0][1] as { code: string }).code;
      expect(calledCode).toContain("LIST WHERE file.name = `test`");
    });

    it("correctly escapes backslashes in DQL query", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await dataviewQuery({ query: "LIST FROM \"folder\\subfolder\"" });
      const calledCode = (mockExec.mock.calls[0][1] as { code: string }).code;
      // JSON.stringify escapes backslashes
      expect(calledCode).toContain("folder\\\\subfolder");
    });

    it("correctly handles unicode in DQL query", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "[]",
        data: [],
        error: null,
      });
      await dataviewQuery({ query: "LIST FROM #日本語" });
      const calledCode = (mockExec.mock.calls[0][1] as { code: string }).code;
      expect(calledCode).toContain("#日本語");
    });
  });
});
