---
feature: semantic-search
phase: progress
status: complete
date: 2026-03-01
---

# Cross-Lingual Multi-Query Search

## Problem

bge-m3 모델의 cross-lingual 유사도가 same-language 대비 낮아서, 영어 쿼리로 한국어 문서를 검색하면 결과에서 밀린다. 테스트 기준 영어 "company"로 검색 시 한국어 문서 "엄준식 copy.md"가 rank 138/322로 사실상 검색 불가.

## Solution

MCP 호스트(LLM)가 번역된 쿼리를 `translations` 파라미터로 함께 넘기고, 플러그인이 다중 쿼리 검색 + 결과 병합을 수행.

## Changed Files

| File | Change |
|------|--------|
| `src/tools.ts` | `semantic_search` schema에 `translations: z.array(z.string()).optional()` 추가 |
| `src/tools/semantic.ts` | `translations` 파라미터를 `semanticSearch()`에 전달 |
| `src/embeddings/index.ts` | multi-query round-robin 병합 로직 구현 |
| `src/embeddings/model.ts` | `getQueryEmbedding()` 함수 추가 (기존 변경분) |
| `tests/embeddings/index.test.ts` | mock에 `getQueryEmbedding` 추가, assertion 수정 |

## Merge Strategy — Iteration Log

### 1차: Max-score 병합

각 쿼리 결과를 `filePath+chunkIndex` 기준으로 deduplicate, 최고 score 유지.

**결과**: 실패. 영어 쿼리 결과들이 절대 score가 높아서(56.4%) 한국어 결과(44.2%)가 항상 밀림. score 스케일이 언어마다 달라 직접 비교 불가.

### 2차: Reciprocal Rank Fusion (RRF)

`RRF score = sum(1/(k + rank))` — 순위 기반 병합으로 score 스케일 차이를 무시.

**결과**: 실패. 양쪽 쿼리에 모두 등장하는 노이즈 문서(Claude Code Skills 파일들)가 RRF 합산으로 항상 상위에 위치. 한국어에만 등장하는 "엄준식 copy.md"는 한쪽 기여만 있어서 밀림.

### 3차: Round-robin interleave (채택)

각 쿼리 결과를 순위별로 번갈아 뽑아 (rank 0 from q1, rank 0 from q2, rank 1 from q1, ...) 각 쿼리가 동등하게 슬롯을 차지하도록 보장. 중복은 skip.

**결과**: 성공.
- `company` + translations `["회사 취직 채용"]` → 엄준식 copy.md rank 12 (원래 138)
- 한국어 컨텍스트 추가 시 (`세이노의 가르침...`) → rank 2

## Key Insight

- bge-m3의 cross-lingual score는 same-language score와 스케일이 다르므로 score 기반 병합은 부적합
- 노이즈 문서가 모든 쿼리에 등장하면 RRF도 이들을 부스트함
- Round-robin은 각 쿼리에 동등한 슬롯을 보장하여, 특정 언어에서만 관련 있는 문서도 상위에 노출됨
- 호스트 LLM이 더 구체적인 번역(키워드 나열 등)을 제공할수록 성능 향상

## Verification

- `npx tsc --noEmit` — pass
- `npx vitest run` — 109 tests pass
- E2E: `semantic_search(query: "company", translations: ["회사 취직 채용"])` → 엄준식 copy.md rank 12
- E2E: `semantic_search(query: "세이노의 가르침...", translations: ["teachings of Sayno...", "세이노 취직 채용 회사..."])` → 엄준식 copy.md rank 2
- `semantic_search(query: "회사")` → 기존과 동일 (translations 없이 fast path)
