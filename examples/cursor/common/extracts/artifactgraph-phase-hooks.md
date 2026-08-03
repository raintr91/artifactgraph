# Artifactgraph — phase hooks (local-first DSL)

> Used by skill `/artifactgraph` and phase skills. Grill **confirm = local + member**, not cloud.  
> **SSOT:** product repo `registries/*.json` + `codegen/templates` (+ skills/docs). MCP only **indexes** + runs **allowlisted** gen.

## DSL loop (every lane: FE · BE · unit · e2e · docs)

```text
(1) Read tags + MCP index (rebuild from product registries)
(2) artifactgraph_api_reuse_check — trước khi tạo spec mới BE/docs (check trùng route)
(3) artifactgraph_gen <commandKey>  — local template/script
(4) Still #needs-* / HANDOFF missing mẫu?
      → member A/B/C and/or cloudPromptSlice (thiếu only)
(5) Member OK → promote registry + hbs **in product repo** (not inside MCP)
(6) artifactgraph_rebuild + remember → lần sau reuse tag + gen
```

| Lane | Local gen keys (`artifactgraph.json`) | After review promote (product git) |
|------|----------------------------------------|------------------------------------|
| **docs** (spec phase) | `specSplit`, `specSplitAll`, `docsRender`, `docsRenderCommon` | Tag chuẩn trên bundle/`ir` — reuse FE/unit/e2e |
| **fe** | `genDry`, `gen` | `design` / `common` registry + Mo* templates + `platform-code-size.mdc` |
| **be** (api repo) | `genDry`, `gen` (stack laravel/…) | BE codegen registry + templates + `platform-code-size.mdc` |
| **unit** | `unitGenDry`, `unitGen` | `unit-test` registry |
| **e2e** | `testcaseGenDry`, `testcaseGen` | `e2e-test` registry (`{spec}` = testcase path) |
| **lifecycle** | `lifecycleSync` | `page-lifecycle` registry |

Cloud **không** viết registry. Promote = docs `DESIGN-REGISTRY-PROMOTION` / `UNIT-REGISTRY-PROMOTION` / e2e docs + skill `/docs-mark`.

## Shared protocol (every artifact skill)

1. Run `artifactgraph init` once in the current product repo, then use
   `artifactgraph_status`; project-local MCP is the default.
2. **Local:** `artifactgraph_analyze` or `artifactgraph_grill_check`; after legacy also **`artifactgraph_parity_check`**.
3. **API reuse check (BE/docs):** Run `artifactgraph_api_reuse_check` before creating
   a new spec.
   - `found: true` → route exists → add `#reuse-api` to the spec (no gate, agent applies tag)
   - `found: false` → safe to proceed with new spec
   - `grill_check` also detects duplicates via indexed routes → suggests `#reuse-api` in `draftTags`
5. On confirm: `artifactgraph_remember` (`kind=grill|parity`).
6. Gen only via `artifactgraph_gen` allowlisted keys; else documented `pnpm` fallback.
7. Still missing implementation → **`cloudPromptSlice` only** — never full registries/templates.
8. After implement: **promote in product repo** → `registryValidate` / lane registry cmds → `artifactgraph_rebuild`.

## Per skill

### `/spec`

- Local: gắn tag chuẩn từ index (shell/common/unit/e2e đã học); `specSplit` / `docsRender` via MCP.
- Confirm blocks when `specOrigin` is **not** legacy.
- Cloud: only unknown domain rules in `cloudPromptSlice`.
- **Không** `portal:gen` app ở phase me (trừ khi skill nói rõ dry gate).

### `/api-spec` · `/api-integration-spec`

- **Pre-flight:** `artifactgraph_api_reuse_check({ path, method })` trước khi viết spec.
  - `found: true` → add `#reuse-api` vào spec; không cần tạo spec mới.
  - `found: false` → proceed spec creation.
- Local: `artifactgraph_grill_check` sau khi draft spec — phát hiện `duplicate-api-route` và suggest `#reuse-api` qua `draftTags`.
- Cloud: only domain-specific API contract rules.

### `/dev-grill-docs` · `/bqa-grill-docs` · `/grill-with-docs`

- **Pre-flight:** `artifactgraph_grill_check` — bao gồm `duplicate-api-route` detection.
- Local: trace + bundle; **`parity_check`**.
- Cloud: only ambiguous Mo* naming with no registry alias.

### `/update-spec` · `/update-api-spec`

- **Pre-flight:** `artifactgraph_api_reuse_check` nếu spec có API routes mới.
- Local: `artifactgraph_analyze` sau khi sửa — phát hiện gaps mới phát sinh.

### `/prototype` · `/prototype-handoff`

- Local: `artifactgraph_gen` `gen`; Mo* already in design registry → wire only.
- Cloud: **only** `#needs-component` / `#needs-ui` slots with no file.

### `/unit`

- Local: `artifactgraph_suggest_tags` (lane `be` / `fe`) + `artifactgraph_gen` `unitGen`.

### `/test`

- Local: taxonomy testcase (`artifactgraph/lexicon/testcase-taxonomy.en.txt`) + `artifactgraph_gen` `testcaseGen`.

### `/docs-mark`

- Local: `suggest_tags` → update spec/registry → `artifactgraph_rebuild`.

## Summary table

| Skill | Local MCP pre-flight | Allowed gen command | Cloud prompt rule |
|---|---|---|---|
| `/spec` | `analyze`, `api_reuse_check` | `specSplit`, `docsRender` | `cloudPromptSlice` only |
| `/api-spec` | `api_reuse_check`, `grill_check` | `specSplit` | Domain rules only |
| `/grill-*` | `grill_check`, `parity_check` | — | Ambiguous Mo* names only |
| `/prototype` | `analyze` | `genDry`, `gen` | `#needs-component` slots only |
| `/unit` | `suggest_tags` | `unitGenDry`, `unitGen` | Unit pattern gaps only |
| `/test` | `suggest_tags` | `testcaseGenDry`, `testcaseGen` | Scenario logic only |
| `/docs-mark` | `suggest_tags`, `rebuild` | — | None |

## Checklist for promote

- [ ] Write registry JSON in product repo
- [ ] Add templates if missing
- [ ] Run `artifactgraph_rebuild`
- [ ] Next session reuses new tag automatically
