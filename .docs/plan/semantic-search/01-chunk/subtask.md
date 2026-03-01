---
feature: semantic-search
subtask: 01-chunk
size: small
depends-on: []
---

# Markdown Heading-Aware Chunker

## Goal
Create a markdown chunker that splits content into semantically meaningful chunks based on heading boundaries, with fallback to paragraph splitting for oversized sections.

## Files
- `src/embeddings/chunk.ts` — Chunker implementation

## API Contract

```typescript
interface ChunkOptions {
  maxTokens?: number      // default: 512
  overlap?: number        // default: 0
}

interface Chunk {
  content: string
  heading: string | null
  index: number
}

function chunkMarkdown(content: string, options?: ChunkOptions): Chunk[]
```

## Implementation Notes

1. **Strip frontmatter**: Remove YAML frontmatter (between `---` delimiters) before chunking
2. **Split on headings**: Split on `##` (H2) and `###` (H3) heading boundaries
3. **Heading tracking**: Record the nearest heading above each chunk as `heading`
4. **Fallback splitting**: When a section exceeds `maxTokens`, fall back to paragraph splits (`\n\n`), then line splits
5. **Token counting**: Use simple word-count approximation (split on whitespace, multiply by 1.3 for token estimate). No need for a tokenizer library.
6. **Normalize wiki-links**: Convert `[[Note Name]]` → `Note Name` and `[[Note Name|Display]]` → `Display`
7. **Keep inline tags**: Preserve `#tag` as they carry semantic meaning
8. **Empty chunks**: Skip chunks that are empty or whitespace-only after processing
9. **Heading prefix**: Prepend heading hierarchy as context: `"Section > Subsection: [chunk text]"`

## Acceptance Criteria
- [ ] Splits on H2/H3 boundaries correctly
- [ ] Strips frontmatter before chunking
- [ ] Falls back to paragraph splits for oversized sections
- [ ] Records heading context for each chunk
- [ ] Normalizes wiki-links
- [ ] Skips empty chunks
- [ ] Respects maxTokens limit
- [ ] Returns sequential chunk indices starting at 0

## Test Plan
- Basic heading split: content with 3 H2 sections → 3 chunks
- Frontmatter stripping: content with `---` YAML → no frontmatter in chunks
- Oversized section: one large section > maxTokens → split into paragraphs
- Wiki-link normalization: `[[link]]` and `[[link|text]]` handled
- Empty content → empty array
- No headings → single chunk (or paragraph splits if too long)
- Heading hierarchy preserved in chunk.heading
