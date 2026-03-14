---
id: task-eval-query-replace-001-05
stage: plan
feature: eval-query-replace
title: "Update README"
created: 2026-03-14
updated: 2026-03-14
tags: [plan, eval-query-replace, subtask]
status: not-started
refs:
  - type: implements
    target: plan-eval-query-replace-001
  - type: based-on
    target: arch-eval-query-replace-001
decisions: []
---

# Subtask 05: Update README

## Description

Update `README.md` to reflect the eval_query removal and addition of 6 new query tools. Remove the guardrail security section, update the tool table, and update the project structure.

## Scope

- **Includes**: Tool table updates, security section removal, project structure update
- **Excludes**: Adding migration documentation for eval_query users (can be done in a follow-up)

## Dependencies

- Subtask 02 (wire-registry-and-remove-eval) must be complete — the tool registry must reflect the final state.

## Acceptance Criteria

- [ ] `eval_query` removed from the search tools table (line 197)
- [ ] Guardrail security section removed (lines 286–304, "### eval_query 가드레일" section)
- [ ] 6 new query tools documented in a new "쿼리 (6개)" table section
- [ ] Search tools count updated from 6 to 5 (eval_query removed)
- [ ] Project structure updated: `query.ts` added to `tools/` listing, `guardrail.ts` removed
- [ ] Tool count in `tools.ts` comment updated from 20 to 25

## Files to Create/Modify

| Action | Path | Description |
|--------|------|-------------|
| modify | `README.md` | Remove eval_query, add query tools, remove guardrail section, update structure |

## Implementation Notes

- The README is in Korean — all new content must be written in Korean to match
- New query tools section (add after search section):

  ```markdown
  ### 쿼리 (6개)

  | 도구 | 설명 |
  |------|------|
  | `list_files` | 볼트 파일 목록 조회 (폴더/확장자 필터) |
  | `list_links` | 노트의 아웃고잉 링크 목록 |
  | `find_deadends` | 아웃고잉 링크가 없는 노트 탐색 |
  | `find_unresolved` | 미해결(존재하지 않는 대상) 링크 탐색 |
  | `list_tasks` | 볼트 내 태스크 목록 (상태/파일 필터) |
  | `dataview_query` | Dataview DQL 쿼리 실행 (읽기 전용, 안전한 고정 템플릿) |
  ```

- Remove the entire "### eval_query 가드레일" section and its table
- In project structure: add `query.ts` line, remove any mention of `guardrail.ts`
- Update the "검색 (6개)" header to "검색 (5개)" and remove the eval_query row
