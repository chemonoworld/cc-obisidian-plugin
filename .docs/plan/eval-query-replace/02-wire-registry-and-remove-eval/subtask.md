---
id: task-eval-query-replace-001-02
stage: plan
feature: eval-query-replace
title: "Wire registry and remove eval_query"
created: 2026-03-14
updated: 2026-03-14
tags: [plan, eval-query-replace, subtask]
status: not-started
refs:
  - type: implements
    target: plan-eval-query-replace-001
  - type: based-on
    target: arch-eval-query-replace-001
decisions: []
---

# Subtask 02: Wire registry and remove eval_query

## Description

Integrate the new query handlers into the tool registry (`src/tools.ts`) and remove the `eval_query` tool entry. Also remove `evalQuery` from `src/tools/search.ts` and its guardrail import. This is the integration subtask that connects the new handlers and disconnects the old ones.

## Scope

- **Includes**: Adding 6 tool entries to `tools.ts`, removing `eval_query` entry, removing `evalQuery` function and guardrail import from `search.ts`
- **Excludes**: Creating query handlers (subtask 01), deleting guardrail files (subtask 03), updating test assertions (subtask 04)

## Dependencies

- Subtask 01 (create-query-handlers-and-tests) must be complete — the import target `./tools/query.js` must exist.

## Acceptance Criteria

- [ ] `tools.ts` adds `import * as query from "./tools/query.js"`
- [ ] 6 new tool entries with correct names, descriptions, Zod schemas, handlers
- [ ] `eval_query` entry removed from tools array (lines 139–154)
- [ ] `evalQuery` function removed from `search.ts` (lines 74–98)
- [ ] `import { validateEvalCode } from "../guardrail.js"` removed from `search.ts` (line 3)
- [ ] TypeScript compiles (`npx tsc --noEmit`)

## Files to Create/Modify

| Action | Path | Description |
|--------|------|-------------|
| modify | `src/tools.ts` | Add `import * as query`, add 6 tool entries, remove `eval_query` entry |
| modify | `src/tools/search.ts` | Remove `evalQuery` function, remove guardrail import |

## Implementation Notes

- New tool entries go in a `// --- Query Tools ---` section between Search and Semantic Search sections
- Tool names: `list_files`, `list_links`, `find_deadends`, `find_unresolved`, `list_tasks`, `dataview_query`
- Follow the exact `ToolDef` pattern: `{ name, description, schema, handler }`
- Handler dispatch: `(a) => query.listFiles(a as { ... })` — matching existing style
- Zod schemas:
  - `list_files`: `folder` (string, optional), `ext` (string, optional)
  - `list_links`: `file` (string, required)
  - `find_deadends`: empty `{}`
  - `find_unresolved`: empty `{}`
  - `list_tasks`: `file` (string, optional), `status` (string, optional), `done` (boolean, optional), `todo` (boolean, optional)
  - `dataview_query`: `query` (string, required)
- After removing `evalQuery` from `search.ts`, the only remaining exports should be: `searchNotes`, `listTags`, `listProperties`, `getBacklinks`, `findOrphans`
- The guardrail import in `search.ts` line 3 must be removed — it will cause a compile error once `guardrail.ts` is deleted in subtask 03
