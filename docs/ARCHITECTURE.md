# Architecture — ArtifactGraph MCP

Learning map for building more MCPs later.

## Layers

```text
mcp/server.ts + mcp/tools.ts     ← Cursor talks here (stdio JSON-RPC)
cli.ts                           ← same features for humans/CI
analyze/*                        ← local intelligence (gaps, bullets, grill)
gen/run-command.ts               ← allowlisted spawn only
registry/*                       ← read product registries/
db/index-store.ts                ← SQLite cache + confirm memory
config/*                         ← local artifactgraph.json + path policy
install/project.ts               ← type assets + safe managed-file updates
stacks/*.json                    ← brownfield presets per stack
harness/* + lexicon/*            ← package baselines copied by init
```

## Local-first flow

1. From the target repo, `init` wires agents and installs selected local assets.
2. `rebuild` fills `.artifactgraph/index.db` transactionally from product files.
3. `analyze` / `grill_check` / `parity` return local gaps and compact slices.
4. Member confirmation is stored with `remember`.
5. `gen` runs only product-defined allowlisted keys.

Cloud should receive **cloudPromptSlice**, not full registries or template trees.

## Adding another MCP later

Copy this package shape:

1. Current-project context pinned by project-local MCP configuration
2. `src/mcp/server.ts` + `tools.ts` with zod schemas
3. Domain modules under `src/<domain>/`
4. CLI twin of tools for debugging without Cursor
5. Packaged baseline assets plus safe install/update manifest

## File responsibilities

| File | Role |
|------|------|
| `types.ts` | Gap / AnalyzeResult / config contracts |
| `config/platform-repos.ts` | Package root + optional legacy tooling map |
| `config/load-config.ts` | Validate/read product `artifactgraph.json` |
| `install/project.ts` | Install/update config, lexicons, and MCP DNA |
| `db/index-store.ts` | SQLite schema + decisions |
| `analyze/analyze-spec.ts` | IR tags vs registry → gaps |
| `analyze/analyze-bullets.ts` | Heuristic draft tags from bullets |
| `analyze/grill-check.ts` | Grill A/B/C wrapper + remember |
| `gen/run-command.ts` | Safe argv spawn |
| `mcp/tools.ts` | Tool surface for Cursor |
