import { describe, it, expect, vi, beforeEach } from "vitest";

// The source uses promisify(execFile). To properly mock this, we need to mock
// execFile with a callback-style function that promisify can wrap.
vi.mock("node:child_process", () => {
  // Create a proper callback-style execFile mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execFileMock: any = vi.fn(
    (_cmd: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, "", "");
    },
  );
  return { execFile: execFileMock };
});

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// We need to re-import change.ts after mocks are set up.
// But since change.ts captures promisify(execFile) at module load,
// we need the mock to be ready when the module loads.
const childProcess = await import("node:child_process");
const fsPromises = await import("node:fs/promises");
const mockExecFile = vi.mocked(childProcess.execFile) as unknown as ReturnType<typeof vi.fn>;
const mockReaddir = vi.mocked(fsPromises.readdir);
const mockReadFile = vi.mocked(fsPromises.readFile);
const mockWriteFile = vi.mocked(fsPromises.writeFile) as unknown as ReturnType<typeof vi.fn>;

const { detectChanges } = await import("../../src/embeddings/change.js");

function setupGitRepo(options: {
  diffOutput?: string;
  statusOutput?: string;
  head?: string;
} = {}) {
  const { diffOutput = "", statusOutput = "", head = "abc123" } = options;

  // Mock readFile for .gitignore (ensureGitignore reads it)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockReadFile.mockImplementation(async (path: any) => {
    const pathStr = String(path);
    if (pathStr.endsWith(".gitignore")) {
      // Return content with marker so ensureGitignore is a no-op
      return "# cc-plugin: semantic search (auto-generated)" as never;
    }
    throw new Error(`File not found: ${pathStr}`);
  });

  mockWriteFile.mockResolvedValue(undefined);

  mockExecFile.mockImplementation(
    (_cmd: string, args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (args.includes("--is-inside-work-tree")) {
        callback(null, "true\n", "");
      } else if (args.includes("HEAD") && args.includes("rev-parse")) {
        callback(null, `${head}\n`, "");
      } else if (args.includes("diff")) {
        callback(null, diffOutput, "");
      } else if (args.includes("status")) {
        callback(null, statusOutput, "");
      } else {
        callback(null, "", "");
      }
    },
  );
}

function setupNonGitVault(files: Map<string, string>) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
      callback(new Error("not a git repo"), "", "");
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockReaddir.mockImplementation(async (dir: any) => {
    const dirStr = String(dir);
    const prefix = dirStr.endsWith("/") ? dirStr : dirStr + "/";
    const entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    const seen = new Set<string>();

    for (const path of files.keys()) {
      const fullPath = `/vault/${path}`;
      if (fullPath.startsWith(prefix)) {
        const rest = fullPath.slice(prefix.length);
        const parts = rest.split("/");
        const name = parts[0];
        if (seen.has(name)) continue;
        seen.add(name);

        if (parts.length === 1) {
          entries.push({ name, isDirectory: () => false, isFile: () => true });
        } else {
          entries.push({ name, isDirectory: () => true, isFile: () => false });
        }
      }
    }

    return entries as never;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockReadFile.mockImplementation(async (path: any) => {
    const pathStr = String(path);
    const relPath = pathStr.replace("/vault/", "");
    const content = files.get(relPath);
    if (content !== undefined) return Buffer.from(content) as never;
    throw new Error(`File not found: ${pathStr}`);
  });
}

describe("detectChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("git-based detection", () => {
    it("detects modified files via git diff", async () => {
      setupGitRepo({
        diffOutput: "M\tnotes/test.md\nA\tnotes/new.md\n",
        statusOutput: "",
      });

      const result = await detectChanges("/vault", [], "prev-commit");

      expect(result.toAdd).toContain("notes/test.md");
      expect(result.toAdd).toContain("notes/new.md");
      expect(result.currentCommit).toBe("abc123");
    });

    it("detects deleted files via git diff", async () => {
      setupGitRepo({
        diffOutput: "D\told-note.md\n",
        statusOutput: "",
      });

      const result = await detectChanges("/vault", [], "prev-commit");

      expect(result.toDelete).toContain("old-note.md");
    });

    it("detects untracked files via git status", async () => {
      setupGitRepo({
        statusOutput: "?? untracked.md\n",
      });

      const result = await detectChanges("/vault", [], null);

      expect(result.toAdd).toContain("untracked.md");
    });

    it("handles renamed files", async () => {
      setupGitRepo({
        diffOutput: "R100\told-name.md\tnew-name.md\n",
        statusOutput: "",
      });

      const result = await detectChanges("/vault", [], "prev-commit");

      expect(result.toAdd).toContain("new-name.md");
      expect(result.toDelete).toContain("old-name.md");
    });
  });

  describe("hash-based fallback", () => {
    it("detects new files not in index", async () => {
      setupNonGitVault(new Map([
        ["note1.md", "content1"],
        ["note2.md", "content2"],
      ]));

      const result = await detectChanges("/vault", [], null);

      expect(result.toAdd).toContain("note1.md");
      expect(result.toAdd).toContain("note2.md");
      expect(result.currentCommit).toBeNull();
    });

    it("detects deleted files in index but not on disk", async () => {
      setupNonGitVault(new Map());

      const result = await detectChanges(
        "/vault",
        [{ file_path: "gone.md", content_hash: "abc" }],
        null,
      );

      expect(result.toDelete).toContain("gone.md");
    });
  });

  it("returns empty changeset when everything fails", async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error("fail"), "", "");
      },
    );
    mockReaddir.mockRejectedValue(new Error("fail"));

    const result = await detectChanges("/vault", [], null);

    expect(result.toAdd).toEqual([]);
    expect(result.toDelete).toEqual([]);
    expect(result.currentCommit).toBeNull();
  });
});
