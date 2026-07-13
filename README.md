# artifactgraph

Local MCP for **platform-bases**: analyze specs/bullets vs registries, `needs-*` gaps, grill confirms, allowlisted codegen — cloud only gets a small `cloudPromptSlice`.

- GitHub: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)
- Design: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Install (Win/WSL):** [docs/INSTALL.md](./docs/INSTALL.md)
- **Local-first flow:** [docs/INTERNALS.md](./docs/INTERNALS.md)
- **Parity (legacy drift):** [docs/PARITY.md](./docs/PARITY.md)
- **Cursor examples:** [examples/cursor/](./examples/cursor/) (rule + skill + phase hooks)

---

## Quick install (like CodeGraph)

**Linux / WSL**

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
artifactgraph version
artifactgraph install --target=cursor --yes
```

**Windows (PowerShell)** — prefers WSL if present

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

**npx**

```bash
npx --yes github:raintr91/artifactgraph
```

Requires **Node ≥ 22** (uses `node:sqlite`).

---

## What it does (local-first)

| Step | CLI / MCP tool |
|------|----------------|
| Map bases | `artifactgraph projects` / `artifactgraph_projects` |
| Wire Cursor | `artifactgraph install --target=cursor` |
| Wire product | `artifactgraph init` → `artifactgraph.json` |
| Index registries | `artifactgraph rebuild` |
| Preflight | `analyze` / `gaps` / `grill_check` / `parity_check` |
| Gen allowlist | `gen --command registryValidate` |

---

## CLI cheat sheet

```bash
artifactgraph version
artifactgraph install --target=cursor --yes
artifactgraph projects

cd ~/workspace/portal
artifactgraph init
artifactgraph rebuild
artifactgraph analyze --bullets "list hotels with status chip"
artifactgraph parity --findings examples/parity/sample-findings.yaml
artifactgraph gen --command registryValidate
```

Env: `ARTIFACTGRAPH_WORKSPACE` = folder containing `portal/`, `nextjs/`, …

---

## Source map (for learning / next MCP)

| Path | Meaning |
|------|---------|
| `install.sh` / `install.ps1` | curl / irm entrypoints |
| `bin/artifactgraph*.mjs` | PATH launchers |
| `src/mcp/*` | MCP stdio + tools |
| `src/cli.ts` | CLI twin |
| `src/install/cursor-mcp.ts` | merge `~/.cursor/mcp.json` |
| `src/analyze/*` | local intelligence |
| `stacks/*.json` | brownfield command presets |
| `platform-repos.json` | projectId → workspace relative root |

---

## License

MIT
