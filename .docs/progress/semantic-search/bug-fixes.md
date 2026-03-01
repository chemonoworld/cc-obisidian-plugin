---
feature: semantic-search
phase: progress
status: complete
date: 2026-03-01
---

# Semantic Search — Bug Fixes

plan 기반 구현 이후 발견/수정된 버그들을 시간순으로 정리.

## 1. `embedding.enabled` config gate 제거

**Commit**: `14a4969` — refactor: remove embedding.enabled config gate from semantic search

**문제**: 초기 설계에서 `config.embedding.enabled` 플래그로 semantic search를 on/off 했으나, optional dependencies가 없으면 자연스럽게 실패하므로 별도 gate가 불필요.

**수정**: config gate 로직 제거. dependency import 실패 시 에러 메시지로 안내.

## 2. Vault path fallback — `obsidian.json` 직접 읽기

**Commit**: `caa17a1` — fix: resolve vault path from obsidian.json when CLI lacks JSON support

**문제**: `resolveVaultPath()`가 Obsidian CLI의 `vaults` 명령어 JSON 출력에 의존했으나, 일부 CLI 버전에서 JSON 포맷을 지원하지 않아 vault path resolve 실패.

**수정**: CLI 실패 시 Obsidian의 `obsidian.json` 설정 파일을 직접 읽어 vault path를 resolve하는 fallback 추가. macOS/Windows/Linux 각 플랫폼 경로 분기 처리.

| File | Change |
|------|--------|
| `src/tools/semantic.ts` | `resolveVaultPath()`에 obsidian.json fallback 추가 |

## 3. `initEmbeddingStore` 에러 surfacing

**Commit**: `f792d48` — fix: surface actual error message when embedding store init fails

**문제**: `initEmbeddingStore()`가 에러 발생 시 `return false`로 실패를 삼키고, 호출부에서 generic "init failed" 메시지만 표시. 실제 원인(예: native module 빌드 실패)을 알 수 없음.

**수정**: catch 블록에서 `throw e`로 변경. 호출부(`semanticSearchTool`)에서 `e.message`를 포함한 구체적 에러 메시지 반환.

| File | Change |
|------|--------|
| `src/embeddings/index.ts` | `initEmbeddingStore()` catch에서 `throw e` |
| `src/tools/semantic.ts` | catch에서 `e.message` 포함한 에러 메시지 반환 |

## 4. sqlite-vec `chunk_id text primary key` 타입 어노테이션

**Commit**: `a152bcc` — fix: add type annotation to vec0 primary key for sqlite-vec compat

**문제**: vec0 virtual table 생성 시 `chunk_id primary key`로 선언하면 sqlite-vec가 기본 integer 타입으로 추론. text 타입 chunk_id(SHA-256 해시)와 불일치로 검색 결과 0건.

**수정**: `chunk_id text primary key`로 명시적 타입 어노테이션 추가.

| File | Change |
|------|--------|
| `src/embeddings/store.ts` | vec0 DDL에 `chunk_id text primary key` 타입 명시 |

## 5. Auto git-init

**Commit**: `d8b7cb6` — feat: auto-init git repo in vault for efficient change tracking

**문제**: Git 기반 change detection이 vault에 git repo가 없으면 hash fallback으로 전환되어 매번 전체 파일 해시 비교. 대형 vault에서 비효율적.

**수정**: `ensureGitRepo()` 함수 추가. vault에 git repo가 없으면 `git init -b main`으로 자동 생성하고, `core.quotePath=false` 설정.

| File | Change |
|------|--------|
| `src/embeddings/change.ts` | `ensureGitRepo()` 함수 추가, `detectChanges()`에서 호출 |

## 6. Auto-commit — untracked 파일 인덱싱 누락

**Commit**: `9a1a777` — fix: auto-commit vault changes before indexing and fix non-ASCII paths

**문제**: `git diff` 기반 change detection은 committed 파일만 감지. 새로 추가된(untracked) 마크다운 파일이 인덱싱에서 누락됨. 또한 `git status --porcelain` 출력에서 non-ASCII 파일명이 escaped되어 파일 경로 불일치.

**수정**:
1. `ensureGitRepo()`에서 `git add -A && git commit`으로 미커밋 변경사항 자동 커밋
2. `detectByGit()`에서 `core.quotePath=false` 설정으로 non-ASCII 파일명 그대로 출력
3. `git status --porcelain`으로 working tree의 untracked/modified 파일도 감지에 포함

| File | Change |
|------|--------|
| `src/embeddings/change.ts` | auto-commit 로직 + `core.quotePath=false` + `status --porcelain` 파싱 |

## 7. int8 → fp16 quantization

**Commit**: `e822a6c` — fix: use fp16 instead of int8 quantization for embedding model

**문제**: 초기 구현에서 `dtype: 'int8'` quantization을 사용했으나, 다국어(특히 한국어) 임베딩 품질이 현저히 떨어짐. Cross-lingual 유사도가 낮아 한국어 문서 검색 성능 저하.

**수정**: `dtype: 'fp16'`으로 변경. 모델 크기는 증가하지만 다국어 임베딩 품질 유지.

| File | Change |
|------|--------|
| `src/embeddings/model.ts` | `dtype: 'int8'` → `dtype: 'fp16'` |

## Verification

- `npx tsc --noEmit` — pass
- `npx vitest run` — 109 tests pass
- 각 fix별 E2E 검증 완료 (commit message 참조)
