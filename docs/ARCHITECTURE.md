# Architecture — artifactgraph MCP (v0.1)

Learning map for building more MCPs later.

## Layers

```text
mcp/server.ts + mcp/tools.ts     ← Cursor talks here (stdio JSON-RPC)
cli.ts                           ← same features for humans/CI
analyze/*                        ← local intelligence (gaps, bullets, grill)
gen/run-command.ts               ← allowlisted spawn only
registry/*                       ← read product registries/
db/index-store.ts                ← SQLite cache + confirm memory
config/*                         ← platform-repos + artifactgraph.json
stacks/*.json                    ← brownfield presets per stack
platform-repos.json              ← map projectId → absolute repo root
```

## Local-first flow

1. `init` → wire agents (Cursor / Claude / Kilo MCP)
2. `init-project` → write `artifactgraph.json` in product repo (commands + registry paths)
3. `rebuild` → index registries into `.artifactgraph/`
4. `analyze` / `parity` → local gaps; cloud only gets `cloudPromptSlice`
2. `rebuild` → fill `.artifactgraph/index.db` from registries (git still SSOT)
3. `analyze` / `grill_check` → gaps + draft tags + `cloudPromptSlice` (small)
4. Member confirm → `remember` into SQLite
5. `gen` only via allowlisted keys (`genDry`, `registryValidate`, …)

Cloud should receive **cloudPromptSlice**, not full registries or template trees.

## Adding another MCP later

Copy this package shape:

1. `platform-repos.json` (or shared map) for multi-repo
2. `src/mcp/server.ts` + `tools.ts` with zod schemas
3. Domain modules under `src/<domain>/` with comments
4. CLI twin of tools for debugging without Cursor
5. README: Cursor `mcp.json` snippet + CLI examples

## File responsibilities

| File | Role |
|------|------|
| `types.ts` | Gap / AnalyzeResult / config contracts |
| `config/platform-repos.ts` | Resolve `portal` → `/…/workspace/portal` |
| `config/load-config.ts` | Read/write product `artifactgraph.json` |
| `db/index-store.ts` | SQLite schema + decisions |
| `analyze/analyze-spec.ts` | IR tags vs registry → gaps |
| `analyze/analyze-bullets.ts` | Heuristic draft tags from bullets |
| `analyze/grill-check.ts` | Grill A/B/C wrapper + remember |
| `gen/run-command.ts` | Safe argv spawn |
| `mcp/tools.ts` | Tool surface for Cursor |
