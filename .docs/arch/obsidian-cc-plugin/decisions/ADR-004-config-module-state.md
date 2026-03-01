---
id: ADR-004
title: Module-Level Config State
status: accepted
date: 2026-02-28
---

# ADR-004: Module-Level Config State

## Decision
Use module-level `let` variable for current vault config, loaded once at startup.

## Rationale
- Node.js module cache provides natural singleton behavior
- Config has exactly two fields (`defaultVault`, optionally `binaryPath`)
- A class with `getInstance()` adds ceremony for zero benefit
- Config reads/writes are rare (once at startup, once per vault switch)

## Consequence
Simple, flat config module with `getVault()`, `setVault()`, `loadConfig()` exports.
