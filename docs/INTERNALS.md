# Artifactgraph — internals & local-first DSL

> Package: [raintr91/artifactgraph](https://github.com/raintr91/artifactgraph) · Install: [ARTIFACTGRAPH.md](./ARTIFACTGRAPH.md)  
> SSOT skills/rules: `platform-ai/skills/artifactgraph/`, `platform-ai/rules/artifactgraph.mdc`  
> Phase checklist: [`artifactgraph-phase-hooks.md`](../../platform-ai/extracts/artifactgraph-phase-hooks.md)

## Ownership (quan trọng)

| Layer | Where | Role |
|-------|-------|------|
| **Registries + templates (.hbs)** | Product repo (`registries/`, `codegen/templates`, …) | **SSOT** — promote sau member review |
| **Skills / extracts / promotion docs** | Product `platform-ai/` (or stack equivalent) | Quy trình team |
| **MCP artifactgraph** | Package + `.artifactgraph/index.db` | **Index** DSL ids/aliases + allowlisted gen + grill/parity memory |
| **`artifactgraph.json`** | Product root | `commands` + `registries[]` paths + optional `dsl.lanes` map |

MCP **không** lưu registry riêng thay product. `rebuild` = đọc file git → SQLite index.

## DSL loop

```text
tags + index → artifactgraph_gen (local) → #needs-*?
  → cloudPromptSlice / member → promote in product repo → rebuild + remember
```

Lần sau spec tương tự: gắn tag mẫu đã học → gen đúng template — gần như không cloud.

## Goal (local vs cloud)

1. **MCP local** tối đa (index match, gen allowlist, A/B/C).
2. **Không** cloud cho grill confirm / block confirm.
3. Cloud chỉ **`cloudPromptSlice`** (slot/pattern chưa có).
4. Xong → **promote registry product** + `remember` + `rebuild`.

```text
Skill → MCP local (do / askUser / gen) → [optional cloudPromptSlice] → promote product → rebuild
```

---

## What is local vs cloud

| Việc | Local MCP + member | Cloud model |
|------|-------------------|-------------|
| Match shell/common/unit/e2e từ **index** | Có | Không |
| Hỏi common vs feature-only (A/B/C) | Có | Không |
| `specSplit` / `docsRender` / `portal:gen` / `unit-gen` / `testcase:gen` | Có (`artifactgraph_gen`) | Không |
| Wire Mo* / pattern **đã** registry | Có | Không |
| Implement Mo* / pattern **chưa** có | Không | Có — chỉ phần thiếu |
| **Ghi** registry / hbs mới | Product skill + member (promote docs) | Không (MCP không SSOT) |

---

## Phase → commandKey (portal nuxt4)

| Skill / phase | Prefer `artifactgraph_gen` keys |
|---------------|----------------------------------|
| `/spec` | `specSplit`, `docsRender` (+ common variants) |
| `/dev-grill-docs` · `/grill-with-docs` | `genDry` |
| `/prototype` | `gen` |
| `/unit` | `unitGenDry`, `unitGen` |
| `/test` | `testcaseGenDry`, `testcaseGen` |
| `/platform-mark` | `registryValidate`, `commonRegistry`, `unitRegistry`, `e2eRegistry` |
| BE (api repo stack) | `gen` / `genDry` theo `stacks/laravel.json` (… ) |

`{spec}` = bundle / `ir/spec.yaml` / **testcase yaml path** tùy key (xem `dsl.lanes.*.note`).

---

## MCP tools → source

| Tool / CLI | Module |
|------------|--------|
| `projects` | `config/platform-repos.ts` |
| CLI `init` / `init-project` | `install/agents.ts`, `config/load-config.ts` |
| `rebuild` | `registry/load-registries.ts` → index shells · common · unit · e2e · aliases |
| `analyze` / `gaps` / `grill_check` / `parity_check` / `remember` | `analyze/*` |
| `gen` | `gen/run-command.ts` → allowlist only |
| `status` | config + `dsl` lanes + resolved hubs/specRoots + index summary |
| `suggest_tags` | `lexicon/load-lexicon.ts` — R2.1 (fe/docs/be) / R3.1 (plans) local suggest |
| path resolve | `config/resolve-paths.ts` — `@projectId/…`, gapSources, argv |

---

## cloudPromptSlice shape (token budget)

```text
## task
one line

## already_done_local
- tags / files / genDry OK / index hit

## missing_only
- needs-component: slot → props
- legacy: Symbol — no prior decision

## parityFindings (legacy — REQUIRED same turn)
- see legacy/parity.md

## constraints
- do not dump registries/templates
- do not write product registry from cloud — member promote after review
- max N files
```

---

## TODO (product)

| ID | Item |
|----|------|
| T1 | Apply draft tags → write `ir/spec.yaml` |
| T2 | Slice builders per gap kind |
| T3 | Parse HANDOFF → missing slots only |
| T4 | Guided promote checklist after remember (still product files) |
| T5 | Richer grill detect (mark-detect parity) |
| T6 | Auto-write `review.parity[]` into bundle after remember |

---

## platform-repos

Portal map includes project **`artifactgraph`** (`../artifactgraph`) in group `platform-bases`.

### Harness profiles

SSOT: `platform-repos.json` → `harness`:

- `defaultByRole` — `role` → profile (`client` → `full` với line trong `code-fe`)
- `projects.harnessProfile` — override (MCP: `tooling`)
- `profiles.*.skills` — allowlist `.cursor/skills` theo profile (sync **propose**, không wipe all)
- `syncPolicy.mode: propose` — so sánh actual vs expected; đề xuất add/remove

| Profile | Role(s) / groups | Skills (lane) | MCP suggest lane |
|---------|------------------|---------------|------------------|
| `full` | frontend, client, fullstack · `code-fe` / `code-fullstack` | DNA + prototype / wire / test / unit / api | `fe` |
| `shared` | backend · `code-be` | DNA + api / wire / unit | `be` |
| `docs` | docs · `docs` | DNA + spec / grill / dynamics | `docs` (= R2.1) |
| `tests` | tests · `tests` | DNA + testcase / grill-testcase | `plans` |
| `tooling` | tooling · `mcp` | platform-ai, platform-mark, artifactgraph | via product projectId |

`.cursor/` chỉnh tại đúng lane repo. `python3 scripts/sync-platform-repos-bases.py` chỉ propagate **map** (không copy skills).

### Lexicon → lane

| Hub file | MCP tool lane | Used for |
|----------|---------------|----------|
| `base-docs/.../registry-tags.en.txt` | `fe`, `docs`, `be` | UI shells, `#needs-component`, `#needs-endpoint`, `#needs-dto` |
| `base-tests/.../testcase-taxonomy.en.txt` | `plans` | E2E case types, dimensions, scenarios |

`analyzeBullets` picks `fe` vs `be` from `artifactgraph.json` stack + `dsl.lanes`. FE-only spec checks (`#shell:`, `ui.columns`) skipped on BE stacks.

Lane workspace groups: `code-fe`, `code-be`, `code-fullstack`, `docs`, `tests`, `mcp` — generate via `node scripts/platform-workspace-from-repos.mjs --group=<lane>` (gitignored `platform-*.code-workspace`).


## Multi-hub paths + lexicons (2026-07-15)

- `hubs.docs` / `hubs.tests` → platform-repos project ids (default `base-docs` / `base-tests`)
- `specRoots` / `gapSources` / command `--dir` may use `@base-docs/...` (workspace map, not only `../`)
- `vocabularies.registryTags` → docs hub `platform/toolchain/lexicon/registry-tags.en.txt`
- `vocabularies.testTaxonomy` → tests hub `catalog/lexicon/testcase-taxonomy.en.txt`
- Gen still reads IR + product `registries/*.json` only — lexicons are suggest/index, not gen SSOT
