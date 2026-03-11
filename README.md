# obsidian-vault-mcp

Obsidian 볼트를 MCP(Model Context Protocol) 서버로 연결하는 플러그인입니다.
LLM 클라이언트(Claude Code, Claude Desktop 등)에서 Obsidian 노트를 직접 읽고, 쓰고, 검색할 수 있습니다.

## 주요 기능

- **노트 CRUD** — 읽기, 생성, 수정, 삭제, 이동, 프론트매터 관리
- **검색** — 풀텍스트 검색, 태그/프로퍼티 필터, 정규식, 백링크, 고아 노트 탐색
- **시맨틱 검색** — 로컬 임베딩 모델(`bge-m3`)을 이용한 자연어 유사도 검색
- **크로스링구얼 검색** — 번역된 쿼리를 함께 전달하여 다국어 검색 지원
- **자동 링크** — 노트 내용에서 다른 노트 이름 언급을 찾아 `[[위키 링크]]` 자동 삽입
- **리인덱싱** — 임베딩 인덱스를 명시적으로 재구축
- **볼트 관리** — 볼트 전환, 목록 조회, 정보 확인

## 전제 조건

- **Node.js** 20 이상
- **Obsidian CLI** ([Obsidian CLI 문서](https://obsidian.md) 참고)
- Obsidian 볼트가 하나 이상 존재

## 설치

```bash
git clone <repo-url>
cd obsidian-vault-mcp
npm install
npm run build
```

### 시맨틱 검색 활성화 (선택)

시맨틱 검색 기능을 사용하려면 선택적 의존성을 설치합니다:

```bash
npm install @huggingface/transformers better-sqlite3 sqlite-vec
```

- 첫 실행 시 `Xenova/bge-m3` 모델을 자동 다운로드합니다 (약 1.2GB)
- 임베딩 DB는 `<볼트>/.obsidian/plugins/cc-plugin/embeddings.db`에 저장됩니다

## MCP 클라이언트 설정

### Claude Code

프로젝트 루트의 `.mcp.json` 또는 `~/.claude/claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-vault-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop

`Settings > MCP Servers`에서 위와 동일한 설정을 추가합니다.

## 도구 목록

### 노트 CRUD (8개)

| 도구 | 설명 |
|------|------|
| `read_note` | 노트의 마크다운 내용 읽기 |
| `create_note` | 새 노트 생성 |
| `update_note` | 노트에 내용 추가 (append/prepend) |
| `delete_note` | 노트 삭제 (기본: 휴지통으로 이동) |
| `move_note` | 노트 이동 또는 이름 변경 |
| `set_property` | 프론트매터 프로퍼티 설정 |
| `remove_property` | 프론트매터 프로퍼티 제거 |
| `daily_note` | 오늘의 데일리 노트 읽기/추가 |

### 검색 (6개)

| 도구 | 설명 |
|------|------|
| `search_notes` | 풀텍스트 검색 (태그, 프로퍼티, 정규식, 불리언 지원) |
| `list_tags` | 볼트 내 모든 태그와 사용 횟수 |
| `list_properties` | 사용 중인 프론트매터 프로퍼티 목록 |
| `get_backlinks` | 특정 노트를 링크하는 노트들 조회 |
| `find_orphans` | 들어오는 링크가 없는 고아 노트 탐색 |
| `eval_query` | Obsidian API(`app` 객체)에 JavaScript 실행 |

### 시맨틱 검색 & AI (3개)

| 도구 | 설명 |
|------|------|
| `semantic_search` | 자연어 유사도 기반 검색. `translations` 파라미터로 다국어 검색 지원 |
| `reindex` | 임베딩 인덱스 재구축 (전체/증분) |
| `auto_link` | 노트 내용에서 다른 노트명 언급을 찾아 `[[위키 링크]]` 자동 삽입 |

### 볼트 관리 (3개)

| 도구 | 설명 |
|------|------|
| `set_vault` | 활성 볼트 전환 (`~/.obsidian-cc-mcp/config.json`에 저장) |
| `list_vaults` | 사용 가능한 볼트 목록 |
| `vault_info` | 현재 활성 볼트 정보 |

## 사용 예시

LLM 클라이언트에서 자연스럽게 대화하면 됩니다:

```
"내 볼트에서 '프로젝트 계획'이랑 관련된 노트 찾아줘"
→ semantic_search(query="프로젝트 계획")

"오늘 데일리 노트에 회의록 추가해줘"
→ daily_note(action="append", content="## 회의록\n- ...")

"이 노트에서 다른 노트로 링크 걸 수 있는 거 자동으로 연결해줘"
→ auto_link(file="Meeting Notes", dry_run=true)

"시맨틱 인덱스 다시 만들어줘"
→ reindex(force=true)
```

### 검색 연산자

`search_notes`는 다양한 연산자를 지원합니다:

```
tag:#work                    태그 검색
[status:active]              프론트매터 프로퍼티 검색
[priority:>3]                수치 비교
path:"Projects/Active"       폴더 경로 필터
/정규식패턴/                  정규식 검색
task-todo:keyword            미완료 태스크 검색
meeting AND notes            불리언 검색
meeting -cancelled           제외 검색
```

### 크로스링구얼 검색

시맨틱 검색은 다국어 쿼리를 동시에 검색하여 결과를 라운드로빈으로 병합합니다:

```
semantic_search(
  query="프로젝트 관리",
  translations=["project management", "プロジェクト管理"]
)
```

## 프로젝트 구조

```
src/
  index.ts              # MCP 서버 엔트리포인트
  tools.ts              # 도구 레지스트리 (20개 도구 등록)
  config.ts             # 볼트 설정 관리
  cli.ts                # Obsidian CLI 래퍼
  types.ts              # 공통 타입 정의
  tools/
    crud.ts             # 노트 CRUD 핸들러
    search.ts           # 검색 도구 핸들러
    vault.ts            # 볼트 관리 핸들러
    semantic.ts         # 시맨틱 검색 + 리인덱싱 핸들러
    auto-link.ts        # 자동 링크 핸들러
    helpers.ts          # ok(), fail() 유틸리티
  embeddings/
    index.ts            # 임베딩 파사드 (검색, 인덱싱)
    store.ts            # SQLite + sqlite-vec 벡터 스토어
    model.ts            # HuggingFace 임베딩 모델 (bge-m3, fp16)
    chunk.ts            # 마크다운 청킹 (헤딩 기반 분할)
    change.ts           # 변경 감지 (Git 기반 + 해시 폴백)
tests/                  # Vitest 테스트
```

## 개발

```bash
npm run dev          # tsc --watch 모드
npm test             # 테스트 실행
npm run build        # 빌드
```

## 기술 스택

- **TypeScript** — 타입 안전한 구현
- **MCP SDK** — `@modelcontextprotocol/sdk` 기반 서버
- **Zod** — 도구 파라미터 스키마 검증
- **HuggingFace Transformers** — 로컬 임베딩 모델 (`Xenova/bge-m3`)
- **SQLite + sqlite-vec** — 벡터 유사도 검색 (코사인 거리)
- **Vitest** — 테스트 프레임워크

## 라이선스

MIT
