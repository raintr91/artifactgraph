# artifactgraph init — guide chi tiết

Repo: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

## Ba bước (đừng nhầm)

| Bước | Lệnh | Phạm vi | Việc làm |
|------|------|---------|----------|
| 1. Package trên PATH | `curl …/install.sh \| bash` | Máy | Clone + build CLI `artifactgraph` |
| 2. Wire **agents** | **`artifactgraph init`** | Máy (global) hoặc cwd (local) | Ghi MCP vào Cursor / Claude / Kilo |
| 3. Wire **product repo** | **`artifactgraph init-project`** | Từng base (portal, …) | Ghi `artifactgraph.json` + sau đó `rebuild` |

`init` **không** gắn một feature/repo product — mặc định là **tổng thế** (`--location=global`).

Alias cũ: `artifactgraph install` → gọi `init` (có note deprecated).

---

## `artifactgraph init` (agents)

### Interactive (khuyến nghị cho member)

```bash
artifactgraph init
```

```text
artifactgraph init — wire MCP into agents

Which agents should get artifactgraph MCP?
  (↑↓ move · Space toggle · a all · Enter confirm)
 ❯ ◉ Cursor  (detected)
   ◯ Claude Code
   ◉ Kilo Code  (detected)

Install location?
 ❯ ● global — ~/.cursor · ~/.claude.json · ~/.kilocode (all projects)
   ○ local — .cursor / .claude.json / .kilocode in this repo only
```

| Phím | Việc |
|------|------|
| ↑ / ↓ (hoặc `k` / `j`) | Di chuyển |
| **Space** | Bật/tắt agent đang trỏ |
| `a` | Chọn / bỏ hết |
| **Enter** | Xác nhận |
| Ctrl+C | Huỷ |

Agent **detected** (đã có thư mục/`mcp` trước đó) được pre-check sẵn.

### Non-interactive (CI / script)

```bash
artifactgraph init --yes                              # auto-detect, global
artifactgraph init --target=cursor,claude,kilo --yes
artifactgraph init --target=auto --location=local --yes
artifactgraph init --print-config kilo                # in snippet, không ghi file
```

| Flag | Giá trị | Mặc định |
|------|---------|----------|
| `--target` | `auto` · `all` · `none` · csv `cursor,claude,kilo` | prompt / với `--yes` = `auto` |
| `--location` | `global` · `local` | `global` |
| `--yes` | bỏ prompt | — |
| `--wsl` | Cursor Win → chạy MCP qua `wsl.exe` | — |
| `--print-config <id>` | in JSON snippet | — |
| `--mcp-file <path>` | ghi thẳng 1 file (legacy, coi như cursor) | — |

### File được ghi

| Agent | `--location=global` | `--location=local` |
|-------|---------------------|--------------------|
| Cursor | `~/.cursor/mcp.json` | `./.cursor/mcp.json` |
| Claude Code | `~/.claude.json` (+ optional `~/.claude/settings.json` allow `mcp__artifactgraph__*`) | `./.claude.json` |
| Kilo Code | `~/.kilocode/mcp.json` | `./.kilocode/mcp.json` |

Entry MCP (stdio):

```json
{
  "mcpServers": {
    "artifactgraph": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": ["/path/to/artifactgraph/bin/artifactgraph-mcp.mjs"]
    }
  }
}
```

Sau khi ghi: **restart** Cursor / Claude / Kilo → thử tool `artifactgraph_projects`.

### `init` vs `init-project` — ví dụ nhầm

```bash
# ❌ Không dùng init để tạo artifactgraph.json trong portal
cd ~/workspace/portal && artifactgraph init --project portal

# ✅ Đúng
artifactgraph init                          # agents (1 lần / máy)
cd ~/workspace/portal
artifactgraph init-project                  # hoặc --project portal
artifactgraph rebuild
```

Back-compat: `init --project` / `--stack` / `--force` vẫn **route** sang `init-project` kèm note.

---

## `artifactgraph init-project` (product repo)

Chạy **trong** (hoặc `--project` map tới) từng base:

```bash
cd ~/workspace/portal
artifactgraph init-project
artifactgraph rebuild
artifactgraph status
```

Theo map `platform-repos.json`:

```bash
artifactgraph init-project --project portal
artifactgraph init-project --project nextjs --force
```

Tạo `artifactgraph.json` (commands allowlist + registry paths theo stack). **Không** copy templates.

MCP tool tương đương: `artifactgraph_init` (brownfield product).

---

## Luồng đầy đủ (Win + WSL)

```bash
# 1) Package (WSL)
curl -fsSL https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.sh | bash

# 2) Agents (interactive)
artifactgraph init
# hoặc: artifactgraph init --target=cursor,claude,kilo --yes

# 3) Mỗi product base
cd ~/workspace/portal && artifactgraph init-project && artifactgraph rebuild
cd ~/workspace/nextjs  && artifactgraph init-project && artifactgraph rebuild
```

PowerShell (ưu tiên WSL):

```powershell
irm https://raw.githubusercontent.com/raintr91/artifactgraph/main/install.ps1 | iex
```

Chi tiết package bootstrap: [INSTALL.md](./INSTALL.md).

---

## Troubleshooting

| Triệu chứng | Cách xử lý |
|-------------|------------|
| Agent không thấy tools | Restart agent; kiểm tra **Windows** `%USERPROFILE%\.cursor\mcp.json` (không phải WSL `~/.cursor`) |
| MCP error `-32000 Connection closed` | Launcher phải `await main()` — rebuild/reinstall; Cursor Win + code WSL → entry dùng `wsl.exe` |
| `Missing artifactgraph.json` | `cd <repo> && artifactgraph init-project` |
| Win Cursor + code ở WSL | `artifactgraph init --target=cursor --yes` (tự detect `/mnt/c/Users/…/.cursor/mcp.json` + `wsl.exe`) |
| Sai workspace bases | `export ARTIFACTGRAPH_WORKSPACE=$HOME/workspace` |
| Muốn xem config không ghi | `artifactgraph init --print-config cursor` |
