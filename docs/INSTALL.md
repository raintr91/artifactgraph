# Install — Linux/WSL vs Windows

Repo: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

Mirrors CodeGraph UX: **curl** on Linux, **irm** on Windows (prefers WSL).

## Linux / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash
# new shell if needed
artifactgraph version
artifactgraph install --target=cursor --yes
```

Uninstall:

```bash
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash -s -- --uninstall
```

Defaults: install → `~/.artifactgraph`, link → `~/.local/bin/artifactgraph`.  
If `~/workspace/portal` exists, writes `workspace.path` automatically.

## Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

- If **WSL** is available: runs Linux `install.sh` inside WSL, then wires Cursor MCP with `--wsl` (Cursor on Win → MCP via `wsl.exe`).
- Else: native clone under `%LOCALAPPDATA%\artifactgraph` (needs Node ≥ 22 + git + npm).

Force native Win: `$env:ARTIFACTGRAPH_USE_WSL='0'; irm … | iex`

## npx (no global install)

```bash
npx --yes github:raintr91/artifactgraph artifactgraph version
# after clone locally:
cd /path/to/artifactgraph && npm i && npm run build
node bin/artifactgraph.mjs install --target=cursor --yes
```

## Per product repo

```bash
cd ~/workspace/portal   # or any base
artifactgraph init
artifactgraph rebuild
artifactgraph status
```

Or by map id:

```bash
artifactgraph init --project portal
artifactgraph rebuild --project portal
```

Set bases folder if not auto-detected:

```bash
export ARTIFACTGRAPH_WORKSPACE=$HOME/workspace
```

## Cursor MCP

`artifactgraph install --target=cursor --yes` merges into `~/.cursor/mcp.json`.

Windows Cursor + WSL install:

```bash
artifactgraph install --target=cursor --yes --wsl --mcp-file /mnt/c/Users/<you>/.cursor/mcp.json
```

Restart Cursor → tools `artifactgraph_*`.

## Dev checkout (this monorepo sibling)

```bash
cd ~/workspace/artifactgraph
npm install && npm run build
./bin/artifactgraph.mjs version
./bin/artifactgraph.mjs install --target=cursor --yes
```
