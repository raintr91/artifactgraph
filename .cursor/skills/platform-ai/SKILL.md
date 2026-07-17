---
name: platform-ai
extractBundle: platform-ai
description: /platform-ai — build and maintain the independent ArtifactGraph MCP package.
disable-model-invocation: true
---

# /platform-ai — build ArtifactGraph MCP

Use this skill to design, implement, test, package, and release
**ArtifactGraph as an independent MCP**. Do not implement product features,
specs, or E2E plans here.

## Scope

| Own here | Do not own here |
|----------|-----------------|
| MCP server/tools, CLI, index and package API | Product application implementation |
| ArtifactGraph installers and managed harness | Product registries or project topology |
| ArtifactGraph/platform-mark skills and assets | Platform DNA or another MCP's harness |
| Standalone tests, packaging, release docs | Commands executed by an owning generator kit |

There is no `platform-repos.json` in an MCP repository. Runtime binds directly
to the product root where `artifactgraph init` runs.

## Workflow

1. Freeze tool schemas, ownership, and compatibility in `mcp-package.json`.
2. Keep deterministic graph/index logic in `src/`; keep orchestration in
   packaged `harness/`.
3. Bind all runtime operations to an explicit/current product root.
4. Keep `init` managed, conflict-safe, and free of sibling assumptions.
5. Update standalone tests, docs, and package-content checks with behavior.

## Commands

```bash
pnpm test
pnpm pack --dry-run
```

## Done

- Package installs and runs without sibling repositories.
- Product tools require no `projectId` or packaged workspace map.
- Shipped assets belong to ArtifactGraph and are conflict-safe.
- Docs, version, manifest compatibility, and tests agree.
