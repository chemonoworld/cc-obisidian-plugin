---
feature: obsidian-cc-plugin
phase: progress
status: complete
date: 2026-03-01
---

# Obsidian MCP Plugin — Implementation

9개 subtask 전체 구현 완료. Obsidian CLI를 MCP server로 래핑하여 Claude Code에서 vault CRUD, 검색, 관리 기능을 사용할 수 있도록 한다.

## Project Scaffold

- `package.json` — `obsidian-vault-mcp` 패키지, ESM (`"type": "module"`)
- `tsconfig.json` — strict mode, ESNext target
- bin entry: `./dist/index.js`
- Dependencies: `@modelcontextprotocol/sdk`, `zod`
- Optional: `@huggingface/transformers`, `better-sqlite3`, `sqlite-vec` (semantic search용)

## Types (`src/types.ts`)

| Type | 용도 |
|------|------|
| `CliResult` | raw child_process 결과 (stdout, stderr, exitCode) |
| `ParsedCliResult` | CLI 실행 후 파싱된 결과 (success, data, error) |
| `SearchResult` / `SearchResponse` | CLI 검색 결과 구조 |
| `VaultEntry` | vault 정보 (name, id, path) |
| `Config` / `EmbeddingConfig` | 설정 파일 구조 |
| `ToolContent` / `ToolResponse` | MCP tool 응답 포맷 |

## CLI Executor (`src/cli.ts`)

- `execFile` 사용 (shell injection 방지)
- 30초 timeout, 10MB maxBuffer
- `OBSIDIAN_CLI_PATH` 환경변수로 binary 경로 override 가능
- `buildArgv()` — `vault=<name> <command> key=value` 형식 argv 구성
- `cleanOutput()` — ANSI escape code strip + trim
- `detectError()` — stdout에서 `Error:`, `No .* found`, `Cannot` 패턴 감지
- `tryParseJson()` — preamble line 스킵 후 JSON 파싱 시도

## Config (`src/config.ts`)

- 설정 파일: `~/.obsidian-cc-mcp/config.json`
- vault 우선순위: `OBSIDIAN_VAULT` ENV > runtime override > persisted config
- `loadConfig()` — 파일 읽기 (missing/invalid 시 silent)
- `setVault()` — runtime 변경 + 파일 persist

## Tool Registry & MCP Server (`src/tools.ts`, `src/index.ts`)

- `McpServer` (stdio transport) — `obsidian-vault-mcp` v0.1.0
- `registerTools()` — 18개 tool 일괄 등록 (zod schema + handler)
- `handleToolCall()` — 테스트용 name-based dispatch
- `getAllTools()` — 테스트용 tool 목록 조회

## CRUD Tools (`src/tools/crud.ts`) — 8개

| Tool | CLI Command | 설명 |
|------|------------|------|
| `read_note` | `read` | 노트 전체 내용 읽기 |
| `create_note` | `create` | 노트 생성 (path/name 자동 분기, overwrite 지원) |
| `update_note` | `append`/`prepend` | 노트 내용 추가 |
| `delete_note` | `delete` | 노트 삭제 (trash/permanent) |
| `move_note` | `move` | 노트 이동/이름 변경 |
| `set_property` | `property:set` | frontmatter 속성 설정 |
| `remove_property` | `property:remove` | frontmatter 속성 제거 |
| `daily_note` | `daily:read`/`daily:append` | 오늘 daily note 읽기/추가 |

## Search Tools (`src/tools/search.ts`) — 6개

| Tool | CLI Command | 설명 |
|------|------------|------|
| `search_notes` | `search` | 쿼리 검색 (tag, property, regex, boolean 연산자) |
| `list_tags` | `tags` | 전체 태그 + 사용 횟수 |
| `list_properties` | `properties` | 전체 frontmatter 속성 목록 |
| `get_backlinks` | `backlinks` | 특정 노트를 참조하는 노트들 |
| `find_orphans` | `orphans` | 링크 없는 고아 노트 |
| `eval_query` | `eval` | Obsidian API JS 코드 실행 |

## Vault Tools (`src/tools/vault.ts`) — 3개

| Tool | 설명 |
|------|------|
| `list_vaults` | 사용 가능한 vault 목록 (JSON) |
| `vault_info` | 현재 활성 vault 정보 |
| `set_vault` | vault 전환 + persist (ENV 설정 시 거부) |

## Helpers (`src/tools/helpers.ts`)

- `ok(text)` / `fail(text)` — `ToolResponse` 생성 헬퍼
- `vault()` — `getVault() ?? undefined` 래퍼

## Changed Files

| File | Change |
|------|--------|
| `package.json` | 프로젝트 메타, dependencies, scripts |
| `src/index.ts` | MCP server 엔트리포인트 (loadConfig → registerTools → stdio) |
| `src/types.ts` | 전체 타입 정의 |
| `src/cli.ts` | Obsidian CLI executor (execFile, ANSI strip, JSON parse) |
| `src/config.ts` | 설정 관리 (~/.obsidian-cc-mcp/config.json) |
| `src/tools.ts` | 18개 tool 레지스트리 + MCP 등록 |
| `src/tools/helpers.ts` | ok/fail/vault 헬퍼 |
| `src/tools/crud.ts` | CRUD tool 핸들러 8개 |
| `src/tools/search.ts` | Search tool 핸들러 6개 |
| `src/tools/vault.ts` | Vault tool 핸들러 3개 |

## Verification

- `npx tsc --noEmit` — pass
- `npx vitest run` — 109 tests pass (11 test files)
- MCP server stdio transport 정상 동작 확인
