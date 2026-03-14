---
id: plan-eval-query-replace-001
stage: plan
feature: eval-query-replace
title: "Plan: eval_query Replacement"
created: 2026-03-14
updated: 2026-03-14
tags: [plan, eval-query-replace]
status: active
refs:
  - type: based-on
    target: arch-eval-query-replace-001
  - type: based-on
    target: rsch-eval-query-replace-001
decisions: []
---

# Plan: eval_query Replacement

## Overview

Replace the `eval_query` tool — which executes arbitrary JavaScript in Obsidian's Electron process with documented guardrail bypasses — with six purpose-built, constrained MCP tools that wrap Obsidian CLI commands and Dataview DQL queries. This follows the architecture in [@arch-eval-query-replace-001], which was informed by research in [@rsch-eval-query-replace-001].

The replacement tools use the same `execObsidian → ok/fail` pattern as all existing handlers. The `dataview_query` tool safely exposes DQL via a fixed eval template with `JSON.stringify` escaping, eliminating code injection without a guardrail.

## Subtask Summary

| # | Subtask | Complexity | Dependencies | Status |
|---|---------|------------|--------------|--------|
| 01 | create-query-handlers-and-tests | M | — | not-started |
| 02 | wire-registry-and-remove-eval | S | 01 | not-started |
| 03 | delete-guardrail | S | 02 | not-started |
| 04 | update-test-assertions | S | 02 | not-started |
| 05 | update-readme | S | 02 | not-started |

## Dependency Graph

```
01-create-query-handlers-and-tests
         │
         ▼
02-wire-registry-and-remove-eval
         │
    ┌────┼────┐
    ▼    ▼    ▼
   03   04   05   (parallel)
```

## Parallelization Opportunities

- Subtasks 03, 04, and 05 can all be worked on simultaneously after subtask 02 is complete.
- Subtask 01 has no dependencies and can begin immediately.

## Critical Path

01 → 02 → (any of 03/04/05)

The longest sequential chain is 3 steps. Total estimated effort is small — all subtasks are S or M complexity with well-defined file changes.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DQL queries with unusual characters break the fixed template | L | M | `JSON.stringify` handles all edge cases by spec; test suite covers quotes, backticks, unicode, newlines |
| Dataview plugin not installed in user's vault | M | L | `dataviewQuery` returns clear error when `app.plugins.plugins.dataview?.api` is undefined |
| Users relying on eval_query lose capability | L | M | Six new tools cover majority of use cases; README documents migration |

## Notes

- All six handlers follow the established `execObsidian → ok/fail` pattern — no new abstractions.
- The `dataview_query` handler is the only one that uses the CLI `eval` command; the others use dedicated CLI commands (`files`, `links`, `deadends`, `unresolved`, `tasks`).
- Subtask 02 is the integration point — it both wires new tools and removes old ones. This must be done atomically so TypeScript compiles at every step.
- After subtask 03, there should be zero remaining imports of `guardrail` anywhere in the codebase.
