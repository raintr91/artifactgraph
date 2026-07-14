# Package bootstrap (curl / irm)

> **Member workflow (agents + product):** xem **[INIT.md](./INIT.md)** — lệnh chính là `artifactgraph init` / `init-project`.

Repo: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

## Ba bước

| Bước | Lệnh | Việc |
|------|------|------|
| 1 | `curl …/install.sh \| bash` | CLI trên PATH |
| 2 | **`artifactgraph init`** | Wire Cursor / Claude / Kilo (↑↓ · Space) |
| 3 | **`artifactgraph init-project`** | `artifactgraph.json` trong từng base |

## Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
artifactgraph version
artifactgraph init                    # interactive agents
# artifactgraph init --yes
cd ~/workspace/portal && artifactgraph init-project && artifactgraph rebuild
```

Uninstall package:

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash -s -- --uninstall
```

Defaults: tree → `~/.artifactgraph`, link → `~/.local/bin/artifactgraph`.  
Nếu có `~/workspace/portal` → ghi `workspace.path`.

## Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

WSL có sẵn → chạy `install.sh` trong WSL rồi gợi ý `artifactgraph init`.

## npx

```bash
cd /path/to/artifactgraph && npm i && npm run build
node bin/artifactgraph.mjs init --yes
node bin/artifactgraph.mjs init-project --project portal
```

## Alias

`artifactgraph install` → deprecated alias của `init` (agents).
