# ArtifactGraph — frontend hooks

- Resolve known shells, widgets, common components, and UI patterns from the
  current FE repo's local index only.
- Run FE dry generation before write generation when both keys exist.
- Full product registry/IR remains in docs. Codegenkit reads it through the
  member-selected `CODEGENKIT_DOCS_ROOT`; ArtifactGraph does not follow that
  pointer.
- Architecture ID / C4 lookups go to Docskit (`DOCSKIT_ROOT`). Symbol /
  call-graph lookups go to the target repo's `codegraph-<key>` MCP — Platform
  DNA owns that auto-wire, not ArtifactGraph.
- Promote canonical registry changes in docs; keep only FE-local
  allowlists/templates in the FE repo.
- Leave `/prototype`, `/wire`, `/unit`, and `/test` phase skills product-owned.
