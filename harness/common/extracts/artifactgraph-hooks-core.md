# ArtifactGraph — core hooks

1. Check local status/index before artifact work.
2. Analyze or grill locally; ask the member to confirm ambiguous decisions.
3. Run only allowlisted generation commands.
4. Send only unresolved `cloudPromptSlice` content to cloud models.
5. Promote canonical registries in the docs repo. In FE/BE/tests, promote only
   repo-local allowlists/templates.
6. Rebuild and remember confirmed decisions.

The docs repo is registry SSOT. ArtifactGraph never owns registry payloads and
never follows another toolkit's cross-repo pointer.
