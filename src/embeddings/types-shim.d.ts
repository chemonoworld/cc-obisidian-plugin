// Type stubs for optional dependencies that may not be installed
declare module "@huggingface/transformers" {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<(text: string, options?: Record<string, unknown>) => Promise<{ tolist(): number[][] }>>;
}

declare module "better-sqlite3" {
  const Database: unknown;
  export default Database;
}

declare module "sqlite-vec" {
  export function load(db: unknown): void;
}
