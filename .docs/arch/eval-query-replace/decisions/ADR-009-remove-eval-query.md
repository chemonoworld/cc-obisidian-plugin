---
feature: eval-query-replace
type: adr
id: ADR-009
title: Remove eval_query Entirely
status: accepted
date: 2026-03-14
refs: [arch-eval-query-replace-001, rsch-eval-query-replace-001]
---

# ADR-009: Remove eval_query Entirely

## Context

The `eval_query` tool executes arbitrary JavaScript in Obsidian's Electron process via the CLI `eval` command. This process has full Node.js API access (`fs`, `child_process`, `net`), complete filesystem read/write, and shell command execution capability. There is no sandbox.

The current `src/guardrail.ts` uses multi-layer static regex analysis to block dangerous patterns. Research ([@rsch-eval-query-replace-001]) identified three confirmed bypass vectors:

| Bypass | Example | Why It Passes |
|--------|---------|---------------|
| Template literal interpolation | `` ${require('fs')} `` | Simplified template stripping misses nested expressions |
| Constructor chain | `({}).constructor.constructor('return process')()` | Reaches `Function` constructor indirectly |
| Bracket notation for writes | `app.vault.adapter['write'](...)` | Write patterns only check dot-notation |

The vm2 project — the most sophisticated Node.js sandbox — was abandoned in 2023 after years of CVEs, confirming that sandboxing JavaScript within JavaScript is fundamentally impossible without VM-level isolation. No competing Obsidian MCP server (cyanheads, jacksteamdev, MarkusPfundstein) exposes arbitrary code execution.

## Decision

Remove `eval_query` from the tool registry and delete the guardrail module entirely. Replace its functionality with purpose-built, constrained tools ([@arch-eval-query-replace-001]).

## Rationale

- The regex guardrail has documented bypasses that grant full system access — it provides a false sense of security rather than actual protection
- Static regex analysis is structurally inadequate for sandboxing arbitrary code (confirmed by vm2 postmortem)
- No competing Obsidian MCP server exposes eval — the industry pattern is purpose-built tools
- The MCP specification explicitly warns that "tools represent arbitrary code execution and must be treated with appropriate caution"
- Six replacement tools ([@arch-eval-query-replace-001]) cover the majority of eval_query use cases without any code execution

## Alternatives Considered

### Improve the Guardrail

- **Description**: Add more regex patterns to block the known bypasses, potentially moving to AST-based analysis
- **Pros**: Preserves full Obsidian API access for power users
- **Cons**: Whack-a-mole problem — every new bypass requires a new rule; AST analysis still cannot prevent all sandbox escapes in JavaScript; vm2's failure demonstrates the futility
- **Rejected because**: The fundamental problem is structural, not a matter of adding more rules

### Keep eval_query with a Warning

- **Description**: Add prominent warnings in the tool description and require explicit user opt-in
- **Pros**: Preserves capability; shifts responsibility to user
- **Cons**: MCP clients (Claude Code) may invoke tools automatically; warning text may not surface to users; does not address the actual security risk
- **Rejected because**: Warnings do not prevent exploitation; the tool would still be callable by any MCP client

### Sandbox via isolated-vm or QuickJS

- **Description**: Run eval code in a true isolate (V8 isolate or WASM-based QuickJS)
- **Pros**: Genuine sandboxing with capability control
- **Cons**: New native dependency; Obsidian API access requires complex proxying; significant implementation effort
- **Rejected because**: Over-engineered for the use case; purpose-built tools are simpler and safer

## Consequences

### Positive
- Eliminates the primary attack surface (arbitrary code execution with full Node.js privileges)
- Removes ~260 lines of guardrail code that provided false security
- Simplifies the codebase — no regex maintenance, no bypass whack-a-mole
- Aligns with industry practice (no competing server uses eval)

### Negative
- Users relying on eval_query for custom Obsidian API queries lose that capability
- Multi-hop graph traversal and direct plugin API access are no longer possible
- Migration friction for any existing eval_query callers

### Mitigations
- Six replacement tools cover file listing, links, dead ends, unresolved links, tasks, and Dataview DQL queries
- DQL covers complex vault queries (filtering by metadata, dates, tags, links) without code execution
- Documentation should provide DQL equivalents for common eval_query patterns
- A future purpose-built `graph_query` tool can address multi-hop traversal if demand materializes

## Related Decisions

- [@ADR-010]: Creating the `query.ts` module to house replacement tool handlers
- [@ADR-011]: Using a fixed eval template for safe DQL exposure (the one remaining use of `eval` CLI command)
- [@ADR-002]: `execFile` over `exec` — the security principle of constrained interfaces that this decision extends
