# Remaining Manual Tests

## 6. Vault Path Fallback
- Obsidian CLI (`obsidian` 명령어) 없는 환경에서 `obsidian.json` 직접 읽기 fallback 동작 확인
- macOS: `~/Library/Application Support/obsidian/obsidian.json`
- Windows: `%APPDATA%/obsidian/obsidian.json`
- Linux: `~/.config/obsidian/obsidian.json`
- 관련 코드: `src/tools/semantic.ts` → `resolveVaultPath()`

## 7. Edge Cases
- 빈 vault (.md 파일 없음) → "No results found" 정상 반환, 크래시 없음
- 큰 노트 (>10KB) → 청킹 정상 동작, 모든 chunks 인덱싱 확인
- 관련 코드: `src/embeddings/chunk.ts` → `chunkMarkdown()`
