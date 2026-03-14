---
id: prog-eval-query-replace-001-02
stage: progress
feature: eval-query-replace
title: "Progress: Wire registry and remove eval_query"
created: 2026-03-14
updated: 2026-03-14
tags: [progress, eval-query-replace, subtask]
status: not-started
refs:
  - type: based-on
    target: task-eval-query-replace-001-02
decisions: []
---

# Progress: Wire registry and remove eval_query

## Status: Not Started

## Acceptance Criteria

- [ ] `tools.ts` adds `import * as query from "./tools/query.js"`
- [ ] 6 new tool entries with correct names, descriptions, Zod schemas, handlers
- [ ] `eval_query` entry removed from tools array
- [ ] `evalQuery` function removed from `search.ts`
- [ ] `import { validateEvalCode }` removed from `search.ts`
- [ ] TypeScript compiles

## Changes Made

## Issues
