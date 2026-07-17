# Package bootstrap (curl / irm)

> **Member workflow:** xem **[INIT.md](./INIT.md)** — lệnh chính là `artifactgraph init`.

Repo: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

## Hai bước

| Bước | Lệnh | Việc |
|------|------|------|
| 1 | `curl …/install.sh \| bash` | CLI trên PATH |
| 2 | **`cd <repo> && artifactgraph init`** | Wire agents + config + lexicon + MCP DNA |

## Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
artifactgraph version
cd /path/to/product
artifactgraph init                    # interactive agents + type
artifactgraph rebuild
```

Uninstall package:

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash -s -- --uninstall
```

Defaults: tree → `~/.artifactgraph`, link → `~/.local/bin/artifactgraph`.  
Nếu có workspace platform, installer có thể ghi `workspace.path` cho tooling
inventory; runtime và `init` không dùng file này để chọn repo.

## Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

WSL có sẵn → chạy `install.sh` trong WSL. Sau đó vào từng repo đích và chạy
`artifactgraph init`; installer không tự khởi tạo một cwd hoặc repo bất kỳ.

## npx

```bash
cd /path/to/artifactgraph && npm i && npm run build
cd /path/to/product
node /path/to/artifactgraph/bin/artifactgraph.mjs init --target=cursor --type=fe --yes
```

## Alias

`artifactgraph install` and `init-project` are deprecated compatibility aliases.
