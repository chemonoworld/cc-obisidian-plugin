import { describe, it, expect } from "vitest";

const {
  _insertLinks: insertLinks,
  _splitByProtectedRegions: splitByProtectedRegions,
} = await import("../../src/tools/auto-link.js");

describe("auto-link", () => {
  describe("splitByProtectedRegions", () => {
    it("marks frontmatter as protected", () => {
      const content = "---\ntitle: Test\n---\nHello world";
      const segments = splitByProtectedRegions(content);
      expect(segments[0].protected).toBe(true);
      expect(segments[0].text).toContain("title: Test");
      expect(segments[1].protected).toBe(false);
      expect(segments[1].text).toBe("Hello world");
    });

    it("marks fenced code blocks as protected", () => {
      const content = "Before\n```js\nconst x = 1;\n```\nAfter";
      const segments = splitByProtectedRegions(content);
      const codeBlock = segments.find((s) => s.text.includes("const x"));
      expect(codeBlock?.protected).toBe(true);
    });

    it("marks inline code as protected", () => {
      const content = "Use `MyNote` in code";
      const segments = splitByProtectedRegions(content);
      const inlineCode = segments.find((s) => s.text === "`MyNote`");
      expect(inlineCode?.protected).toBe(true);
    });

    it("marks existing wiki links as protected", () => {
      const content = "See [[MyNote]] for details";
      const segments = splitByProtectedRegions(content);
      const link = segments.find((s) => s.text === "[[MyNote]]");
      expect(link?.protected).toBe(true);
    });

    it("marks markdown links as protected", () => {
      const content = "See [MyNote](http://example.com) here";
      const segments = splitByProtectedRegions(content);
      const link = segments.find((s) => s.text.includes("]("));
      expect(link?.protected).toBe(true);
    });

    it("marks URLs as protected", () => {
      const content = "Visit https://example.com/api for details";
      const segments = splitByProtectedRegions(content);
      const url = segments.find((s) => s.text.includes("https://"));
      expect(url?.protected).toBe(true);
    });
  });

  describe("insertLinks", () => {
    it("links note name mentions", () => {
      const result = insertLinks(
        "I was reading about TypeScript today",
        ["TypeScript", "JavaScript"],
        "MyNote",
      );
      expect(result.content).toBe("I was reading about [[TypeScript]] today");
      expect(result.additions).toEqual([{ name: "TypeScript", count: 1 }]);
    });

    it("does not link self", () => {
      const result = insertLinks(
        "This note is about MyNote topics",
        ["MyNote", "Other"],
        "MyNote",
      );
      expect(result.content).not.toContain("[[MyNote]]");
    });

    it("does not double-link existing wiki links", () => {
      const result = insertLinks(
        "See [[TypeScript]] for details about TypeScript",
        ["TypeScript"],
        "MyNote",
      );
      // First occurrence is already linked (protected), second gets linked
      expect(result.content).toBe(
        "See [[TypeScript]] for details about [[TypeScript]]",
      );
      expect(result.additions).toEqual([{ name: "TypeScript", count: 1 }]);
    });

    it("skips names shorter than 2 characters", () => {
      const result = insertLinks("Use A and B here", ["A", "B"], "MyNote");
      expect(result.content).toBe("Use A and B here");
      expect(result.additions).toEqual([]);
    });

    it("handles multiple occurrences", () => {
      const result = insertLinks(
        "React is great. I love React.",
        ["React"],
        "MyNote",
      );
      expect(result.content).toBe("[[React]] is great. I love [[React]].");
      expect(result.additions).toEqual([{ name: "React", count: 2 }]);
    });

    it("prefers longer matches (no partial linking)", () => {
      const result = insertLinks(
        "Learn about Machine Learning today",
        ["Machine Learning", "Machine"],
        "MyNote",
      );
      expect(result.content).toBe("Learn about [[Machine Learning]] today");
      expect(result.additions).toEqual([
        { name: "Machine Learning", count: 1 },
      ]);
    });

    it("skips frontmatter", () => {
      const result = insertLinks(
        "---\ntitle: React Guide\n---\nReact is great",
        ["React"],
        "MyNote",
      );
      expect(result.content).toBe(
        "---\ntitle: React Guide\n---\n[[React]] is great",
      );
    });

    it("skips code blocks", () => {
      const result = insertLinks(
        "Use React.\n```\nimport React from 'react';\n```\nReact is great.",
        ["React"],
        "MyNote",
      );
      expect(result.content).toContain("Use [[React]].");
      expect(result.content).toContain("import React from");
      expect(result.content).not.toContain("import [[React]]");
    });

    it("handles Korean note names with proper boundaries", () => {
      const result = insertLinks(
        "오늘 데이터 분석을 했다",
        ["데이터"],
        "일기",
      );
      expect(result.content).toBe("오늘 [[데이터]] 분석을 했다");
    });

    it("does not link Korean names inside compound words", () => {
      const result = insertLinks(
        "빅데이터분석을 공부했다",
        ["데이터"],
        "일기",
      );
      // "데이터" is inside "빅데이터분석" — should NOT be linked
      expect(result.content).toBe("빅데이터분석을 공부했다");
    });

    it("returns empty additions when nothing to link", () => {
      const result = insertLinks(
        "Nothing matches here",
        ["Unrelated"],
        "MyNote",
      );
      expect(result.additions).toEqual([]);
      expect(result.content).toBe("Nothing matches here");
    });

    it("handles special regex characters in note names", () => {
      const result = insertLinks(
        "Learning C++ is fun",
        ["C++"],
        "MyNote",
      );
      expect(result.content).toBe("Learning [[C++]] is fun");
    });
  });
});
