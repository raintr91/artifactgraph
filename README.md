# artifactgraph

Local MCP for **platform-bases**: analyze specs/bullets vs registries, `needs-*` gaps, grill confirms, allowlisted codegen — cloud only gets a small `cloudPromptSlice`.

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
artifactgraph version
artifactgraph init                    # ↑↓ · Space · Enter — Cursor / Claude / Kilo
cd ~/workspace/portal && artifactgraph init-project && artifactgraph rebuild
```

**Windows**

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

Requires **Node ≥ 22** (`node:sqlite`).

---

## Versions (chọn bản)

| Version | Dùng khi | Cách lấy |
|---------|----------|----------|
| **v1.0.0** | Base / project nhỏ đang ổn với package cũ trên `main` tại thời điểm tag | `git checkout v1.0.0` · hoặc pin install vào tag này |
| **v2.0.0** (`release/2.0.0`) | Harness map + lexicon lanes FE/BE/docs/plans + tooling `.cursor` SSOT | Branch/PR này · sau merge: `main` |

```bash
# Giữ v1 (không nâng)
git clone … artifactgraph && cd artifactgraph && git checkout v1.0.0 && npm run build

# Thử v2
git checkout release/2.0.0 && npm run build && artifactgraph version   # → 2.0.0
```

---

## Commands

| Step | CLI |
|------|-----|
| Wire agents (global/local) | `artifactgraph init` |
| Wire product repo | `artifactgraph init-project` |
| Index registries | `rebuild` |
| Preflight | `analyze` / `gaps` / `parity` |
| Gen allowlist | `gen --command …` |

`install` = deprecated alias của `init`.

---

## License

MIT
