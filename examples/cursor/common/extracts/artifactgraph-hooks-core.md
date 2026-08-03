# ArtifactGraph — core hooks

1. Check local status/index before artifact work.
2. Analyze or grill locally; ask the member to confirm ambiguous decisions.
3. **API reuse check (BE/docs):** Run `artifactgraph_api_reuse_check` before creating
   a new spec. If `found: true` → add `#reuse-api` to the spec (agent applies tag, no gate).
   `grill_check` also detects duplicates and suggests `#reuse-api` via `draftTags`.
4. Show `askUser[]` — A/B/C for **grill** and **parity-drift** only.
   `context-orphan` = warn only, not a gate.
5. Run only allowlisted generation commands.
6. Send only unresolved `cloudPromptSlice` content to cloud models.
7. Promote canonical registries in the docs repo. In FE/BE/tests, promote only
   repo-local allowlists/templates.
8. Rebuild and remember confirmed decisions.

The docs repo is registry SSOT. ArtifactGraph never owns registry payloads and
never follows another toolkit's cross-repo pointer.
