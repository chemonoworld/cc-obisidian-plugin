---
id: task-eval-query-replace-001-04
stage: plan
feature: eval-query-replace
title: "Update test assertions"
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

# Subtask 04: Update test assertions

## Description

Update existing test files to reflect the new tool registry (eval_query removed, 6 query tools added) and remove the `evalQuery` test block from `search.test.ts`.

## Scope

- **Includes**: Updating tool count and name assertions in `tools.test.ts`, removing `evalQuery` describe block from `search.test.ts`
- **Excludes**: Creating new query handler tests (already done in subtask 01)

## Dependencies

- Subtask 02 (wire-registry-and-remove-eval) must be complete — the tools array must already have the new entries.

## Acceptance Criteria

- [ ] `tools.test.ts`: tool count assertion changed from `20` to `25` (remove 1 eval_query + add 6 query tools = net +5)
- [ ] `tools.test.ts`: `eval_query` assertion removed from "contains expected search tools" test
- [ ] `tools.test.ts`: 6 new query tool assertions added (new test block or added to existing)
- [ ] `search.test.ts`: `evalQuery` describe block removed (lines 130–end of evalQuery tests)
- [ ] `search.test.ts`: `evalQuery` import removed
- [ ] All tests pass (`npx vitest run`)

## Files to Create/Modify

| Action | Path | Description |
|--------|------|-------------|
| modify | `tests/tools.test.ts` | Update count 20→25, remove eval_query assertion, add 6 query tool assertions |
| modify | `tests/tools/search.test.ts` | Remove evalQuery describe block and import |

## Implementation Notes

- In `tools.test.ts` line 19: change `toBe(20)` to `toBe(25)`
- In `tools.test.ts` line 58: remove `expect(names).toContain("eval_query")`
- Add a new `it("contains expected query tools", ...)` block with assertions for: `list_files`, `list_links`, `find_deadends`, `find_unresolved`, `list_tasks`, `dataview_query`
- In `search.test.ts`: the `evalQuery` describe block starts at line 130 — remove the entire block and the `evalQuery` destructured import at the top of the file
- The guardrail mock in `search.test.ts` (if any) should also be removed
