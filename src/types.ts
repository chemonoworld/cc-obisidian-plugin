export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ParsedCliResult {
  success: boolean;
  raw: string;
  data: unknown;
  error: string | null;
}

export interface SearchResult {
  file: string;
  score?: number;
  matches?: string[];
}

export interface SearchResponse {
  total: number;
  returned: number;
  truncated: boolean;
  results: SearchResult[];
}

export interface VaultEntry {
  name: string;
  id: string;
  path?: string;
}

export interface EmbeddingConfig {
  model?: string;
  dbPath?: string;
}

export interface Config {
  defaultVault: string | null;
  embedding?: EmbeddingConfig;
}

export interface ToolContent {
  type: "text";
  text: string;
}

export interface ToolResponse {
  content: ToolContent[];
  isError: boolean;
}
