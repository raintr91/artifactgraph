---
name: artifactgraph
description: Local-first ArtifactGraph MCP: index, analyze gaps, suggest tags, remember decisions, and run allowlisted generation.
disable-model-invocation: true
---

# /artifactgraph

The current product repository owns `artifactgraph.json`, `registries/*.json`,
templates, and `artifactgraph/lexicon/*.txt`. ArtifactGraph only indexes those
files and runs commands explicitly allowlisted by that repository.

## Protocol

1. Run `artifactgraph_status`; use `artifactgraph_rebuild` when the index is stale.
2. Prefer `artifactgraph_analyze`, `artifactgraph_grill_check`, or
   `artifactgraph_parity_check` before loading large registries into context.
3. Show local A/B/C questions to the member and persist confirmed choices with
   `artifactgraph_remember`.
4. Run generation only through `artifactgraph_gen` command keys.
5. Send only `cloudPromptSlice` for unresolved work.
6. Promote accepted registry/template changes in the product repo, then rebuild.

## Setup

From the target repository:

```bash
artifactgraph init
artifactgraph rebuild
```

No central workspace map or sibling docs/tests hub is required.
