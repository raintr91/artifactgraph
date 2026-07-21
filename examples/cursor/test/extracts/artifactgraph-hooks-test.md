# ArtifactGraph — test hooks

- Use the installed testcase taxonomy for scenario, coverage, and dimension
  suggestions on the current tests repo's own plans only.
- Resolve known E2E bundles from the current product index (local).
- Full product registry/IR remains in docs. Testkit reads cross-repo evidence
  through `TESTKIT_DOCS_ROOT` / `TESTKIT_TESTS_ROOT`; ArtifactGraph does not
  follow those pointers.
- Architecture ID / C4 lookups go to Docskit (`DOCSKIT_ROOT`). Symbol /
  call-graph lookups go to the target repo's `codegraph-<key>` MCP — Platform
  DNA owns that auto-wire, not ArtifactGraph.
- Run testcase generation only when the current repo allowlists it.
- Keep `/testcase` and `/grill-testcase` phase skills owned by the test repo.
