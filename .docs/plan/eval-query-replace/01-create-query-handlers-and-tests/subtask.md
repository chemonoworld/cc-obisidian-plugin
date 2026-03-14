---
id: task-eval-query-replace-001-01
stage: plan
feature: eval-query-replace
title: "Create query handlers and tests"
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

# Subtask 01: Create query handlers and tests

## Description

Create `src/tools/query.ts` with six handler functions that wrap Obsidian CLI commands for vault queries, and `tests/tools/query.test.ts` with comprehensive tests. This is the core implementation subtask — all six handlers follow the same `execObsidian → ok/fail` pattern used in existing handler modules (`crud.ts`, `search.ts`, `vault.ts`). The `dataviewQuery` handler uses a fixed JavaScript template with `JSON.stringify` to safely embed DQL strings, as specified in [@arch-eval-query-replace-001] and [@ADR-011].

## Scope

- **Includes**: `query.ts` module with 6 exported handler functions, JSDoc module comment, comprehensive unit tests
- **Excludes**: Tool registry wiring (subtask 02), guardrail deletion (subtask 03), test assertion updates (subtask 04)

## Dependencies

None — this subtask can begin immediately.

## Acceptance Criteria

- [ ] `query.ts` exports 6 functions: `listFiles`, `listLinks`, `findDeadends`, `findUnresolved`, `listTasks`, `dataviewQuery`
- [ ] Each handler calls `execObsidian(command, params, { vault: vault() })`
- [ ] Each handler returns `ok(JSON.stringify(data))` on success, `fail(error)` on failure
- [ ] `dataviewQuery` builds fixed JS template using `JSON.stringify(args.query)`
- [ ] JSDoc module comment explains query vs search domain boundary
- [ ] Tests mock `execObsidian`, verify success/error/param paths per handler
- [ ] DQL edge case tests: queries with quotes, backticks, backslashes, unicode, newlines
- [ ] All tests pass

## Files to Create/Modify

| Action | Path | Description |
|--------|------|-------------|
| create | `src/tools/query.ts` | 6 query handler functions + JSDoc module comment |
| create | `tests/tools/query.test.ts` | Unit tests for all 6 handlers, including DQL edge cases |

## Implementation Notes

- Follow the exact same pattern as `src/tools/search.ts`: import `execObsidian` from `../cli.js`, import `ok`, `fail`, `vault` from `./helpers.js`
- Each handler is 5–8 lines — no shared wrapper or abstraction needed
- CLI command mapping:
  - `listFiles` → `"files"` command, params: `{ folder?, ext? }`
  - `listLinks` → `"links"` command, params: `{ file }`
  - `findDeadends` → `"deadends"` command, no params
  - `findUnresolved` → `"unresolved"` command, no params
  - `listTasks` → `"tasks"` command, params: `{ file?, status?, done?, todo? }`
  - `dataviewQuery` → `"eval"` command, params: `{ code }` where code is the fixed template
- The fixed template for `dataviewQuery`:
  ```typescript
  const code = `return JSON.stringify(await app.plugins.plugins.dataview?.api?.query(${JSON.stringify(args.query)}))`
  ```
- Test file should mock `../cli.js` with `vi.mock()`, same pattern as `tests/tools/search.test.ts`
- For DQL edge cases, verify the generated `code` string contains the correctly escaped query
