---
name: artifactgraph
description: Local-first ArtifactGraph MCP: index, analyze gaps, suggest tags, remember decisions, and recommend allowlisted commands.
disable-model-invocation: true
---

# /artifactgraph

The current product repository owns `artifactgraph.json`, `registries/*.json`,
templates, and `artifactgraph/lexicon/*.txt`. ArtifactGraph indexes those files
and recommends product-owned allowlisted commands. It does **not** own
architecture Markdown (Docskit), executable generators (Docskit /
Codegenkit / Testkit), or CodeGraph symbol indexes.

## Protocol

1. Run `artifactgraph_status`; use `artifactgraph_rebuild` when the index is stale.
2. Prefer `artifactgraph_analyze`, `artifactgraph_grill_check`, or
   `artifactgraph_parity_check` before loading large registries into context.
3. Show local A/B/C questions to the member and persist confirmed choices with
   `artifactgraph_remember`.
4. For generation/validation gates, use
   `artifactgraph_allowlist_check` + `artifactgraph_recommend_command`, then
   hand off execution to the owning kit. `artifactgraph_gen` is a deprecated
   2.x compatibility shim only.
5. Send only `cloudPromptSlice` for unresolved work.
6. Promote accepted registry/template changes in the product repo, then rebuild.

## Cross-repo routing

Cross-repo lookup is per-repo routing, never one giant workspace graph:

- Architecture ID / C4 path → Docskit (`DOCSKIT_ROOT`).
- IR / registry / generation → owning kit pointers
  (`CODEGENKIT_DOCS_ROOT`, `TESTKIT_DOCS_ROOT`, `TESTKIT_TESTS_ROOT`).
- Symbol / call-graph of repo X → that repo's `codegraph-<key>` MCP
  (`--project-root` = checkout X).

ArtifactGraph stays local-only: it does not follow those pointers, read
`platform-repos.local.json` / `legacy-repos.local.json`, scan a workspace
parent, initialize CodeGraph, or write cross-repo MCP entries. Platform DNA
owns map-based CodeGraph auto-wire and missing-index guidance
(`cd <root> && codegraph init`).

## Setup

From the target repository:

```bash
artifactgraph init
artifactgraph rebuild
```

Preferred docs home (full registry/parity):

```bash
artifactgraph init --type=common,docs
```

On FE/BE/tests, install only when local hints are useful:

```bash
artifactgraph init --type=common,fe
```
