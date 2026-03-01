import { execFile as nodeExecFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

function execFileAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    nodeExecFile(cmd, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const EXCLUDED_DIRS = new Set(['.obsidian', 'node_modules', '.git']);

export interface IndexedFile {
  file_path: string;
  content_hash: string;
}

export interface ChangeSet {
  toAdd: string[];
  toDelete: string[];
  currentCommit: string | null;
}

async function walkMarkdownFiles(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const subResults = await walkMarkdownFiles(join(dir, entry.name), root);
      results.push(...subResults);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(relative(root, join(dir, entry.name)));
    }
  }
  return results;
}

async function hashFileContent(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function detectByHash(
  vaultPath: string,
  indexedFiles: IndexedFile[]
): Promise<ChangeSet> {
  const indexMap = new Map<string, string>();
  for (const f of indexedFiles) {
    indexMap.set(f.file_path, f.content_hash);
  }

  const mdFiles = await walkMarkdownFiles(vaultPath, vaultPath);
  const vaultSet = new Set(mdFiles);

  const toAdd: string[] = [];
  const toDelete: string[] = [];

  for (const relPath of mdFiles) {
    const indexedHash = indexMap.get(relPath);
    if (indexedHash === undefined) {
      toAdd.push(relPath);
    } else {
      try {
        const currentHash = await hashFileContent(join(vaultPath, relPath));
        if (currentHash !== indexedHash) {
          toAdd.push(relPath);
        }
      } catch {
        // If we can't read the file, skip it
      }
    }
  }

  for (const f of indexedFiles) {
    if (!vaultSet.has(f.file_path)) {
      toDelete.push(f.file_path);
    }
  }

  return { toAdd, toDelete, currentCommit: null };
}

async function detectByGit(
  vaultPath: string,
  indexedFiles: IndexedFile[],
  lastCommit: string | null
): Promise<ChangeSet> {
  // Verify this is a git repo and ensure non-ASCII paths aren't escaped
  await execFileAsync('git', ['-C', vaultPath, 'rev-parse', '--is-inside-work-tree']);
  await execFileAsync('git', ['-C', vaultPath, 'config', 'core.quotePath', 'false']);

  // Get HEAD commit
  const { stdout: headOut } = await execFileAsync('git', ['-C', vaultPath, 'rev-parse', 'HEAD']);
  const currentCommit = headOut.trim();

  const toAddSet = new Set<string>();
  const toDeleteSet = new Set<string>();

  if (lastCommit === null) {
    // First-time index: enumerate all tracked .md files
    const { stdout: lsOut } = await execFileAsync('git', [
      '-C', vaultPath, 'ls-files', '*.md',
    ]);
    for (const line of lsOut.split('\n')) {
      const f = line.trim();
      if (f) toAddSet.add(f);
    }
  } else {
    // Incremental: diff from last indexed commit to HEAD
    const { stdout: diffOut } = await execFileAsync('git', [
      '-C', vaultPath,
      'diff', '--name-status',
      `${lastCommit}..HEAD`,
      '--', '*.md',
    ]);
    for (const line of diffOut.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\t/);
      const status = parts[0];
      if (status === 'D' && parts[1]) {
        toDeleteSet.add(parts[1]);
      } else if ((status === 'M' || status === 'A') && parts[1]) {
        toAddSet.add(parts[1]);
      } else if (status.startsWith('R') && parts[2]) {
        // Renamed: parts[1] = old path, parts[2] = new path
        if (parts[1]) toDeleteSet.add(parts[1]);
        toAddSet.add(parts[2]);
      }
    }
  }

  // Always check working tree status for untracked/modified files
  const { stdout: statusOut } = await execFileAsync('git', [
    '-C', vaultPath,
    'status', '--porcelain',
    '--', '*.md',
  ]);
  for (const line of statusOut.split('\n')) {
    if (line.length < 3) continue;
    const xy = line.substring(0, 2);
    const filePath = line.substring(3).trim();
    if (!filePath) continue;

    const x = xy[0];
    const y = xy[1];

    if (xy === '??') {
      toAddSet.add(filePath);
    } else {
      if (x === 'D' || y === 'D') {
        toDeleteSet.add(filePath);
      } else if (x === 'M' || x === 'A' || y === 'M' || y === 'A') {
        toAddSet.add(filePath);
      }
    }
  }

  // Files in toAdd should not also be in toDelete
  for (const f of toAddSet) {
    toDeleteSet.delete(f);
  }

  return {
    toAdd: Array.from(toAddSet),
    toDelete: Array.from(toDeleteSet),
    currentCommit,
  };
}

async function ensureGitRepo(vaultPath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', vaultPath, 'rev-parse', '--is-inside-work-tree']);
  } catch {
    // Not a git repo — initialize one
    try {
      await execFileAsync('git', ['-C', vaultPath, 'init', '-b', 'main']);
      // Prevent git from escaping non-ASCII filenames (Korean, etc.)
      await execFileAsync('git', ['-C', vaultPath, 'config', 'core.quotePath', 'false']);
    } catch {
      return false;
    }
  }

  // Always stage and commit pending changes so git diff is accurate
  try {
    await execFileAsync('git', ['-C', vaultPath, 'add', '-A']);
    await execFileAsync('git', ['-C', vaultPath, 'commit', '-m', 'semantic-search: auto-index']);
  } catch {
    // Nothing to commit — fine
  }
  return true;
}

export async function detectChanges(
  vaultPath: string,
  indexedFiles: IndexedFile[],
  lastCommit: string | null
): Promise<ChangeSet> {
  // Ensure vault has git repo and all changes are committed
  await ensureGitRepo(vaultPath);

  try {
    return await detectByGit(vaultPath, indexedFiles, lastCommit);
  } catch {
    // Git not available — fall back to hash scan
  }

  try {
    return await detectByHash(vaultPath, indexedFiles);
  } catch {
    // Hash scan also failed
  }

  return { toAdd: [], toDelete: [], currentCommit: null };
}
