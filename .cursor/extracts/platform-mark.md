# Platform mark — MCP lexicon + registries (3 lanes)

> Skill: `/platform-mark` · MCP: `artifactgraph_suggest_tags` · Registries SSOT = **product repo**

## Vocabulary map (hub txt → MCP lane)

| Lane | MCP `lane=` | Hub lexicon | Product registries |
|------|-------------|-------------|-------------------|
| **FE / UI** | `fe` or `docs` | `artifactgraph/lexicon/registry-tags.en.txt` | `design.registry.json`, `common.registry.json` |
| **BE / API** | `be` | Same R2.1 (`#api:`, `#needs-endpoint`, `#needs-dto`) | `codegen.registry.json` (+ `common` on some stacks) |
| **Test / plans** | `plans` | `artifactgraph/lexicon/testcase-taxonomy.en.txt` | `e2e-test.registry.json`, `unit-test.registry.json` |

Lexicons = **suggest/index only** — never gen SSOT. Promote marks in product git after grill confirm.

## FE tags (R2.1)

| kind | Tag | Registry |
|------|-----|----------|
| shell | `#shell: DataListPage` … | `design.registry.json` |
| needs-component | `#needs-component: slot:MoXxx:prop` | design |
| needs-ui | `#needs-ui: Widget` | design |
| common | `#common:{id}` | `common.registry.json` |
| needs-common | `#needs-common:{id}` | common |

## BE tags (R2.1 + dsl.lanes.be)

| kind | Tag | Registry |
|------|-----|----------|
| needs-endpoint | `#needs-endpoint` | `codegen.registry.json` |
| needs-dto | `#needs-dto` / `#needs-dto: request` | codegen |
| api surface | `#api: index` … | IR tags + codegen profile |

`analyze` / `analyzeBullets` infer lane `be` when stack is laravel/fastapi/dotnet-* (no FE dsl lane).

## Test tags (R3.1)

| kind | Tag / enum | Registry |
|------|------------|----------|
| case type | `type:smoke`, `type:regression`, … | plans YAML (hub) |
| dimensions | `dimensions.business:…` | taxonomy |
| unit | `#needs-unit-test` | `unit-test.registry.json` |
| e2e | `#needs-e2e`, `#needs-testcase` | `e2e-test.registry.json` |

## MCP workflow

1. `artifactgraph_rebuild` after product registries change
2. `artifactgraph_suggest_tags` — pick lane (`fe` | `be` | `plans`)
3. `analyze` / `gaps` on spec or bullets — stack-aware (FE shell checks skipped on BE)
4. Member confirm → promote on **product repo** → `remember`

## Do not (MCP package repo)

- Edit `registries/*.json` inside artifactgraph checkout
- Auto-mark without member confirmation
- Dump full lexicon into cloud — only `cloudPromptSlice` matches

Product-repo detail: `@base-docs/platform/toolchain/PLATFORM-MARK.md` · FE skill on portal · BE on api.
