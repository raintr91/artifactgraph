# DONE — `artifactgraph init` tự merge `.gitignore`

**Hoàn thành:** 2026-07-19. Contract theo Platform DNA semantics (ported standalone,
không phụ thuộc sibling checkout).

Repo đích không hand-maintain ignore của ArtifactGraph. `init` merge đúng
artifact local mà ArtifactGraph thực sự sinh ra.

## ArtifactGraph ownership

- Harness/skills/rules do ArtifactGraph ghi vào agent adapter (hiện Cursor:
  `.cursor/`).
- Install state/cache: `.artifactgraph/`; local config `artifactgraph.json` nếu
  init thực sự sinh file này.
- Agent/MCP wiring: chỉ local path được chọn và thực sự được ghi.

## Đã làm

- [x] Khai `generatedTargets` / `desiredGitignorePatterns` + `applyGeneratedGitignore`
      một nguồn cho init/status/deinit (`src/install/gitignore.ts`).
- [x] Merge exact actual-written local targets vào `.gitignore` theo contract
      Platform DNA (canonical equivalence, idempotent, EOL preserve); không thêm
      path agent không chọn / global ngoài repo.
- [x] Shared vs exclusive: `.cursor/` và agent MCP paths = shared; `.artifactgraph/`,
      `artifactgraph/`, `artifactgraph.json` (khi create) = exclusive.
- [x] Manifest ghi exact ignore entries (`gitignore[]`); `status` báo thiếu.
- [x] Deinit gỡ exclusive owned entries nhưng giữ shared (không phá toolkit khác).
- [x] Legacy marker block `# >>> artifactgraph generated files` được strip trên init.
- [x] Tests: init hai lần; local/global; multi-toolkit `.cursor/`; deinit giữ shared;
      CRLF; equivalence; routing guidance. **37 pass, 0 fail**.

## Out of scope

CodeGraph là tool ngoài; không quản lý `.codegraph*`.

## Cross-repo index routing (skill/rule)

Cross-repo index không gộp thành một graph khổng lồ. Cross = skill/rule biết gọi
**đúng index của repo cần**, per-repo.

- [x] Sửa skill/rule/lane hooks để route đúng nguồn:
  - Architecture ID / C4 path → Hubdocs (`HUBDOCS_ROOT`), không CodeGraph.
  - IR / registry / gen → pointer kit (`CODEGENKIT_DOCS_ROOT`,
    `TESTKIT_DOCS_ROOT`, `TESTKIT_TESTS_ROOT`).
  - Symbol / call-graph của repo X → MCP CodeGraph của repo X
    (`codegraph-<key>`, `--project-root` = checkout X).
- [x] Không bắt member tự ghi `.cursor/mcp.json` cho CodeGraph: **Platform DNA**
      owns map-based auto-wire từ `platform-repos.local.json` /
      `legacy-repos.local.json`. ArtifactGraph **không** đọc map, không scan
      workspace, không wire `codegraph-<key>`.
- [x] ArtifactGraph local-only: không dùng AG docs làm index chung cho repo khác.

Contract/SSOT: `../platform-dna/TODO-GITIGNORE.md` section `Cross-repo index routing`.
