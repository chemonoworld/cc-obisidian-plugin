import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedCliResult } from "../src/types.js";

// Mock child_process before importing cli module
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Import after mock setup
const { buildArgv, cleanOutput, detectError, tryParseJson, execObsidian } =
  await import("../src/cli.js");
const { execFile } = await import("node:child_process");

const mockExecFile = vi.mocked(execFile);

describe("buildArgv", () => {
  it("prepends vault when provided", () => {
    const args = buildArgv("read", { file: "My Note" }, "MyVault");
    expect(args[0]).toBe("vault=MyVault");
    expect(args[1]).toBe("read");
  });

  it("omits vault when null", () => {
    const args = buildArgv("read", { file: "Note" }, null);
    expect(args[0]).toBe("read");
    expect(args).not.toContain("vault=");
  });

  it("omits vault when undefined", () => {
    const args = buildArgv("read", { file: "Note" });
    expect(args[0]).toBe("read");
  });

  it("converts boolean true to bare flag", () => {
    const args = buildArgv("delete", { file: "Note", permanent: true });
    expect(args).toContain("permanent");
    expect(args).not.toContain("permanent=true");
  });

  it("skips boolean false params", () => {
    const args = buildArgv("create", { name: "Note", overwrite: false });
    expect(args).not.toContain("overwrite");
    expect(args).not.toContain("overwrite=false");
  });

  it("handles string params with key=value format", () => {
    const args = buildArgv("search", { query: "tag:#work", format: "json" });
    expect(args).toContain("query=tag:#work");
    expect(args).toContain("format=json");
  });

  it("handles colon commands", () => {
    const args = buildArgv("property:set", { name: "status", value: "done" });
    expect(args[0]).toBe("property:set");
  });
});

describe("cleanOutput", () => {
  it("trims whitespace", () => {
    expect(cleanOutput("  hello world  \n")).toBe("hello world");
  });

  it("strips ANSI escape codes", () => {
    expect(cleanOutput("\x1b[32mgreen text\x1b[0m")).toBe("green text");
  });

  it("handles empty string", () => {
    expect(cleanOutput("")).toBe("");
  });
});

describe("detectError", () => {
  it("detects Error: prefix", () => {
    expect(detectError("Error: Note not found")).not.toBeNull();
  });

  it("detects No * found pattern", () => {
    expect(detectError("No notes found matching query")).not.toBeNull();
  });

  it("detects Cannot prefix", () => {
    expect(detectError("Cannot open vault")).not.toBeNull();
  });

  it("returns null for valid content", () => {
    expect(detectError("# My Note\nsome content")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectError("")).toBeNull();
  });
});

describe("tryParseJson", () => {
  it("parses valid JSON array", () => {
    const result = tryParseJson('[{"file":"a.md"}]');
    expect(result).toEqual([{ file: "a.md" }]);
  });

  it("parses valid JSON object", () => {
    const result = tryParseJson('{"name":"test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("returns null for non-JSON", () => {
    expect(tryParseJson("plain text output")).toBeNull();
  });

  it("strips debug line before JSON", () => {
    const result = tryParseJson(
      '2026-02-28 Loading updated app\n[{"file":"a.md"}]'
    );
    expect(result).toEqual([{ file: "a.md" }]);
  });

  it("strips multiple debug lines before JSON", () => {
    const result = tryParseJson(
      'line 1 debug\nline 2 debug\n[{"file":"a.md"}]'
    );
    expect(result).toEqual([{ file: "a.md" }]);
  });
});

describe("execObsidian", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for valid stdout", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, '{"ok":true}', "");
        return undefined as any;
      }
    );

    const result = await execObsidian("vault", { info: "name" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ok: true });
    expect(result.error).toBeNull();
  });

  it("returns error when stdout contains error pattern", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "Error: vault not found", "");
        return undefined as any;
      }
    );

    const result = await execObsidian("read", { file: "NonExistent" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Error:");
  });

  it("returns error on spawn failure", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error("ENOENT: obsidian not found"), "", "");
        return undefined as any;
      }
    );

    const result = await execObsidian("read", { file: "Test" });
    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it("passes vault option to buildArgv", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, args: any, _opts: any, cb: any) => {
        cb(null, "ok", "");
        return undefined as any;
      }
    );

    await execObsidian("read", { file: "Note" }, { vault: "MyVault" });
    const calledArgs = mockExecFile.mock.calls[0][1] as string[];
    expect(calledArgs[0]).toBe("vault=MyVault");
  });
});
