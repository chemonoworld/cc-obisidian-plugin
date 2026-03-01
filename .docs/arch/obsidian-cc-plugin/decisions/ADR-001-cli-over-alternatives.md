---
id: ADR-001
title: Use Obsidian CLI over REST API and Direct Filesystem
status: accepted
date: 2026-02-28
---

# ADR-001: CLI over Alternatives

## Context
Three approaches exist for external tools to access an Obsidian vault:
1. Direct filesystem (read/write .md files)
2. Local REST API plugin (HTTP endpoints)
3. Official Obsidian CLI v1.12

## Decision
Use the Obsidian CLI v1.12.

## Rationale
- **Performance**: CLI uses Obsidian's pre-built in-memory index. Search is 6x faster than grep,
  graph queries 60x faster, token usage 70,000x lower.
- **No extra plugins**: REST API requires installing a community plugin. CLI is built-in.
- **Structured search**: CLI search supports operators like `[property:value]`, `tag:#name`, `path:` —
  making the vault queryable like a database without building custom indexes.
- **`eval` command**: Provides full Obsidian API access for complex queries.
- **Official support**: Maintained by Obsidian team, unlike community plugins.

## Trade-offs
- Requires Obsidian desktop app to be running (no headless mode)
- Cannot target vaults by filesystem path (only name/ID)
- Exit codes unreliable — must parse stdout for errors

## Alternatives Rejected
- **Direct filesystem**: No index access, must build/maintain own index, no frontmatter query operators
- **REST API plugin**: Extra dependency, HTTP overhead, SSL cert issues, same "Obsidian must run" constraint
