---
feature: semantic-search
subtask: 04-change
size: medium
depends-on: []
---

# Git/Hash Change Detection

## Goal
Detect which markdown files in the vault have been added, modified, or deleted since the last indexing, using git when available and SHA-256 hashing as fallback.

## Files
- `src/embeddings/change.ts` — Change detection implementation

## API Contract

```typescript
interface IndexedFile {
  file_path: string
  content_hash: string
}

interface ChangeSet {
  toAdd: string[]       // new or modified file paths
  toDelete: string[]    // removed file paths
  currentCommit: string | null
}

function detectChanges(
  vaultPath: string,
  indexedFiles: IndexedFile[],
  lastCommit: string | null
): Promise<ChangeSet>
```

## Implementation Notes

1. **Dual-track detection**:
   - **Track 1 (Git)**: If the vault is a git repo, use:
     - `git diff --name-status <lastCommit>..HEAD -- '*.md'` for committed changes
     - `git status --porcelain -- '*.md'` for uncommitted/untracked changes
     - Parse status codes: M=modified, A=added, D=deleted, R=renamed, ??=untracked
   - **Track 2 (Hash fallback)**: If not a git repo or git fails:
     - Glob all `*.md` files in the vault
     - Compute SHA-256 of each file's content
     - Compare against `indexedFiles` hashes
     - Files not in indexedFiles → toAdd
     - Files in indexedFiles but with different hash → toAdd
     - Files in indexedFiles but not on disk → toDelete

2. **Git detection**: Check if vault is a git repo by running `git rev-parse --is-inside-work-tree` in the vault directory. Use `child_process.execSync` or `execFile`.

3. **Current commit**: Get via `git rev-parse HEAD`. Return null for non-git vaults.

4. **File path handling**: All paths should be relative to the vault root. Git output is already relative.

5. **Exclude patterns**: Skip files in `.obsidian/`, `node_modules/`, and other non-content directories.

6. **Hash computation**: Use `crypto.createHash('sha256').update(content).digest('hex')`.

7. **Performance**: Git track < 100ms for 1000 files. Hash track ~500ms for 1000 files.

8. **Error handling**: If git commands fail, fall back to hash-based detection silently.

## Acceptance Criteria
- [ ] Detects new files (not in index)
- [ ] Detects modified files (different hash)
- [ ] Detects deleted files (in index but not on disk)
- [ ] Uses git when available
- [ ] Falls back to hash when not a git repo
- [ ] Returns current commit hash (null for non-git)
- [ ] Excludes .obsidian/ directory
- [ ] Handles empty vault (no .md files)
- [ ] All paths relative to vault root

## Test Plan
- Mock git commands for git-based tests
- Mock fs for hash-based tests
- New file detection (file on disk, not in index)
- Modified file detection (different hash)
- Deleted file detection (in index, not on disk)
- Git fallback when git not available
- Empty vault returns empty changeset
- .obsidian/ files excluded
