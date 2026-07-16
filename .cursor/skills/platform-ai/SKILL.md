---
name: platform-ai
extractBundle: platform-ai
description: /platform-ai — maintain MCP package + harness map (artifactgraph tooling lane).
disable-model-invocation: true
---

# /platform-ai — MCP tooling harness

Chỉ khi **sửa** package MCP, `platform-repos.json`, sync scripts, hoặc `.cursor/` **trong repo này** — không implement feature app / spec / E2E plans.

## Phạm vi repo này

| Giữ tại **artifactgraph** | Không làm chính tại đây |
|---------------------------|-------------------------|
| `src/`, `bin/`, `docs/`, `install.*` | `/prototype` `/wire` `/test` (portal) |
| `platform-repos.json` + `harness` + lane groups | `/spec` grill `/dynamics` (`base-docs`) |
| `scripts/sync-platform-repos-bases.py` (map only) | `/testcase` (`base-tests`) |
| `scripts/platform-workspace-from-repos.mjs` | `platform-base` (Nuxt — chỉ portal) |
| Skills: `platform-ai`, `platform-mark`, `artifactgraph` | Bulk copy `.cursor/` từ portal |

**SSOT:** map = `platform-repos.json` · harness `.cursor/` = chỉnh **tại repo này**.

## Scripts

```bash
python3 scripts/sync-platform-repos-bases.py          # propagate map → sibling bases
node scripts/platform-workspace-from-repos.mjs --group=mcp   # local workspace (gitignored)
./scripts/cursor-export-kilo                        # optional Kilo mirror
```

## Commands

| Command | Khi nào |
|---------|---------|
| `/platform-ai` | this — MCP package + harness |
| `/artifactgraph` | MCP tools, CLI, index, gen allowlist |
| `/platform-mark` | Tags/lexicon — lanes `fe` · `be` · `plans` (hub R2.1 / R3.1) |

Feature / spec / plans → workspace lane đúng (`--group=docs`, `code-fe`, …) — **một chat một lane**.

## Tag / vocabulary (3 lane nghiệp vụ)

| Lane | MCP `suggest_tags` | Hub lexicon |
|------|-------------------|-------------|
| FE / UI | `fe`, `docs` | R2.1 `registry-tags.en.txt` (@base-docs) |
| BE / API | `be` | R2.1 (`#api:`, `#needs-endpoint`, `#needs-dto`) |
| Test / plans | `plans` | R3.1 `testcase-taxonomy.en.txt` (@base-tests) |

Registries SSOT trên product repo · `analyzeBullets` auto lane từ stack · chi tiết `/platform-mark`.

## MCP harness template (tham khảo)

Repo **artifactgraph** = **base chuẩn** `.cursor/` cho mọi repo MCP (`hubdocs`, …). Không có script sync harness — khi phát triển MCP mới, **copy/adapt tay** từ đây:

| Copy gần nguyên | Đổi theo từng MCP |
|-----------------|-------------------|
| `platform-ai/`, `platform-mark/` | Skill chính: `artifactgraph/` → `<tên-mcp>/` |
| `platform-ai.mdc`, `platform-code-size.mdc`, `team-flow-harness-state.mdc` | Rule opt-in: `artifactgraph.mdc` → `<tên-mcp>.mdc` |
| `extracts/core/`, `platform-mark*`, registry bundles tooling | hooks / bundle MCP riêng |

Giữ lane **tooling**: không nhét skill code (`api`, `prototype`, …) hay docs (`spec`, `testcase`, …). Map workspace: `platform-repos.json` · group `mcp`.

## Done

- [x] Chỉ 3 skill folders; rules = `platform-ai`, `artifactgraph`, `platform-code-size`, `team-flow-harness-state`
- [x] `platform-repos.json` harness khớp lane groups
- [x] Không copy `.cursor/` từ portal vào artifactgraph
