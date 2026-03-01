---
feature: semantic-search
subtask: 06-tool-integration
size: small
depends-on: [05-facade]
---

# Tool Handler, Config Extension, and Registration

## Goal
Create the MCP tool handler for `semantic_search`, extend the config interface with embedding options, and register the tool in the tool registry.

## Files
- `src/tools/semantic.ts` — Tool handler (NEW)
- `src/config.ts` — Add EmbeddingConfig (MODIFY)
- `src/tools.ts` — Register semantic_search tool (MODIFY)
- `package.json` — Add optionalDependencies (MODIFY)

## API Contract

### semantic.ts
```typescript
function semanticSearchTool(args: {
  query: string
  limit?: number
  reindex?: boolean
}): Promise<ToolResponse>
```

### Config extension
```typescript
interface EmbeddingConfig {
  model?: string      // default: 'Xenova/bge-m3'
  dbPath?: string     // default: <vault>/.obsidian/plugins/cc-plugin/embeddings.db
  enabled: boolean    // must be true to activate
}

// Added to existing Config interface:
interface Config {
  defaultVault: string
  embedding?: EmbeddingConfig  // NEW
}
```

### Tool registration (Zod schema)
```typescript
const semanticSearchSchema = z.object({
  query: z.string().min(1).describe('Natural language search query'),
  limit: z.number().int().min(1).max(50).optional().default(10)
          .describe('Maximum number of results to return'),
  reindex: z.boolean().optional().default(false)
            .describe('Force re-indexing before search'),
})
```

## Implementation Notes

1. **semantic.ts**:
   - Import `initEmbeddingStore`, `semanticSearch`, `isAvailable` from `../embeddings/index.js`
   - Import `ok`, `fail` from `./helpers.js`
   - If `!isAvailable()`, call `initEmbeddingStore()`. If returns false, return `fail("Semantic search is not enabled. Set embedding.enabled: true in config.")`
   - Call `semanticSearch(query, limit, reindex)`
   - Format results as markdown text: file path, heading, score, content snippet
   - Return `ok(formattedText)`
   - Catch errors and return `fail(errorMessage)`

2. **config.ts**:
   - Add `EmbeddingConfig` interface
   - Add `embedding?: EmbeddingConfig` to `Config` interface
   - Export `EmbeddingConfig` type

3. **tools.ts**:
   - Import `semanticSearchTool` from `./tools/semantic.js`
   - Add tool entry to the `tools` array with name, description, schema, handler

4. **package.json**:
   - Add `optionalDependencies` block:
     ```json
     {
       "@huggingface/transformers": "^3.x",
       "better-sqlite3": "^11.0.0",
       "sqlite-vec": "^0.1.x"
     }
     ```

## Acceptance Criteria
- [ ] semantic_search tool registered in tools array
- [ ] Tool has correct Zod schema with query, limit, reindex
- [ ] EmbeddingConfig added to Config interface
- [ ] Tool returns formatted results on success
- [ ] Tool returns helpful error when not enabled
- [ ] Tool returns helpful error on failure
- [ ] package.json has optionalDependencies
- [ ] Follows existing tool pattern (ok/fail helpers)

## Test Plan
- Mock embeddings/index module
- Tool returns error when not enabled
- Tool returns formatted results on success
- Tool handles search errors gracefully
- Config interface accepts embedding field
- Tool schema validates input correctly
