---
id: ADR-002
title: Use execFile for CLI Execution
status: accepted
date: 2026-02-28
---

# ADR-002: execFile over exec

## Decision
Use `child_process.execFile` (not `exec`) to spawn the Obsidian CLI.

## Rationale
- `execFile` passes arguments as an array directly to the binary, bypassing the shell entirely
- This eliminates shell injection vulnerabilities without manual escaping
- No shell metacharacters (`$`, `;`, `|`, `` ` ``) are interpreted

## Consequence
Arguments with spaces work naturally since there's no shell word splitting.
No need for a custom escaping function.
