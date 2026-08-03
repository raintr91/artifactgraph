# ArtifactGraph — backend hooks

- Resolve endpoint, DTO, API, data, and business-rule tags from the current BE
  repo's local index only.
- **Before creating a new BE spec**, run `artifactgraph_api_reuse_check` to detect
  existing routes across product surfaces. If a match is found without `#reuse-api`,
  emit `DUPLICATE_API_ROUTE` warning and ask member A/B/C before proceeding.
- Use `#reuse-api` tag on specs that intentionally reuse an existing common/sibling
  route. Use `#call-external` for third-party integrations (OAuth, SMS, Payment, Webhook).
  Use `#cross-service` / `#cross-entity-service` for multi-aggregate orchestration.
  Use `#derived-data` for computed fields not stored on the entity.
- Run BE dry generation before write generation when both keys exist.
- **Code size discipline:** Enforce `platform-code-size.mdc` (~200 lines/file, ~20 lines/func). Automatically split services, DTOs, and handlers during Codegenkit generation.
- Full product registry remains in docs; ArtifactGraph does not infer or follow
  a docs checkout.
- Architecture ID / C4 lookups go to Docskit (`DOCSKIT_ROOT`). Symbol /
  call-graph lookups go to the target repo's `codegraph-<key>` MCP — Platform
  DNA owns that auto-wire, not ArtifactGraph.
- Promote canonical registry changes in docs; keep only BE-local
  allowlists/templates in the BE repo.
- Leave `/spec`, `/api-spec`, `/unit`, and `/test` phase skills product-owned.
