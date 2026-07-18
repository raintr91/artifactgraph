# artifactgraph

Standalone local MCP for any product repo: analyze specs/bullets vs local
registries, suggest tags, confirm gaps, and run allowlisted codegen. Cloud only
gets a small `cloudPromptSlice`.

- GitHub: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)
- **Init (agents + product):** [docs/INIT.md](./docs/INIT.md)
- **Package bootstrap:** [docs/INSTALL.md](./docs/INSTALL.md)
- Design: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Local-first: [docs/INTERNALS.md](./docs/INTERNALS.md)
- Parity: [docs/PARITY.md](./docs/PARITY.md)

---

## Quick start

**Linux / WSL**

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
cd /path/to/product
artifactgraph init                    # choose agents, then docs/fe/be/test/all
artifactgraph rebuild
```

**Windows**

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

Requires **Node ≥ 22** (`node:sqlite`).

---

## Standalone runtime

- MCP is pinned to the repository where `artifactgraph init` ran.
- Product tools use that repo directly; they do not require `projectId`,
  `platform-repos.json`, `base-docs`, or `base-tests`.
- Config, lexicons, registries, generated harness files, and the SQLite index
  are project-local.
- MCP package repositories do not ship or own workspace project maps.

The package installer does not initialize an arbitrary repository. Run
`artifactgraph init` separately from each repo where ArtifactGraph is wanted.

### Lane policy

- **Docs is the canonical registry/parity hub** and the default ArtifactGraph
  home (`--type=common,docs`).
- FE/BE/tests installs index that repo only and are useful only for local
  tag/allowlist hints.
- ArtifactGraph never follows `HUBDOCS_ROOT` or `CODEGENKIT_DOCS_ROOT`.
  Codegenkit uses its docs pointer for canonical FE IR/registries; Hubdocs uses
  its own pointer for architecture ID lookups.

---

## Versions (chọn bản)

| Version | Dùng khi | Cách lấy |
|---------|----------|----------|
| **v1.0.0** | Base / project nhỏ đang ổn với package cũ trên `main` tại thời điểm tag | `git checkout v1.0.0` · hoặc pin install vào tag này |
| **v2.0.1** (`release/2.0.0`) | v2 standalone runtime + contract-safe install manifest lifecycle | Branch/PR này · sau merge: `main` |

```bash
# Giữ v1 (không nâng)
git clone … artifactgraph && cd artifactgraph && git checkout v1.0.0 && npm run build

# Thử v2
git checkout release/2.0.0 && npm run build && artifactgraph version   # → 2.0.1
```

---

## Commands

| Step | CLI |
|------|-----|
| Wire agents + initialize/update current repo | `artifactgraph init` |
| Non-interactive init | `artifactgraph init --target=cursor --type=fe --yes` |
| Remove unchanged stale harness assets | `prune` (dry-run) / `prune --yes` |
| Index registries | `rebuild` |
| Preflight | `analyze` / `gaps` / `parity` |
| Command recommendation | `recommend-command --command …` / `allowlist-check --command …` |
| Deprecated executable shim | `gen --command …` (2.x compatibility only; owning kit executes in next major) |

`install` and `init-project` are deprecated compatibility aliases of `init`.

---

## License

MIT
