# ArtifactGraph — docs hooks

- Treat this docs repo as the canonical full registry/parity hub (`product/surfaces/...`).
- Use path hints from `registries/docs-index.json` when available.
- Use local vocabulary suggestions for specs and documentation marks.
- Before `/api-spec`, `/api-integration-spec`, `/grill-with-docs`, or `/bqa-grill-docs`,
  run `artifactgraph_api_reuse_check` to validate route uniqueness across product surfaces.
  Docs hub is SSOT — if a route already exists in a sibling surface, apply `#reuse-api`
  or document the divergence in `openQuestions`.
- Run docs/spec commands only when the current repo explicitly allowlists them.
- For legacy archaeology, run parity checks and resolve parity drift with member A/B/C.
- Architecture ID / C4 work stays in Docskit; ArtifactGraph indexes this repo's
  registries only and does not wire CodeGraph or follow workspace maps.
- Promote accepted canonical registry changes here, then rebuild the local index.
- Keep `/spec`, grill, dynamics, and other docs phase skills owned by the docs repo.
