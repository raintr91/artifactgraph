---
name: artifactgraph
description: Local-first ArtifactGraph MCP: index, analyze gaps, suggest tags, remember decisions, and recommend allowlisted commands.
disable-model-invocation: true
---

# /artifactgraph

The docs repo is the canonical registry/parity hub. ArtifactGraph indexes the
current repo only: on docs this includes the full registry; on FE/BE/tests it
provides local tag/allowlist hints only. It never follows `HUBDOCS_ROOT` or
`CODEGENKIT_DOCS_ROOT`.

ArtifactGraph recommends repo-owned allowlisted commands. It does **not** own
architecture Markdown (Hubdocs), cross-repo pointers, or executable generators
(Bundlekit / Codegenkit / Testkit).

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
6. Promote canonical registry changes in docs. In code/test repos, promote only
   repo-local allowlists/templates, then rebuild that repo's local index.

## Setup

Preferred home (full registry):

```bash
cd /path/to/docs-hub
artifactgraph init --type=common,docs
artifactgraph rebuild
```

On FE/BE/tests, install only when local hints are useful:

```bash
artifactgraph init --type=common,fe # local FE data only
```

Use `CODEGENKIT_DOCS_ROOT` for FE generation that needs docs IR/registries and
`HUBDOCS_ROOT` for architecture ID lookups. No central workspace map or
sibling-path inference is allowed.
