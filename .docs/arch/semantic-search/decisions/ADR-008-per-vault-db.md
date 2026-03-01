---
feature: semantic-search
type: adr
id: ADR-008
status: accepted
date: 2026-03-01
---

# ADR-008: One SQLite Database Per Vault

## Context

The embedding store uses SQLite (with the `sqlite-vec` extension) to persist chunk embeddings. When a user has multiple vaults configured, a storage topology decision is required:

1. **Shared database**: A single SQLite file at a fixed location (e.g., inside the plugin's config directory) stores embeddings for all vaults, distinguished by a vault identifier column.
2. **Per-vault database**: A separate SQLite file is created inside each vault's plugin directory (e.g., `<vault>/.obsidian/plugins/cc-plugin/embeddings.db`).

## Decision

Each vault has its own SQLite database file stored at:

```
<vaultPath>/.obsidian/plugins/cc-plugin/embeddings.db
```

The path is configurable via `EmbeddingConfig.dbPath` to support edge cases (e.g., read-only vaults, network filesystems).

## Rationale

- **Isolation**: A corrupt or oversized DB in one vault does not affect others. Deleting a vault (or its plugin data) cleanly removes all associated embedding data.
- **Portability**: The DB travels with the vault. If a user moves or syncs a vault to another machine, their index comes along.
- **Simplicity**: No vault identifier column needed in the schema. All queries in a session operate on one DB, so there is no need for cross-vault joins or filtering.
- **Concurrent access**: Multiple vault sessions can write their DBs simultaneously without any locking contention between vaults.
- **Conventional**: Obsidian plugins conventionally store per-vault data under `.obsidian/plugins/<plugin-id>/`. Following this convention makes data location predictable to users and tooling.

## Trade-offs

| Gained | Lost |
|---|---|
| Full vault isolation (data, errors, size) | Cannot run cross-vault semantic queries |
| DB travels with vault on sync/move | Slightly more `openStore()` calls (once per vault session) |
| No cross-vault locking contention | Each vault pays its own DB overhead |
| Clean deletion: remove vault = remove embeddings | |
| Follows Obsidian per-vault plugin data convention | |

## Consequences

- `openStore(dbPath)` is called with a vault-specific path resolved at init time.
- `initEmbeddingStore()` resolves `dbPath` from config or defaults to `<vaultPath>/.obsidian/plugins/cc-plugin/embeddings.db`.
- The parent directory is created with `fs.mkdir(..., { recursive: true })` if it does not exist.
- If `dbPath` is on a read-only filesystem, the user should set `embedding.dbPath` in config to a writable location.
- Obsidian's `.obsidian/` directory is typically excluded from version control (`.gitignore`), so the DB will not be committed even in git-backed vaults.
