---
feature: semantic-search
type: adr
id: ADR-006
status: accepted
date: 2026-03-01
---

# ADR-006: Opt-In via Config Flag

## Context

The semantic search feature requires optional heavy dependencies (`@huggingface/transformers`, `better-sqlite3`, `sqlite-vec`) and will download a multi-hundred-MB model on first use. These are inappropriate to activate for all users automatically.

Two activation strategies were considered:

1. **Always-on**: Feature activates if dependencies are installed; no config required.
2. **Opt-in via config flag**: Feature only activates when `embedding.enabled: true` is set in the plugin config.

## Decision

Semantic search is opt-in. The feature only activates when the config contains:

```json
{
  "embedding": {
    "enabled": true
  }
}
```

If `embedding` is absent or `enabled` is `false`, the `semantic_search` tool returns a clear message explaining how to enable the feature rather than failing silently or crashing.

## Rationale

- **Model download is large**: The default model (`multilingual-e5-large`) is ~600 MB. Downloading it without user consent is a poor experience and may fail in air-gapped environments.
- **Dependencies are optional**: Listing them as `optionalDependencies` means they may not be installed. Requiring a config flag to activate prevents runtime errors when they are absent.
- **Principle of least surprise**: Existing plugin users should not experience new behavior (model downloads, DB creation, increased startup time) without explicitly opting in.
- **Easier rollout**: Users can test the feature on one machine before enabling it in shared configurations.

## Trade-offs

| Gained | Lost |
|---|---|
| No surprise model downloads or DB creation | Requires an extra config step for users who want the feature |
| Safe default for existing users | Feature discovery depends on documentation, not automatic activation |
| Works correctly when optional deps are missing | Users may not realize the feature exists |
| Clear error message guides users to enable | |

## Consequences

- `isAvailable()` in `embeddings/index.ts` checks `config.embedding?.enabled === true` before doing any initialization work.
- The `semantic_search` tool checks availability at the start of each call and returns a user-friendly guidance message if disabled.
- Documentation must explain the opt-in step clearly, including the required config key and the dependency installation command.
- The `EmbeddingConfig.enabled` field has no default in the type — callers must treat absence as `false`.
