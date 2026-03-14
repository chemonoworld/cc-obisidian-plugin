---
id: prog-eval-query-replace-001-01
stage: progress
feature: eval-query-replace
title: "Progress: Create query handlers and tests"
created: 2026-03-14
updated: 2026-03-14
tags: [progress, eval-query-replace, subtask]
status: not-started
refs:
  - type: based-on
    target: task-eval-query-replace-001-01
decisions: []
---

# Progress: Create query handlers and tests

## Status: Not Started

## Acceptance Criteria

- [ ] `query.ts` exports 6 functions: `listFiles`, `listLinks`, `findDeadends`, `findUnresolved`, `listTasks`, `dataviewQuery`
- [ ] Each handler calls `execObsidian(command, params, { vault: vault() })`
- [ ] Each handler returns `ok(JSON.stringify(data))` on success, `fail(error)` on failure
- [ ] `dataviewQuery` builds fixed JS template using `JSON.stringify(args.query)`
- [ ] JSDoc module comment explains query vs search domain boundary
- [ ] Tests mock `execObsidian`, verify success/error/param paths per handler
- [ ] DQL edge case tests: queries with quotes, backticks, backslashes, unicode, newlines
- [ ] All tests pass

## Changes Made

## Issues
