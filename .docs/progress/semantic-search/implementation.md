---
feature: semantic-search
phase: progress
status: complete
date: 2026-03-01
---

# Semantic Search — Implementation

7개 subtask 전체 구현 완료. Obsidian vault의 마크다운 파일을 로컬 임베딩 모델(bge-m3)로 벡터화하여 자연어 시맨틱 검색을 제공한다.

## Markdown Chunking (`src/embeddings/chunk.ts`)

- Heading-aware 분할: H2(`##`), H3(`###`) 기준으로 섹션 분리
- Heading hierarchy 유지: `H2 > H3` 형태로 heading label 구성
- Wiki-link 정규화: `[[Note|Display]]` → `Display`, `[[Note]]` → `Note`
- YAML frontmatter strip
- 토큰 기반 분할: 기본 512 토큰 (whitespace split × 1.3 추정)
- 대형 섹션 fallback: paragraph split → line split 순으로 세분화

## Vector Store (`src/embeddings/store.ts`)

- SQLite + sqlite-vec (vec0 virtual table)
- 1024 차원 float vector, cosine distance metric
- WAL mode 활성화
- 테이블 구조:
  - `chunks` — id (SHA-256), file_path, chunk_index, heading, content, content_hash, updated_at
  - `chunks_vec` — chunk_id (text primary key), embedding float[1024]
  - `index_meta` — key/value 메타 (last_commit 등)
- `StoreHandle` 인터페이스: upsertFile, deleteFile, search, getIndexedFiles, hasFile, getMeta, setMeta, close
- Transaction 기반 upsert: 기존 파일 데이터 삭제 → 새 chunks + vectors 삽입

## Embedding Model (`src/embeddings/model.ts`)

- `@huggingface/transformers` pipeline singleton
- 모델: `Xenova/bge-m3` (다국어 지원)
- dtype: `fp16` (다국어 품질 유지)
- CLS pooling + normalize
- `getEmbedding()` — 단일 텍스트 임베딩
- `getQueryEmbedding()` — 검색 쿼리 전용 (향후 쿼리 특화 처리 확장점)
- `getEmbeddings()` — 배치 임베딩 (array 입력 → 효율적 처리)
- lazy loading: 첫 호출 시 모델 로드, 이후 재사용

## Change Detection (`src/embeddings/change.ts`)

- Git 기반 증분 감지 (primary) + hash 기반 fallback
- `ensureGitRepo()`:
  - vault에 git repo 없으면 `git init -b main`으로 자동 생성
  - `core.quotePath=false` 설정 (한국어 등 non-ASCII 파일명 지원)
  - 미커밋 변경사항 자동 `git add -A && git commit`
- `detectByGit()`:
  - last_commit → HEAD diff로 변경 파일 감지 (A/M/D/R status)
  - `git status --porcelain`으로 working tree 변경사항 추가 감지 (untracked 포함)
- `detectByHash()`:
  - Git 없을 때 fallback — 전체 .md 파일 워크 + SHA-256 해시 비교
  - `.obsidian`, `node_modules`, `.git` 디렉토리 제외

## Facade Orchestrator (`src/embeddings/index.ts`)

- `initEmbeddingStore()` — DB 경로 resolve, store open, 디렉토리 자동 생성
  - 기본 경로: `<vault>/.obsidian/plugins/cc-plugin/embeddings.db`
- `semanticSearch()` — 검색 파이프라인:
  1. Change detection + incremental indexing (항상 실행, 저비용 git diff)
  2. Query embedding 생성
  3. Vector search (cosine similarity)
  4. Multi-query 지원: round-robin interleave 병합 (translations 파라미터)
- `indexVault()` — 변경 파일 처리:
  - 삭제된 파일 → store에서 제거
  - 추가/수정된 파일 → chunk → embed → upsert
  - `forceAll` 옵션으로 전체 재인덱싱 가능
- `closeStore()` — store 종료 + 상태 리셋

## MCP Tool Handler (`src/tools/semantic.ts`)

- `resolveVaultPath()` — vault name → filesystem path 변환:
  1. Obsidian CLI (`vaults` command, JSON 파싱)
  2. Fallback: `obsidian.json` 직접 읽기 (macOS/Windows/Linux 경로 분기)
- `semanticSearchTool()`:
  - vault 미설정 시 에러 메시지
  - store 미초기화 시 자동 init (실패 시 dependency 안내)
  - 결과 포맷: `### 1. filePath > heading (score% match)` + 내용 미리보기 (500자)
  - `translations` 파라미터 전달 (cross-lingual multi-query)

## Tool Registration (`src/tools.ts`)

- `semantic_search` tool 등록:
  - `query` (string, min 1) — 필수
  - `limit` (int, 1-50) — 선택, 기본 10
  - `reindex` (boolean) — 선택, 기본 false
  - `translations` (string[]) — 선택, cross-lingual 검색용

## Changed Files

| File | Change |
|------|--------|
| `src/embeddings/chunk.ts` | heading-aware markdown chunking (H2/H3, wiki-link, token split) |
| `src/embeddings/store.ts` | SQLite + vec0 vector store (1024 dim, cosine, WAL) |
| `src/embeddings/model.ts` | HuggingFace pipeline singleton (bge-m3, fp16, CLS pooling) |
| `src/embeddings/change.ts` | Git 기반 change detection (auto-init, auto-commit, quotePath) |
| `src/embeddings/index.ts` | facade orchestrator (init, index, search, multi-query merge) |
| `src/tools/semantic.ts` | MCP tool handler (vault path resolution, error surfacing) |
| `src/tools.ts` | semantic_search tool 등록 (translations 파라미터 포함) |
| `src/types.ts` | `EmbeddingConfig` 타입 추가 |

## Verification

- `npx tsc --noEmit` — pass
- `npx vitest run` — 109 tests pass (11 test files)
- E2E: `semantic_search(query: "회사")` → 관련 한국어 문서 상위 노출
- E2E: `semantic_search(query: "company", translations: ["회사"])` → cross-lingual 결과 병합
