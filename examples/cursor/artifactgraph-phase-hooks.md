# Artifactgraph — phase hooks (local-first)

> Used by skill `/artifactgraph` and phase skills. Grill **confirm = local + member**, not cloud.

## Shared protocol (every artifact skill)

1. If MCP available: `artifactgraph_status` / ensure `artifactgraph.json` (`init-project` once per product repo). Agents: `artifactgraph init` once per machine.
2. **Local:** `artifactgraph_analyze` or `artifactgraph_grill_check` (spec and/or bullets); after legacy archaeology also **`artifactgraph_parity_check`**.
3. Show `askUser[]` to member — A/B/C for grill + **parity-drift** only. **Do not** call cloud for these.  
   `context-orphan` = show as warning; **no** A/B/C.
4. On confirm: `artifactgraph_remember` (`kind=grill` or `kind=parity`) (+ write tags/marks when apply exists).
5. Gen only via `artifactgraph_gen` allowlisted keys when wired; else fall back to documented `pnpm` commands.
6. If still missing implementation (new Mo*, unknown legacy): build **`cloudPromptSlice` only** — never full registries/templates. Legacy slice **must** request `parityFindings[]` same turn.
7. After cloud or local implement: remind promote registry (`DESIGN-REGISTRY-PROMOTION` / unit/e2e) + `remember`.

## Per skill

### `/spec`

- Local: common UI / breadcrumb / known blocks from registry aliases; incremental `block:*` skeleton.
- Confirm blocks with member when `specOrigin` is **not** legacy (requirement-only).
- Cloud: only unknown domain rules in `cloudPromptSlice`.

### `/legacy-spec`

- Local: trace + bundle; **`parity_check`** — field drift (**confirm A/B/C**) + context-orphan (**warn only**).
- Cloud: **one turn** — slices + `parityFindings[]` + `contextOrphans[]` (`legacy/parity.md`).
- Gate: unresolved parity-drift **error** → confirm/defer before `/bqa-grill-docs`. Orphan không gate.
- Context-orphan = data action dùng ≠ data màn hiển thị; chỉ cảnh báo.### `/dev-grill-docs`

- Local: Common candidates table; each custom column → common vs feature-only (A/B/C); `grill_check`.
- Gate: `artifactgraph_gen` `genDry` (or `pnpm portal:gen:dry`).
- Cloud: only ambiguous Mo* naming with no registry alias.
- **Not** the place to first discover create≠edit validate — that was parity on legacy-spec.
### `/grill-with-docs`

- Local: reconcile + `genDry` via MCP.
- Cloud: rare long conflict prose.

### `/prototype`

- Local: `artifactgraph_gen` `gen`; Mo* already in design registry → wire only.
- Cloud: **only** `#needs-component` / `#needs-ui` slots with no file — slice = slot + props + 1–2 similar Mo* refs.

### `/grill-prototype`

- Local: HANDOFF vs disk table; ask member on remaining gaps; promote reminder.

### `/unit`

- Local: `unitGen` / `unitGenDry` allowlist; clear known patterns.
- Cloud: new unit pattern not in `unit-test` registry.

### `/test`

- Local: e2e registry gaps; `testcase:gen` when in allowlist.
- Cloud: new matcher/bundle only.

### `/platform-mark`

- Local: after B — tags/marks + `remember` + `registryValidate` / common registry.
- Promote to `registries/*.json` per promotion docs.
