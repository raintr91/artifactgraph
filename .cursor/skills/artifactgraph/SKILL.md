---
name: artifactgraph
description: Local-first ArtifactGraph MCP: index, analyze gaps, suggest tags, remember decisions, and run allowlisted generation.
disable-model-invocation: true
---

# /artifactgraph

The current product repository owns `artifactgraph.json`, `registries/*.json`,
templates, and `artifactgraph/lexicon/*.txt`. ArtifactGraph indexes those files
and runs commands explicitly allowlisted by that repository.

## Protocol

1. Run `artifactgraph_status`; use `artifactgraph_rebuild` when the index is stale.
2. Prefer analyze, grill, parity, or suggest before loading large registries.
3. Confirm ambiguous A/B/C choices with the member and remember accepted decisions.
4. Run generation only through `artifactgraph_gen`.
5. Send only unresolved `cloudPromptSlice` content to cloud models.
6. Promote accepted artifacts in product git, then rebuild.

## Setup

```bash
cd <product-repo>
artifactgraph init
artifactgraph rebuild
```

No central project map or sibling docs/tests hub is required.
