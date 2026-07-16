# artifactgraph init — guide chi tiết

Repo: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph)

## Ba bước (đừng nhầm)

| Bước | Lệnh | Phạm vi | Việc làm |
|------|------|---------|----------|
| 1. Package trên PATH | `curl …/install.sh \| bash` | Máy | Clone + build CLI `artifactgraph` |
| 2. Wire **agents** | **`artifactgraph init`** | Máy (global) hoặc cwd (local) | Ghi MCP vào Cursor / Claude / Kilo |
| 3. Wire **product repo** | **`artifactgraph init-project`** | Từng base (portal, …) | Ghi `artifactgraph.json` + sau đó `rebuild` |

`init` **không** gắn một feature/repo product. **Khuyến nghị `--location=local`** trong product repo (portal, …) — MCP chỉ load khi mở workspace đó (tiết kiệm token). Global chỉ khi thật sự muốn mọi chat có tools.

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
 ❯ ◉ Claude Code  (detected)
   ◉ Cursor  (detected)
   ◯ Codex CLI
   ◯ opencode
   ◯ Hermes Agent
   ◯ Gemini CLI
   ◉ Antigravity IDE  (detected)
   ◯ Kiro
   ◯ Kilo Code

Install location?
 ❯ ● local — project configs only (codex/hermes/antigravity need global)
   ○ global — home configs for all projects
```

| Phím | Việc |
|------|------|
| ↑ / ↓ (hoặc `k` / `j`) | Di chuyển |
| **Space** | Bật/tắt agent đang trỏ |
| `a` | Chọn / bỏ hết |
| **Enter** | Xác nhận |
| Ctrl+C | Huỷ |

Agent **detected** (đã có thư mục/`mcp` trước đó) được pre-check sẵn.

Parity với [CodeGraph](https://github.com/colbymchenry/codegraph): Claude · Cursor · Codex · opencode · Hermes · Gemini · Antigravity · Kiro — cộng thêm **Kilo Code**.

### Non-interactive (CI / script)

```bash
artifactgraph init --yes                              # auto-detect, global
artifactgraph init --target=cursor,claude,codex,opencode --yes
artifactgraph init --target=auto --location=local --yes
artifactgraph init --print-config codex               # in snippet, không ghi file
```

| Flag | Giá trị | Mặc định |
|------|---------|----------|
| `--target` | `auto` · `all` · `none` · csv (`claude,cursor,codex,opencode,hermes,gemini,antigravity,kiro,kilo`; alias `agy`) | prompt / với `--yes` = `auto` |
| `--location` | `global` · `local` | interactive: **local**; `--yes` không kèm flag: `global` (CI back-compat) |
| `--yes` | bỏ prompt | — |
| `--wsl` | Cursor Win → chạy MCP qua `wsl.exe` | — |
| `--print-config <id>` | in JSON/TOML/YAML snippet | — |
| `--mcp-file <path>` | ghi thẳng 1 file (legacy, coi như cursor) | — |

### File được ghi

| Agent | `--location=global` | `--location=local` |
|-------|---------------------|--------------------|
| Claude Code | `~/.claude.json` (+ optional `~/.claude/settings.json` allow `mcp__artifactgraph__*`) | `./.claude.json` |
| Cursor | `~/.cursor/mcp.json` | `./.cursor/mcp.json` |
| Codex CLI | `~/.codex/config.toml` (`[mcp_servers.artifactgraph]`) | — (global only) |
| opencode | `~/.config/opencode/opencode.jsonc` (`mcp.artifactgraph`) | `./opencode.jsonc` |
| Hermes Agent | `$HERMES_HOME/config.yaml` (`mcp_servers` + `platform_toolsets.cli`) | — (global only) |
| Gemini CLI | `~/.gemini/settings.json` | `./.gemini/settings.json` |
| Antigravity IDE | `~/.gemini/config/mcp_config.json` (fallback legacy `…/antigravity/…`) | — (global only) |
| Kiro | `~/.kiro/settings/mcp.json` | `./.kiro/settings/mcp.json` |
| Kilo Code | `~/.kilocode/mcp.json` | `./.kilocode/mcp.json` |

Entry MCP (stdio) cho Cursor / Claude / Gemini / Kiro / Kilo:

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

Khác biệt shape: Antigravity **không** có `type`; opencode dùng `mcp.<name>` + `command: [bin, …args]`; Codex = TOML; Hermes = YAML.

Sau khi ghi: **restart** agent → thử tool `artifactgraph_projects`.

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

# 2) Agents — prefer project MCP (token)
cd ~/workspace/portal
artifactgraph init --location=local --target=cursor --yes
# Interactive: artifactgraph init  (default location = local)

# 3) Product index
artifactgraph init-project && artifactgraph rebuild
# nextjs / bases khác: lặp init --location=local trong từng repo nếu cần MCP
```

**Gỡ global:** xóa `artifactgraph` (và `qa-git` nếu không dùng) khỏi `%USERPROFILE%\.cursor\mcp.json` — chỉ giữ CodeGraph nếu cần.

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
| Win Cursor + code ở WSL | Project: `init --location=local` (entry `wsl.exe` + `artifactgraph-mcp`). Global Win chỉ khi cố ý |
| MCP ăn token mọi chat | Gỡ artifactgraph khỏi global mcp.json; dùng `.cursor/mcp.json` trong product repo |
| Sai workspace bases | `export ARTIFACTGRAPH_WORKSPACE=$HOME/workspace` |
| Muốn xem config không ghi | `artifactgraph init --print-config cursor` |
