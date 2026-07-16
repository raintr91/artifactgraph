---
name: artifactgraph
extractBundle: artifactgraph
description: /artifactgraph — local-first MCP (this package); index, gaps, allowlisted gen.
disable-model-invocation: true
---

# /artifactgraph

Package root: repo này · GitHub: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

**Docs trong package:** `docs/INIT.md` · `docs/INTERNALS.md` · `docs/ARCHITECTURE.md`  
**Hub overview (optional):** `@base-docs/platform/toolchain/ARTIFACTGRAPH.md`  
**Rule:** `artifactgraph.mdc` · hooks: `.cursor/extracts/artifactgraph-phase-hooks.md`

## Local-first

```text
rebuild(index) → analyze|grill|parity (LOCAL A/B/C)
  → artifactgraph_gen allowlist (product artifactgraph.json)
  → cloudPromptSlice ONLY if #needs-* still missing
  → promote registry in product repo → rebuild + remember
```

| Local | Không cloud |
|-------|-------------|
| Match từ index + lexicon | Dump full registry |
| `gen` / CLI allowlist keys | Viết registry từ cloud |
| Grill / parity A/B/C | Gen cả surface vì thiếu 1 slot |

## Tools (MCP + CLI)

`artifactgraph_projects` · `analyze` · `gaps` · `grill_check` · `parity_check` · `suggest_tags` · `gen` · `remember` · `rebuild` · `status`

`suggest_tags` lanes: `fe` | `docs` | `be` | `plans` (R2.1 registry-tags / R3.1 taxonomy). Fullstack monorepo: default `fe`, pass `lane=be` cho Nest/API half.

Paths: `platform-repos.json` → `@portal` / `@base-docs` / … — resolve qua map, không hardcode absolute.

## Dev package

```bash
npm run build && artifactgraph version
artifactgraph init-project --project portal && artifactgraph rebuild --project portal
```

Gen argv = allowlist trong product `artifactgraph.json` — không bịa lệnh.
