---
id: rsch-eval-query-replace-002
stage: rsch
feature: eval-query-replace
title: "Sources: eval_query Replacement Strategy"
created: 2026-03-14
updated: 2026-03-14
tags: [rsch, eval-query-replace, sources]
status: active
refs: [{id: "rsch-eval-query-replace-001", rel: "relates-to"}]
decisions: []
---

# Sources

## Primary Sources (High Reliability)

| Source | URL | Type | Date | Key Takeaway |
|--------|-----|------|------|--------------|
| MCP Specification (2025-03-26 draft) | https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/ | Spec | 2025-03 | "Tools represent arbitrary code execution"; tool annotations (readOnlyHint, destructiveHint); human-in-the-loop is SHOULD-level |
| vm2 Deprecation Notice | https://github.com/nicedayfor/vm2/issues/533 | Issue | 2023 | Maintainers abandoned the project; "sandboxing JS within JS is fundamentally impossible" without VM-level isolation |
| Obsidian CLI Documentation | https://docs.obsidian.md/cli | Docs | 2026 | 115+ commands in v1.12+; command reference for files, links, tasks, tags, properties, outline |
| Dataview Documentation | https://blacksmithgu.github.io/obsidian-dataview/ | Docs | 2025 | DQL syntax reference; TABLE/LIST/TASK/CALENDAR query types; read-only by design |
| CVE-2021-42057 (DataviewJS) | https://nvd.nist.gov/vuln/detail/CVE-2021-42057 | CVE | 2021-10 | Arbitrary code execution via DataviewJS in Obsidian Dataview plugin; confirms JS eval in Obsidian is a real attack surface |
| cyanheads/obsidian-mcp-server | https://github.com/cyanheads/obsidian-mcp-server | Repo | 2025 | 8 purpose-built tools; uses Obsidian Local REST API; no eval capability |
| jacksteamdev/obsidian-mcp-tools | https://github.com/jacksteamdev/obsidian-mcp-tools | Repo | 2025 | Semantic search + Templater templates; explicitly states "never gives AI direct access to vault files" |
| MarkusPfundstein/mcp-obsidian | https://github.com/MarkusPfundstein/mcp-obsidian | Repo | 2025 | 7 tools with JsonLogic search; constrained query interface; no eval |

## Secondary Sources (Medium Reliability)

| Source | URL | Type | Date | Key Takeaway |
|--------|-----|------|------|--------------|
| Obsidian Local REST API Plugin | https://github.com/coddingtonbear/obsidian-local-rest-api | Repo | 2025 | Common REST API backend used by multiple MCP servers; provides structured endpoints not raw eval |
| MCP Tool Design Best Practices (community) | https://modelcontextprotocol.io/docs/concepts/tools | Docs | 2025 | Tool design guidance: narrow scope, clear descriptions, appropriate annotations |

## Community Sources (Low Reliability)

| Source | URL | Type | Date | Key Takeaway |
|--------|-----|------|------|--------------|
| Obsidian Forum: MCP integration discussions | https://forum.obsidian.md/ | Forum | 2025-2026 | Community preference for constrained tools over raw eval; security concerns raised by users |

## Codebase References

| File/Pattern | Path | Line | Relevance |
|--------------|------|------|-----------|
| Guardrail implementation | `src/guardrail.ts` | 1-258 | Full multi-layer static regex analysis; documents known bypass limitations |
| eval_query tool definition | `src/tools.ts` | 139-154 | Tool registration with security comment; references guardrail |
| evalQuery handler | `src/tools/search.ts` | 74-98 | Handler calling validateEvalCode then execObsidian("eval"); sole consumer of guardrail |
| Guardrail tests | `tests/guardrail.test.ts` | — | Test coverage for guardrail; can be deleted with guardrail |
| validateEvalCode import | `src/tools/search.ts` | 3 | Import to remove when deleting eval_query |
| Tool registration pattern | `src/tools.ts` | 12-17 | ToolDef interface: name/description/schema/handler — pattern for new tools |
| CLI execution helper | `src/cli.ts` | — | execObsidian() function used by all tool handlers |
| Response helpers | `src/tools/helpers.ts` | — | ok() and fail() helpers for consistent ToolResponse formatting |
| Security ADR | `.docs/arch/obsidian-cc-plugin/decisions/ADR-002-execfile-security.md` | 1-21 | execFile over exec for shell injection prevention; new tools inherit this safety |

## Credibility Notes

- **High**: Official specifications, primary source repositories, CVE databases, or official documentation
- **Medium**: Third-party documentation, indirect references, or sources where specific details were contextually verified
- **Low**: Community discussions, forum posts, or sources reflecting opinions rather than verified facts
- Sources rejected during validation (e.g., outdated blog posts, unverified claims about Obsidian internals) are excluded from this document
