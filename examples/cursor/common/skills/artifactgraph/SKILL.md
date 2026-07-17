---
name: artifactgraph
description: Local-first ArtifactGraph MCP: index, analyze gaps, suggest tags, remember decisions, and recommend allowlisted commands.
disable-model-invocation: true
---

# /artifactgraph

The current product repository owns `artifactgraph.json`, `registries/*.json`,
templates, and `artifactgraph/lexicon/*.txt`. ArtifactGraph indexes those files
and recommends product-owned allowlisted commands. It does **not** own
architecture Markdown (Hubdocs) or executable generators (Bundlekit /
Codegenkit / Testkit).

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

## Setup

From the target repository:

```bash
artifactgraph init
artifactgraph rebuild
```

No central workspace map or sibling docs/tests hub is required.
