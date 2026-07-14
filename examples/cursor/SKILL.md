---
name: artifactgraph
extractBundle: artifactgraph
description: /artifactgraph — local-first MCP (grill confirm local; cloud = compressed slice only).
disable-model-invocation: true
---

# /artifactgraph

Package: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

**Hub:** [ARTIFACTGRAPH](docs/operational/ARTIFACTGRAPH.md) · [INTERNALS](docs/operational/ARTIFACTGRAPH-INTERNALS.md)  
**Init guide:** package `docs/INIT.md` · hooks: `artifactgraph-phase-hooks.md` · rule `artifactgraph.mdc`

## Setup (once / machine + per product)

```bash
# Package on PATH
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash

# Wire agents — interactive ↑↓ · Space · Enter (global by default)
artifactgraph init
# artifactgraph init --yes
# artifactgraph init --target=cursor,claude,kilo --yes

# Wire THIS product repo
cd ~/workspace/portal   # or nextjs, …
artifactgraph init-project
artifactgraph rebuild
```

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

| Lệnh | Phạm vi |
|------|---------|
| `init` | Agents (Cursor / Claude / Kilo) — **không** phải từng feature repo |
| `init-project` | `artifactgraph.json` trong base hiện tại |
| `install` | Alias cũ của `init` (deprecated) |

## Local-first protocol

```text
analyze / grill_check / parity_check  →  member A/B/C (LOCAL)  →  gen allowlist
        →  cloudPromptSlice ONLY if still missing  →  register + remember
```

| Do locally | Do NOT use cloud for |
|------------|----------------------|
| Detect blocks / `#needs-component` candidates | Asking “common hay chỉ feature?” |
| Confirm blocks when not from legacy-spec | Asking “block sinh ra đúng không?” |
| **Parity-drift** (create≠edit, empty, FE≠BE) askUser | Dumping full design registry |
| Apply known `#shell` / `#common` / gen dry|write | Regenerating whole page when one slot missing |
| Wire Mo* already in registry | |

## Tools

`artifactgraph_projects` · `init` (MCP = product brownfield) · `rebuild` · `analyze` · `gaps` · `grill_check` · **`parity_check`** · `remember` (`kind=grill|parity`) · `gen` · `status`

## Parity / context-orphan

After `/legacy-spec`: `parity_check` ingest `parityFindings[]` + `contextOrphans[]`.  
- **parity-drift** → `askUser` A/B/C (ép thống nhất) + `remember`  
- **context-orphan** → warn only (`usesData` ⊄ `screenData`); không confirm. Extract `legacy/parity.md`.

## Phase skills

See **artifactgraph-phase-hooks.md**.
