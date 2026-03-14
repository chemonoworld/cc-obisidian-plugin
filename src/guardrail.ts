/**
 * Security guardrail for eval_query.
 *
 * Validates JavaScript code before it is sent to Obsidian's `eval` command.
 * Multi-layer static analysis blocks dangerous patterns while preserving
 * legitimate Obsidian API access for power-user queries.
 *
 * Layers:
 *   1. Code length limit
 *   2. Bracket-notation bypass detection (on raw code)
 *   3. Comment/string stripping (prevent false positives)
 *   4. Blocked identifier detection (require, process, global, …)
 *   5. Blocked pattern detection (eval(), fetch(), Proxy, …)
 *   6. Write-operation gating (read-only by default)
 */

export interface GuardrailResult {
  allowed: boolean;
  violations: string[];
}

export interface GuardrailOptions {
  /** Allow vault write operations (default: false). */
  allowWrite?: boolean;
  /** Maximum code length in characters (default: 5000). */
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Blocked identifiers — must not appear as standalone tokens
// ---------------------------------------------------------------------------

const BLOCKED_IDENTIFIERS: readonly string[] = [
  // Node.js / module system
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  // Global scope objects
  "process",
  "global",
  "globalThis",
  // Binary data
  "Buffer",
  // Node.js built-in modules (if leaked into Electron context)
  "child_process",
];

// ---------------------------------------------------------------------------
// Blocked patterns — dangerous API / code-generation / network
// ---------------------------------------------------------------------------

interface BlockedPattern {
  pattern: RegExp;
  message: string;
}

const BLOCKED_PATTERNS: readonly BlockedPattern[] = [
  // -- Dynamic code execution --
  { pattern: /\beval\s*\(/, message: "eval() is blocked" },
  { pattern: /\bFunction\s*\(/, message: "Function() constructor is blocked" },
  { pattern: /\bnew\s+Function\b/, message: "new Function() is blocked" },

  // -- Dynamic import --
  { pattern: /\bimport\s*\(/, message: "Dynamic import() is blocked" },

  // -- Network access --
  {
    pattern: /\bfetch\s*\(/,
    message: "fetch() is blocked — no network access allowed",
  },
  {
    pattern: /\bXMLHttpRequest\b/,
    message: "XMLHttpRequest is blocked — no network access allowed",
  },
  {
    pattern: /\bWebSocket\b/,
    message: "WebSocket is blocked — no network access allowed",
  },
  {
    pattern: /\bnavigator\s*\.\s*sendBeacon\b/,
    message: "navigator.sendBeacon is blocked",
  },

  // -- Prototype / meta-programming --
  { pattern: /__proto__/, message: "__proto__ access is blocked" },
  { pattern: /\bReflect\s*\./, message: "Reflect API is blocked" },
  { pattern: /\bProxy\s*\(/, message: "Proxy construction is blocked" },
  { pattern: /\bnew\s+Proxy\b/, message: "Proxy construction is blocked" },

  // -- Encoding tricks (bypass vectors) --
  {
    pattern: /\batob\s*\(/,
    message: "atob() is blocked — potential obfuscation",
  },
  {
    pattern: /\bbtoa\s*\(/,
    message: "btoa() is blocked — potential obfuscation",
  },
  {
    pattern: /\bString\s*\.\s*fromCharCode\b/,
    message: "String.fromCharCode is blocked — potential obfuscation",
  },

  // -- Timer-based code execution (string overload) --
  {
    pattern: /\bsetTimeout\s*\(/,
    message: "setTimeout() is blocked",
  },
  {
    pattern: /\bsetInterval\s*\(/,
    message: "setInterval() is blocked",
  },
  {
    pattern: /\bsetImmediate\s*\(/,
    message: "setImmediate() is blocked",
  },
];

// ---------------------------------------------------------------------------
// Vault write patterns — only enforced when allowWrite is false
// ---------------------------------------------------------------------------

const WRITE_PATTERNS: readonly BlockedPattern[] = [
  {
    pattern:
      /\.vault\s*\.\s*(create|modify|rename|delete|trash|copy|append)\s*\(/,
    message:
      "Vault write operation is blocked in read-only mode (set allow_write=true to enable)",
  },
  {
    pattern:
      /\.vault\s*\.\s*adapter\s*\.\s*(write|writeBinary|rename|remove|rmdir|mkdir|copy|append|trashSystem|trashLocal)\s*\(/,
    message:
      "Vault adapter write operation is blocked in read-only mode (set allow_write=true to enable)",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip comments and string literals, replacing them with safe placeholders.
 * This prevents false positives when checking identifiers inside comments
 * or harmless string values.
 */
export function stripCommentsAndStrings(code: string): string {
  return (
    code
      // Single-line comments
      .replace(/\/\/.*$/gm, " ")
      // Multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      // Template literals (simplified — does not handle nested expressions)
      .replace(/`(?:[^`\\]|\\.)*`/g, '""')
      // Double-quoted strings
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // Single-quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, '""')
  );
}

/**
 * Detect bracket-notation access to blocked identifiers on the **raw** code
 * (before stripping strings), because the identifier lives inside quotes.
 *
 * Catches: obj['require'], obj["eval"], obj[`process`]
 */
function checkBracketBypasses(code: string, violations: string[]): void {
  const allBlocked = [
    ...BLOCKED_IDENTIFIERS,
    // Also catch code-execution keywords that aren't in BLOCKED_IDENTIFIERS
    "eval",
    "Function",
  ];

  for (const id of allBlocked) {
    // Escape for regex safety (none of our ids need it, but just in case)
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\[\\s*['"\`]${escaped}['"\`]\\s*\\]`);
    if (re.test(code)) {
      violations.push(
        `Bracket-notation access to "${id}" is blocked — potential bypass`,
      );
    }
  }

  // String concatenation inside brackets: ['req' + 'uire']
  if (/\[\s*['"`][^'"`]*['"`]\s*\+\s*['"`][^'"`]*['"`]\s*\]/.test(code)) {
    violations.push(
      "String concatenation inside bracket notation is blocked — potential bypass",
    );
  }
}

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

export function validateEvalCode(
  code: string,
  options: GuardrailOptions = {},
): GuardrailResult {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const allowWrite = options.allowWrite ?? false;
  const violations: string[] = [];

  // Layer 1 — length
  if (code.length > maxLength) {
    violations.push(
      `Code exceeds maximum length (${code.length} > ${maxLength})`,
    );
    // Early return: no point analysing excessively long code
    return { allowed: false, violations };
  }

  // Layer 1b — empty
  if (!code.trim()) {
    violations.push("Empty code is not allowed");
    return { allowed: false, violations };
  }

  // Layer 2 — bracket-notation bypass (raw code)
  checkBracketBypasses(code, violations);

  // Layer 3 — strip comments & strings for subsequent checks
  const stripped = stripCommentsAndStrings(code);

  // Layer 4 — blocked identifiers
  for (const id of BLOCKED_IDENTIFIERS) {
    const re = new RegExp(`\\b${id}\\b`);
    if (re.test(stripped)) {
      violations.push(`Access to "${id}" is blocked`);
    }
  }

  // Layer 5 — blocked patterns
  for (const { pattern, message } of BLOCKED_PATTERNS) {
    if (pattern.test(stripped)) {
      violations.push(message);
    }
  }

  // Layer 6 — write operations (conditional)
  if (!allowWrite) {
    for (const { pattern, message } of WRITE_PATTERNS) {
      if (pattern.test(stripped)) {
        violations.push(message);
      }
    }
  }

  return { allowed: violations.length === 0, violations };
}
