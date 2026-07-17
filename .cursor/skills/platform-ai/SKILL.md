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

**Skill sync check:** đọc `harness.profiles.<profile>.skills` + `syncPolicy.mode=propose` — so `.cursor/skills` vs allowlist theo project (không sync all lanes). Groups: `code-fe` / `code-be` / `code-fullstack` / `docs` / `tests` / `mcp`.

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
| FE / UI | `fe`, `docs` | product-local `artifactgraph/lexicon/registry-tags.en.txt` |
| BE / API | `be` | R2.1 (`#api:`, `#needs-endpoint`, `#needs-dto`) |
| Test / plans | `plans` | product-local `artifactgraph/lexicon/testcase-taxonomy.en.txt` |

Registries SSOT trên product repo · `analyzeBullets` auto lane từ stack · chi tiết `/platform-mark`.

## MCP harness conventions (tham khảo)

Repo **artifactgraph** chỉ sở hữu package và harness `.cursor/` của chính nó. Mỗi MCP
khác tự sở hữu packaged harness và quy trình cài đặt riêng; không dùng ArtifactGraph
làm base, SSOT hoặc nguồn copy harness.

Các MCP có thể tham khảo convention lane **tooling** và governance trong
`platform-repos.json` · group `mcp`, nhưng không copy skill, rule, hook, extract,
registry bundle hoặc platform-mark DNA từ ArtifactGraph.

## Done

- [x] Chỉ 3 skill folders; rules = `platform-ai`, `artifactgraph`, `platform-code-size`, `team-flow-harness-state`
- [x] `platform-repos.json` harness khớp lane groups + `profiles.*.skills` + `syncPolicy`
- [x] Không copy `.cursor/` từ portal vào artifactgraph
