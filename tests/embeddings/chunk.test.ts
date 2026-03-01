import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../../src/embeddings/chunk.js";

describe("chunkMarkdown", () => {
  it("returns empty array for empty content", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   ")).toEqual([]);
  });

  it("strips frontmatter", () => {
    const content = `---
title: Test
tags: [a, b]
---

Hello world`;
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Hello world");
    expect(chunks[0].content).not.toContain("---");
  });

  it("splits on H2 headings", () => {
    const content = `Some intro text

## Section One

Content of section one.

## Section Two

Content of section two.`;
    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    const headings = chunks.map((c) => c.heading);
    expect(headings[0]).toBeNull(); // intro text has no heading
    expect(headings).toContain("Section One");
    expect(headings).toContain("Section Two");
  });

  it("splits on H3 headings with hierarchy", () => {
    const content = `## Main Section

Intro

### Subsection A

Content A

### Subsection B

Content B`;
    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Subsection should have hierarchy: "Main Section > Subsection A"
    const subA = chunks.find((c) => c.content.includes("Content A"));
    expect(subA).toBeDefined();
    expect(subA!.heading).toBe("Main Section > Subsection A");
  });

  it("normalizes wiki-links", () => {
    const content = `Check out [[My Note]] and [[Other Note|display text]]`;
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("My Note");
    expect(chunks[0].content).toContain("display text");
    expect(chunks[0].content).not.toContain("[[");
  });

  it("preserves inline tags", () => {
    const content = `This note has #tag1 and #another-tag`;
    const chunks = chunkMarkdown(content);
    expect(chunks[0].content).toContain("#tag1");
    expect(chunks[0].content).toContain("#another-tag");
  });

  it("assigns sequential indices starting at 0", () => {
    const content = `## A

Text A

## B

Text B

## C

Text C`;
    const chunks = chunkMarkdown(content);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("falls back to paragraph splits for oversized sections", () => {
    // Create a section with many paragraphs that exceed maxTokens
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i} with enough words to count as content.`,
    );
    const content = `## Big Section\n\n${paragraphs.join("\n\n")}`;

    const chunks = chunkMarkdown(content, { maxTokens: 30 });
    expect(chunks.length).toBeGreaterThan(1);

    // All chunks should reference the same heading
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Big Section");
    }
  });

  it("handles content with only frontmatter", () => {
    const content = `---
title: Empty
---`;
    const chunks = chunkMarkdown(content);
    expect(chunks).toEqual([]);
  });

  it("handles content with no headings as single chunk", () => {
    const content = "Just a simple paragraph of text.";
    const chunks = chunkMarkdown(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBeNull();
    expect(chunks[0].index).toBe(0);
  });
});
