# Artifactgraph — internals & local-first flow

> Package: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph) · Install: [ARTIFACTGRAPH.md](./ARTIFACTGRAPH.md)  
> SSOT skills/rules: `platform-ai/skills/artifactgraph/`, `platform-ai/rules/artifactgraph.mdc`

## Goal

Trong mọi skill thao tác **artifact** (spec, grill, gen, mark, unit, test):

1. **MCP local** làm tối đa (template, tag common đã có, gen allowlist, hỏi confirm A/B/C).
2. **Không** gửi cloud cho bước hỏi grill / confirm block — đó là local + member.
3. Cloud chỉ nhận **`cloudPromptSlice`** đã nén (thiếu lịch sử / slot Mo* chưa có / legacy class lạ).
4. Xong → **đăng ký registry + `remember`** để lần sau khỏi hỏi lại.

```text
Skill → MCP local (do / askUser) → [optional cloudPromptSlice] → register local
```

---

## What is local vs cloud

| Việc | Local MCP + member | Cloud model |
|------|-------------------|-------------|
| Detect cột/block thiếu component | Có | Không |
| Hỏi common vs chỉ feature (A/B/C) | Có | Không |
| Confirm block khi **không** clone legacy | Có | Không |
| **Parity** create≠edit / empty / FE≠BE confirm | Có (`parity_check`) | Không (chỉ emit `parityFindings` cùng archaeology) |
| Gắn `#shell` / `#pattern` / common registry-hit | Có | Không |
| `portal:gen` / `unit-gen` / `testcase:gen` allowlist | Có (`artifactgraph_gen`) | Không |
| Wire Mo* **đã có** registry | Có | Không |
| Implement Mo* / logic **chưa có** mẫu | Không | Có — chỉ slot thiếu |
| Hiểu legacy class chưa từng analyze | Không | Có — nén path/symbol + câu hỏi |

---

## Phase hooks (skill)

Chi tiết copy-paste: [`platform-ai/extracts/artifactgraph-phase-hooks.md`](../../platform-ai/extracts/artifactgraph-phase-hooks.md)

| Skill | Local first | Cloud chỉ khi |
|-------|-------------|----------------|
| `/spec` | Draft blocks/common UI đã biết | Domain rule mới |
| `/legacy-spec` | Trace + **parity_check**; confirm drift local | Legacy class/flow lạ + **parityFindings[]** cùng turn |
| `/dev-grill-docs` | Common candidates + A/B/C + genDry | Đặt tên Mo* mới mơ hồ |
| `/grill-with-docs` | Reconcile gate + genDry | Conflict cần copy dài |
| `/prototype` | gen allowlist; Mo* đã có | Chỉ `#needs-component` chưa có file |
| `/grill-prototype` | HANDOFF table + ask | — |
| `/unit` | unit-gen allowlist | Pattern unit chưa có |
| `/test` | e2e gaps / testcase gen nếu có | Matcher mới |
| `/platform-mark` | remember + registry validate | — |

---

## MCP tools → source

| Tool / CLI | Module |
|------------|--------|
| `projects` | `config/platform-repos.ts` → `loadPlatformReposMap` |
| `init` (CLI agents) | `install/agents.ts` + `install/prompt.ts` — multi-select ↑↓ · Space |
| `init-project` / MCP `artifactgraph_init` | `config/load-config.ts` → `writeBrownfieldConfig` |
| `rebuild` | `registry/load-registries.ts` + `db/index-store.ts` |
| `analyze` / `gaps` | `analyze/analyze-spec.ts`, `analyze-bullets.ts` |
| `grill_check` / `remember` | `analyze/grill-check.ts` (+ parity when `kind=parity`) |
| `parity_check` / CLI `parity` | `analyze/parity-check.ts` · [PARITY.md](./PARITY.md) |
| `gen` | `gen/run-command.ts` → allowlist spawn |
| Package bootstrap | `install.sh` / `install.ps1` · member guide [INIT.md](./INIT.md) |

Boot: `bin/artifactgraph-mcp.mjs` → `mcp/server.ts` → `mcp/tools.ts`.

---

## cloudPromptSlice shape (token budget)

```text
## task
one line

## already_done_local
- tags / files / genDry OK

## missing_only
- needs-component: slot → props
- legacy: Symbol (path hint) — no prior decision

## constraints
- do not regenerate shell/page
- max N files
```

---

## TODO (product)

| ID | Item |
|----|------|
| T1 | Apply draft tags → write `ir/spec.yaml` |
| T2 | Slice builders per gap kind |
| T3 | Parse HANDOFF → missing slots only |
| T4 | `registry_apply` after promote |
| T5 | Richer grill detect (mark-detect parity) |
| T6 | Auto-write `review.parity[]` into bundle after remember |

---

## platform-repos

Portal map includes project **`artifactgraph`** (`../artifactgraph`) in group `platform-bases` — open that repo to continue MCP code.
