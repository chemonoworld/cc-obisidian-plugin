---
feature: eval-query-replace
type: adr
id: ADR-011
title: Use Fixed Eval Template for Dataview DQL
status: accepted
date: 2026-03-14
refs: [arch-eval-query-replace-001, rsch-eval-query-replace-001]
---

# ADR-011: Use Fixed Eval Template for Dataview DQL

## Context

Dataview DQL is a declarative, SQL-like query language for Obsidian vaults. It enables complex vault queries (filtering by metadata, dates, tags, links) without code execution. DQL is read-only by design and cannot access the filesystem, network, or execute arbitrary code.

To expose DQL via MCP, the DQL string must be passed to the Dataview plugin's `query()` API. This API is only accessible through Obsidian's `eval` CLI command, which executes JavaScript. The challenge is to use the `eval` command safely — allowing DQL queries while preventing arbitrary code injection.

## Decision

Use a fixed JavaScript template with `JSON.stringify` to embed the DQL string as a literal argument:

```typescript
const code = `return JSON.stringify(
  await app.plugins.plugins.dataview?.api?.query(${JSON.stringify(args.query)})
)`;
const result = await execObsidian("eval", { code }, { vault: vault() });
```

The user supplies only the DQL query string. The JavaScript template is hardcoded — the user never writes JavaScript. No guardrail is needed.

## Rationale

- **`JSON.stringify` prevents injection by specification**: `JSON.stringify` produces a valid JSON string literal with all control characters escaped — double quotes, backslashes, newlines, tabs, and unicode characters. The output is always a single string token that cannot break out of the `query()` argument position.
- **No guardrail needed**: Unlike `eval_query` where the user writes arbitrary JS, the template is fixed code authored by us. The user-supplied DQL string is data, not code. This is the same principle as parameterized SQL queries.
- **DQL is inherently safe**: Dataview's query language is read-only, has no filesystem access, no network access, and no code execution capability. Even if the DQL string were somehow executed as code (it cannot be via `JSON.stringify`), DQL itself has no dangerous operations.
- **Simple implementation**: The handler is ~8 lines with no dependencies beyond `execObsidian` and `helpers`. No new modules, no regex patterns, no AST parsing.
- **Graceful degradation**: The optional chaining (`?.api?.query`) returns `undefined` (serialized as `"null"`) when Dataview is not installed, rather than throwing.

## Alternatives Considered

### Apply the Existing Guardrail to DQL-Generated Code

- **Description**: Pass the generated template through `validateEvalCode()` before execution
- **Pros**: Defense-in-depth; reuses existing infrastructure
- **Cons**: The guardrail is being deleted ([@ADR-009]); would require keeping ~260 lines of code for one call site; the guardrail has known bypasses anyway
- **Rejected because**: The fixed template is safe by construction — guarding it is unnecessary and would keep dead code alive

### User Writes JavaScript with DQL Embedded

- **Description**: Let users write their own JavaScript that calls the Dataview API, with a guardrail restricting what they can do
- **Pros**: Maximum flexibility; users can post-process query results in JS
- **Cons**: Same security problems as `eval_query` — user-controlled JS in Electron with full Node.js access; guardrail cannot prevent all bypasses
- **Rejected because**: This is just `eval_query` under a different name; the entire point of [@ADR-009] is to stop executing user-written JS

### Direct CLI Support for Dataview

- **Description**: Wait for Obsidian CLI to add native Dataview/DQL support
- **Pros**: No eval needed; cleanest solution
- **Cons**: No timeline for this feature; may never happen; blocks useful functionality indefinitely
- **Rejected because**: Cannot depend on an unplanned upstream feature

## Consequences

### Positive
- DQL queries work safely without any guardrail infrastructure
- Users can run complex vault queries (TABLE, LIST, TASK, CALENDAR) through a simple string parameter
- The handler is trivially auditable — the fixed template is visible in ~3 lines of code
- No new dependencies

### Negative
- Depends on Dataview plugin being installed in the user's vault
- Users cannot post-process DQL results with JavaScript (they get raw query output)
- The `eval` CLI command is still used internally, though only with our fixed template

### Mitigations
- Optional chaining ensures graceful failure when Dataview is not installed — the handler returns a clear error message
- Raw DQL output (JSON) is structured enough that MCP clients can process it as needed
- Test suite covers DQL strings with special characters: double quotes, single quotes, backticks, backslashes, unicode, and newlines (per reviewer recommendation)

## Related Decisions

- [@ADR-009]: Removal of eval_query — this decision provides the safe alternative for Dataview access
- [@ADR-010]: `dataviewQuery` handler lives in the new `query.ts` module
