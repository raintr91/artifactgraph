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

Global uninstall:

```bash
artifactgraph uninstall              # preview + TTY confirmation
artifactgraph uninstall --yes        # all tracked repos + MCP + CLI
```

Defaults: tree → `~/.artifactgraph`, link → `~/.local/bin/artifactgraph`.  
Nếu có workspace platform, installer có thể ghi `workspace.path` cho tooling
inventory; runtime và `init` không dùng file này để chọn repo.

`artifactgraph init` records each destination repo in the XDG state ledger
(`$XDG_STATE_HOME/artifactgraph/installs.json`, with
`ARTIFACTGRAPH_STATE_DIR` override). This lets global uninstall run from any
directory. For older installs without ledger entries:

```bash
artifactgraph uninstall --discover ~/workspace --yes
```

Use `artifactgraph deinit [--yes]` inside one destination repo to remove only
its owned harness and local MCP wiring. Both lifecycle commands are dry-run
without `--yes`; modified managed files are preserved and reported. Shared
agent configs are unmerged key-by-key rather than deleted.

If the CLI itself cannot run, the bootstrap fallback
`bash install.sh --uninstall` removes only the CLI tree and links.

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
