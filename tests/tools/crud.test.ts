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
  readNote,
  createNote,
  updateNote,
  deleteNote,
  moveNote,
  setProperty,
  removeProperty,
  dailyNote,
} = await import("../../src/tools/crud.js");

describe("CRUD tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readNote", () => {
    it("returns note content on success", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "# Hello\nWorld",
        data: null,
        error: null,
      });
      const res = await readNote({ file: "My Note" });
      expect(res.isError).toBe(false);
      expect(res.content[0].text).toBe("# Hello\nWorld");
    });

    it("returns error when note not found", async () => {
      mockExec.mockResolvedValue({
        success: false,
        raw: "",
        data: null,
        error: "Error: Note not found",
      });
      const res = await readNote({ file: "Missing" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("Error:");
    });

    it("passes vault from config", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "content",
        data: null,
        error: null,
      });
      await readNote({ file: "Note" });
      expect(mockExec).toHaveBeenCalledWith(
        "read",
        { file: "Note" },
        { vault: "TestVault" },
      );
    });
  });

  describe("createNote", () => {
    it("creates a note with content", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "Created",
        data: null,
        error: null,
      });
      const res = await createNote({ name: "New", content: "# Title" });
      expect(res.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        "create",
        { name: "New", content: "# Title" },
        { vault: "TestVault" },
      );
    });

    it("passes overwrite flag", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await createNote({ name: "Note", overwrite: true });
      expect(mockExec).toHaveBeenCalledWith(
        "create",
        { name: "Note", overwrite: true },
        { vault: "TestVault" },
      );
    });

    it("uses path param when name contains /", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await createNote({ name: "folder/subfolder/My Note", content: "hi" });
      expect(mockExec).toHaveBeenCalledWith(
        "create",
        { path: "folder/subfolder/My Note.md", content: "hi" },
        { vault: "TestVault" },
      );
    });

    it("does not double .md extension", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await createNote({ name: "folder/Note.md" });
      expect(mockExec).toHaveBeenCalledWith(
        "create",
        { path: "folder/Note.md" },
        { vault: "TestVault" },
      );
    });
  });

  describe("updateNote", () => {
    it("appends by default", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await updateNote({ file: "Note", content: "new text" });
      expect(mockExec).toHaveBeenCalledWith(
        "append",
        { file: "Note", content: "new text" },
        { vault: "TestVault" },
      );
    });

    it("prepends when mode is prepend", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await updateNote({ file: "Note", content: "top", mode: "prepend" });
      expect(mockExec).toHaveBeenCalledWith(
        "prepend",
        { file: "Note", content: "top" },
        { vault: "TestVault" },
      );
    });
  });

  describe("deleteNote", () => {
    it("deletes to trash by default", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await deleteNote({ file: "Note" });
      expect(mockExec).toHaveBeenCalledWith(
        "delete",
        { file: "Note" },
        { vault: "TestVault" },
      );
    });

    it("passes permanent flag", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await deleteNote({ file: "Note", permanent: true });
      expect(mockExec).toHaveBeenCalledWith(
        "delete",
        { file: "Note", permanent: true },
        { vault: "TestVault" },
      );
    });
  });

  describe("moveNote", () => {
    it("moves a note", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await moveNote({ file: "Old", to: "New" });
      expect(mockExec).toHaveBeenCalledWith(
        "move",
        { file: "Old", to: "New" },
        { vault: "TestVault" },
      );
    });
  });

  describe("setProperty", () => {
    it("sets a property", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await setProperty({ file: "Note", name: "status", value: "done" });
      expect(mockExec).toHaveBeenCalledWith(
        "property:set",
        { file: "Note", name: "status", value: "done" },
        { vault: "TestVault" },
      );
    });
  });

  describe("removeProperty", () => {
    it("removes a property", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await removeProperty({ file: "Note", name: "status" });
      expect(mockExec).toHaveBeenCalledWith(
        "property:remove",
        { file: "Note", name: "status" },
        { vault: "TestVault" },
      );
    });
  });

  describe("dailyNote", () => {
    it("reads daily note by default", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "# Today",
        data: null,
        error: null,
      });
      const res = await dailyNote({});
      expect(res.isError).toBe(false);
      expect(mockExec).toHaveBeenCalledWith(
        "daily:read",
        {},
        { vault: "TestVault" },
      );
    });

    it("appends to daily note", async () => {
      mockExec.mockResolvedValue({
        success: true,
        raw: "",
        data: null,
        error: null,
      });
      await dailyNote({ action: "append", content: "- task" });
      expect(mockExec).toHaveBeenCalledWith(
        "daily:append",
        { content: "- task" },
        { vault: "TestVault" },
      );
    });

    it("returns error when append has no content", async () => {
      const res = await dailyNote({ action: "append" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("content is required");
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});
