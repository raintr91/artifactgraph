# Artifactgraph — phase hooks (local-first DSL)

> Used by skill `/artifactgraph` and phase skills. Grill **confirm = local + member**, not cloud.  
> **SSOT:** product repo `registries/*.json` + `codegen/templates` (+ skills/docs). MCP only **indexes** + runs **allowlisted** gen.

## DSL loop (every lane: FE · BE · unit · e2e · docs)

```text
(1) Read tags + MCP index (rebuild from product registries)
(2) artifactgraph_gen <commandKey>  — local template/script
(3) Still #needs-* / HANDOFF missing mẫu?
      → member A/B/C and/or cloudPromptSlice (thiếu only)
(4) Member OK → promote registry + hbs **in product repo** (not inside MCP)
(5) artifactgraph_rebuild + remember → lần sau reuse tag + gen
```

| Lane | Local gen keys (`artifactgraph.json`) | After review promote (product git) |
|------|----------------------------------------|------------------------------------|
| **docs** (spec phase) | `specSplit`, `specSplitAll`, `docsRender`, `docsRenderCommon` | Tag chuẩn trên bundle/`ir` — reuse FE/unit/e2e |
| **fe** | `genDry`, `gen` | `design` / `common` registry + Mo* templates |
| **be** (api repo) | `genDry`, `gen` (stack laravel/…) | BE codegen registry + templates |
| **unit** | `unitGenDry`, `unitGen` | `unit-test` registry |
| **e2e** | `testcaseGenDry`, `testcaseGen` | `e2e-test` registry (`{spec}` = testcase path) |
| **lifecycle** | `lifecycleSync` | `page-lifecycle` registry |

Cloud **không** viết registry. Promote = docs `DESIGN-REGISTRY-PROMOTION` / `UNIT-REGISTRY-PROMOTION` / e2e docs + skill `/platform-mark`.

## Shared protocol (every artifact skill)

1. If MCP available: `artifactgraph_status` / ensure `artifactgraph.json` (`init-project` once per product repo). Prefer **`artifactgraph init --location=local`**. Else CLI.
2. **Local:** `artifactgraph_analyze` or `artifactgraph_grill_check`; after legacy also **`artifactgraph_parity_check`**.
3. Show `askUser[]` — A/B/C for grill + **parity-drift** only. **context-orphan** = warn only.
4. On confirm: `artifactgraph_remember` (`kind=grill|parity`).
5. Gen only via `artifactgraph_gen` allowlisted keys; else documented `pnpm` fallback.
6. Still missing implementation → **`cloudPromptSlice` only** — never full registries/templates.
7. After implement: **promote in product repo** → `registryValidate` / lane registry cmds → `artifactgraph_rebuild`.

## Per skill

### `/spec`

- Local: gắn tag chuẩn từ index (shell/common/unit/e2e đã học); `specSplit` / `docsRender` via MCP.
- Confirm blocks when `specOrigin` is **not** legacy.
- Cloud: only unknown domain rules in `cloudPromptSlice`.
- **Không** `portal:gen` app ở phase này (trừ khi skill nói rõ dry gate).

### `/legacy-spec`

- Local: trace + bundle; **`parity_check`**.
- Cloud: **one turn** — slices + `parityFindings[]` + `contextOrphans[]`.
- Gate: unresolved parity-drift → confirm before `/bqa-grill-docs`.

### `/dev-grill-docs`

- Local: Common candidates; A/B/C; `grill_check`.
- Gate: `genDry`.
- Cloud: only ambiguous Mo* naming with no registry alias.

### `/grill-with-docs`

- Local: reconcile + `genDry`.
- Cloud: rare long conflict prose.

### `/prototype`

- Local: `artifactgraph_gen` `gen`; Mo* already in design registry → wire only.
- Cloud: **only** `#needs-component` / `#needs-ui` slots with no file.

### `/grill-prototype`

- Local: HANDOFF vs disk; promote reminder (product registry).

### `/unit`

- Local: `unitGen` / `unitGenDry`.
- Cloud: new unit pattern not in `unit-test` registry → then promote.

### `/test`

- Local: `testcaseGen` / `testcaseGenDry` (`spec` arg = testcase yaml path).
- Cloud: new matcher/bundle only → promote e2e registry.

### `/platform-mark`

- Local: after B — tags + `remember` + `registryValidate` / `commonRegistry`.
- **Write** registry JSON in product repo; then `rebuild`.

## Detail docs (do not duplicate)

| Topic | Doc |
|-------|-----|
| Protocol + ownership | `base-docs/platform/toolchain/ARTIFACTGRAPH-INTERNALS.md` |
| `#needs-component` | `NEEDS-COMPONENT-FLOW.md` |
| Promote Mo* | `DESIGN-REGISTRY-PROMOTION.md` |
| Unit promote | `UNIT-REGISTRY-PROMOTION.md` |
| featureStatus | `.cursor/extracts/feature-lifecycle-status.md` |
| portal:gen | `PORTAL-CODEGEN.md` |
