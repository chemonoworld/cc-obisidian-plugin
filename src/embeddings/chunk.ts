export interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
}

export interface Chunk {
  content: string;
  heading: string | null;
  index: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3);
}

function stripFrontmatter(content: string): string {
  const frontmatterPattern = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
  return content.replace(frontmatterPattern, "");
}

function normalizeWikiLinks(text: string): string {
  // [[Note Name|Display]] → Display
  // [[Note Name]] → Note Name
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1");
}

interface Section {
  heading: string | null;
  content: string;
}

function splitIntoSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];

  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  // Track heading hierarchy: h2Heading and h3Heading
  let h2Heading: string | null = null;
  let h3Heading: string | null = null;

  function flushSection(): void {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      let headingLabel: string | null = null;
      if (h2Heading !== null && h3Heading !== null) {
        headingLabel = `${h2Heading} > ${h3Heading}`;
      } else if (h3Heading !== null) {
        headingLabel = h3Heading;
      } else if (h2Heading !== null) {
        headingLabel = h2Heading;
      }
      sections.push({ heading: headingLabel, content: text });
    }
    currentLines = [];
    currentHeading = null;
  }

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match) {
      flushSection();
      h2Heading = h2Match[1].trim();
      h3Heading = null;
      currentHeading = h2Heading;
    } else if (h3Match) {
      flushSection();
      h3Heading = h3Match[1].trim();
      currentHeading = h3Heading;
    } else {
      currentLines.push(line);
    }
  }

  flushSection();

  return sections;
}

function splitSectionByParagraphs(
  section: Section,
  maxTokens: number
): Section[] {
  const paragraphs = section.content.split(/\n\n+/);
  const result: Section[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;

  function flushParts(): void {
    const text = currentParts.join("\n\n").trim();
    if (text.length > 0) {
      result.push({ heading: section.heading, content: text });
    }
    currentParts = [];
    currentTokens = 0;
  }

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const paragraphTokens = estimateTokens(trimmed);

    if (paragraphTokens > maxTokens) {
      // Paragraph itself too large — fall back to line splits
      if (currentParts.length > 0) {
        flushParts();
      }
      const lineSections = splitByLines(
        { heading: section.heading, content: trimmed },
        maxTokens
      );
      result.push(...lineSections);
    } else if (currentTokens + paragraphTokens > maxTokens) {
      flushParts();
      currentParts.push(trimmed);
      currentTokens = paragraphTokens;
    } else {
      currentParts.push(trimmed);
      currentTokens += paragraphTokens;
    }
  }

  if (currentParts.length > 0) {
    flushParts();
  }

  return result;
}

function splitByLines(section: Section, maxTokens: number): Section[] {
  const lines = section.content.split("\n");
  const result: Section[] = [];
  let currentLines: string[] = [];
  let currentTokens = 0;

  function flushLines(): void {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      result.push({ heading: section.heading, content: text });
    }
    currentLines = [];
    currentTokens = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lineTokens = estimateTokens(trimmed);

    if (currentTokens + lineTokens > maxTokens && currentLines.length > 0) {
      flushLines();
    }

    currentLines.push(trimmed);
    currentTokens += lineTokens;
  }

  if (currentLines.length > 0) {
    flushLines();
  }

  return result;
}

export function chunkMarkdown(content: string, options?: ChunkOptions): Chunk[] {
  const maxTokens = options?.maxTokens ?? 512;

  const stripped = stripFrontmatter(content);
  const normalized = normalizeWikiLinks(stripped);
  const sections = splitIntoSections(normalized);

  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    const tokens = estimateTokens(section.content);

    if (tokens <= maxTokens) {
      chunks.push({ content: section.content, heading: section.heading, index });
      index++;
    } else {
      const subSections = splitSectionByParagraphs(section, maxTokens);
      for (const sub of subSections) {
        if (sub.content.trim().length > 0) {
          chunks.push({ content: sub.content, heading: sub.heading, index });
          index++;
        }
      }
    }
  }

  return chunks;
}
