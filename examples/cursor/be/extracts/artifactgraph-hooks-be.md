# ArtifactGraph — backend hooks

- Resolve endpoint, DTO, API, data, and business-rule tags from the current BE
  repo's local index only.
- Run BE dry generation before write generation when both keys exist.
- Full product registry remains in docs; ArtifactGraph does not infer or follow
  a docs checkout.
- Promote canonical registry changes in docs; keep only BE-local
  allowlists/templates in the BE repo.
- Leave `/api`, `/wire`, and `/unit` phase skills product-owned.
