---
id: task-eval-query-replace-001-03
stage: plan
feature: eval-query-replace
title: "Delete guardrail"
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

# Subtask 03: Delete guardrail

## Description

Delete `src/guardrail.ts` and `tests/guardrail.test.ts`. These files have zero remaining consumers after subtask 02 removes the guardrail import from `search.ts`. The guardrail is unnecessary because the `dataview_query` tool uses a fixed template approach ([@ADR-011]) that eliminates the need for static code analysis.

## Scope

- **Includes**: Deleting `src/guardrail.ts` and `tests/guardrail.test.ts`, verifying no remaining imports
- **Excludes**: Removing the guardrail import from `search.ts` (already done in subtask 02)

## Dependencies

- Subtask 02 (wire-registry-and-remove-eval) must be complete — the guardrail import in `search.ts` must already be removed.

## Acceptance Criteria

- [ ] `src/guardrail.ts` deleted
- [ ] `tests/guardrail.test.ts` deleted
- [ ] No remaining imports of `guardrail` anywhere in the codebase (verify with grep)

## Files to Create/Modify

| Action | Path | Description |
|--------|------|-------------|
| delete | `src/guardrail.ts` | No remaining consumers |
| delete | `tests/guardrail.test.ts` | Test file for deleted module |

## Implementation Notes

- After deletion, run `grep -r "guardrail" src/ tests/` to confirm zero remaining references
- TypeScript should still compile cleanly after deletion
