import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/cli.js", () => ({
  execObsidian: vi.fn(),
}));
vi.mock("../src/config.js", () => ({
  getVault: vi.fn(() => null),
  setVault: vi.fn(),
}));

const { getAllTools, handleToolCall } = await import("../src/tools.js");

describe("Tool Registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has 20 tools registered", () => {
    expect(getAllTools().length).toBe(20);
  });

  it("has unique tool names", () => {
    const names = getAllTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all tools have descriptions", () => {
    for (const tool of getAllTools()) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("returns error for unknown tool", async () => {
    const res = await handleToolCall("nonexistent", {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown tool");
  });

  it("contains expected CRUD tools", () => {
    const names = getAllTools().map((t) => t.name);
    expect(names).toContain("read_note");
    expect(names).toContain("create_note");
    expect(names).toContain("update_note");
    expect(names).toContain("delete_note");
    expect(names).toContain("move_note");
    expect(names).toContain("set_property");
    expect(names).toContain("remove_property");
    expect(names).toContain("daily_note");
  });

  it("contains expected search tools", () => {
    const names = getAllTools().map((t) => t.name);
    expect(names).toContain("search_notes");
    expect(names).toContain("list_tags");
    expect(names).toContain("list_properties");
    expect(names).toContain("get_backlinks");
    expect(names).toContain("find_orphans");
    expect(names).toContain("eval_query");
  });

  it("contains expected vault tools", () => {
    const names = getAllTools().map((t) => t.name);
    expect(names).toContain("set_vault");
    expect(names).toContain("list_vaults");
    expect(names).toContain("vault_info");
  });
});
