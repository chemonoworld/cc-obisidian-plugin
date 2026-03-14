# obsidian-foundry

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

## 사전 설치 (macOS)

### 1. Node.js 20+

```bash
# Homebrew로 설치
brew install node

# 또는 nvm 사용
nvm install 20
nvm use 20

# 버전 확인
node --version   # v20.x 이상
```

### 2. Obsidian CLI

Obsidian 앱에 내장된 CLI를 활성화해야 합니다.

1. Obsidian 앱을 열고 **Settings > General** 이동
2. **"Enable Obsidian URI"** 활성화
3. 터미널에서 CLI 심볼릭 링크 생성:

```bash
# Obsidian CLI를 PATH에 연결
sudo ln -sf "/Applications/Obsidian.app/Contents/MacOS/Obsidian" /usr/local/bin/obsidian

# 동작 확인
obsidian --help
```

> Obsidian 데스크톱 앱이 먼저 설치되어 있어야 합니다. [obsidian.md](https://obsidian.md)에서 다운로드하세요.

### 3. Xcode Command Line Tools (시맨틱 검색 사용 시)

시맨틱 검색은 네이티브 SQLite 모듈(`better-sqlite3`)을 컴파일하므로 C++ 빌드 도구가 필요합니다:

```bash
xcode-select --install
```

## 설치

### npm 글로벌 설치 (권장)

```bash
npm install -g obsidian-foundry

# 설치 확인
obsidian-foundry --help
```

### GitHub에서 직접 설치

```bash
npm install -g chemonoworld/cc-obisidian-plugin
```

### 소스에서 설치

```bash
git clone https://github.com/chemonoworld/cc-obisidian-plugin.git
cd cc-obisidian-plugin
npm install
npm run build

# 글로벌 링크 등록 (선택)
npm link
```

### 시맨틱 검색 활성화 (선택)

시맨틱 검색 기능을 사용하려면 선택적 의존성을 설치합니다:

```bash
npm install @huggingface/transformers better-sqlite3 sqlite-vec
```

- 첫 실행 시 `Xenova/bge-m3` 모델을 자동 다운로드합니다 (약 1.2GB)
- 모델은 `~/.cache/huggingface/hub/`에 캐시되며, 이후에는 재다운로드 없이 사용됩니다
- 임베딩 DB는 `<볼트>/.obsidian/plugins/cc-plugin/embeddings.db`에 저장됩니다

## MCP 클라이언트 설정

### Claude Code

Claude Code에서 MCP 서버를 등록하는 방법은 두 가지입니다.

**방법 1: CLI 명령어로 등록 (가장 간단)**

```bash
# npm 글로벌 설치한 경우
claude mcp add obsidian-vault -- obsidian-foundry

# 소스에서 설치한 경우
claude mcp add obsidian-vault -- node /path/to/cc-obisidian-plugin/dist/index.js
```

**방법 2: 설정 파일 직접 편집**

`~/.claude/mcp.json`에 추가하면 모든 프로젝트에서 사용 가능합니다:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "type": "stdio",
      "command": "obsidian-foundry"
    }
  }
}
```

특정 프로젝트에서만 사용하려면 프로젝트 루트에 `.mcp.json`을 생성합니다:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "obsidian-foundry"
    }
  }
}
```

> 소스에서 설치하고 `npm link`를 하지 않은 경우, `"command": "obsidian-foundry"` 대신 `"command": "node"`, `"args": ["/절대경로/dist/index.js"]`를 사용하세요.

**설정 확인:**

```bash
# 등록된 MCP 서버 목록 확인
claude mcp list

# Claude Code 실행 후 도구 사용 테스트
claude
> 내 볼트 목록 보여줘
```

### Claude Desktop

1. **Settings** (좌측 하단 톱니바퀴) > **Developer** > **Edit Config** 클릭
2. `claude_desktop_config.json` 파일에 아래 내용 추가:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "obsidian-foundry"
    }
  }
}
```

3. Claude Desktop을 **재시작**합니다
4. 채팅창 하단의 도구 아이콘(망치 모양)에 `obsidian-vault` 도구가 표시되면 성공입니다

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

### 검색 (5개)

| 도구 | 설명 |
|------|------|
| `search_notes` | 풀텍스트 검색 (태그, 프로퍼티, 정규식, 불리언 지원) |
| `list_tags` | 볼트 내 모든 태그와 사용 횟수 |
| `list_properties` | 사용 중인 프론트매터 프로퍼티 목록 |
| `get_backlinks` | 특정 노트를 링크하는 노트들 조회 |
| `find_orphans` | 들어오는 링크가 없는 고아 노트 탐색 |

### 쿼리 (6개)

| 도구 | 설명 |
|------|------|
| `list_files` | 볼트 내 파일 목록 (폴더, 확장자 필터 지원) |
| `list_links` | 특정 노트의 아웃고잉 링크 목록 |
| `find_deadends` | 아웃고잉 링크가 없는 데드엔드 노트 탐색 |
| `find_unresolved` | 존재하지 않는 노트를 가리키는 미해결 링크 탐색 |
| `list_tasks` | 볼트 내 태스크(체크박스) 목록 (파일, 완료 상태 필터) |
| `dataview_query` | Dataview DQL 쿼리 실행 (Dataview 플러그인 필요) |

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
  tools.ts              # 도구 레지스트리 (25개 도구 등록)
  config.ts             # 볼트 설정 관리
  cli.ts                # Obsidian CLI 래퍼
  types.ts              # 공통 타입 정의
  tools/
    crud.ts             # 노트 CRUD 핸들러
    search.ts           # 검색 도구 핸들러
    query.ts            # 쿼리 도구 핸들러 (파일, 링크, 태스크, Dataview DQL)
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

## 보안

- 모든 CLI 호출은 `execFile`을 사용하여 셸 인젝션을 방지합니다
- `dataview_query`는 고정된 JavaScript 템플릿을 사용하며, 사용자 입력은 DQL 쿼리 문자열로만 제한됩니다 (`JSON.stringify`로 안전하게 삽입)
- 임의의 JavaScript 실행 기능(`eval_query`)은 보안상의 이유로 제거되었습니다

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

## 트러블슈팅

### Obsidian CLI를 찾을 수 없음

```
Error: Obsidian CLI not found
```

Obsidian CLI가 설치되어 있고 `PATH`에 포함되어 있는지 확인하세요. Obsidian 앱이 설치되어 있어야 합니다.

### better-sqlite3 빌드 실패

```
Error: better-sqlite3 is not installed
```

네이티브 C++ 빌드 도구가 필요합니다:
- macOS: `xcode-select --install`
- Linux: `sudo apt install build-essential python3`
- Windows: Visual C++ Build Tools 설치

설치 후 다시 시도: `npm install better-sqlite3`

### 임베딩 모델 다운로드 실패/지연

첫 시맨틱 검색 실행 시 `Xenova/bge-m3` 모델(약 1.2GB)을 자동 다운로드합니다.

- **네트워크 오류**: 인터넷 연결을 확인하세요
- **디스크 공간 부족**: 모델은 `~/.cache/huggingface/hub/`에 캐시됩니다. 충분한 공간을 확보하세요
- **다운로드가 느린 경우**: 모델 크기가 크므로 첫 다운로드에 시간이 걸릴 수 있습니다. 이후에는 캐시를 사용합니다

## 라이선스

MIT
