---
id: ADR-003
title: No Custom SQLite Index
status: accepted
date: 2026-02-28
---

# ADR-003: No Custom Index

## Decision
Do not build a custom SQLite/in-memory index of the vault.

## Rationale
- Obsidian CLI `search` already supports structured queries with operators:
  `[property:value]`, `tag:#name`, `path:`, `/regex/`, etc.
- `eval` command provides full access to `app.metadataCache` for complex queries
- `base:query` can query existing database views
- Building a custom index means maintaining sync, handling renames, invalidation

## Consequence
All search operations delegate to Obsidian's built-in index via CLI.
Zero maintenance burden for index freshness.
