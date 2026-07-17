# ArtifactGraph internals

## Ownership

| Layer | Owner |
|-------|-------|
| `artifactgraph.json` | Current product repo |
| `registries/*.json` and templates | Current product repo; git is SSOT |
| `artifactgraph/lexicon/*.txt` | Current product repo after init |
| `.artifactgraph/index.db` | Rebuildable local cache |
| MCP DNA baseline | Package `harness/` |

ArtifactGraph indexes product artifacts and runs product-defined allowlisted
commands. It does not promote or rewrite product registries.

## Current-project context

CLI commands use `process.cwd()`. A project-local MCP entry includes
`--project-root` for the repo where `artifactgraph init` ran; the launcher
exposes that root to MCP handlers.

Normal MCP tools do not resolve a `projectId` through `platform-repos.json`.
Project maps remain optional tooling/migration inventory only.

## Path policy

- absolute paths remain absolute;
- relative paths resolve under the current repo;
- relative gap globs run under the current repo only;
- external `@project/...` paths are legacy and rejected/skipped;
- there are no implicit docs/tests hub roots.

Optional missing paths degrade to diagnostics or empty results and must not
abort status, suggest, or analysis.

## Lexicons

Resolution order:

1. configured project-local file;
2. package baseline under `lexicon/`;
3. empty.

`artifactgraph init` copies the selected baseline into
`artifactgraph/lexicon/`, after which the project owns its copy. `test` installs
the testcase taxonomy; every type installs registry tags.

## Managed-file updates

`.artifactgraph/install-manifest.json` stores package version, selected types,
source paths, content hashes, and an optional stale marker. It also identifies
the owning package and declares `schemaVersion`, `toolApi`, and `harnessApi`.
Init validates compatibility before writing, and prune validates it before
deleting. ArtifactGraph 2.0.0 `version: 1` manifests are accepted as legacy and
migrated by successful init; incompatible manifests fail closed. On update:

- missing → create;
- same as package → skip;
- same as prior managed hash → update;
- customized → conflict unless `--force`.
- no longer selected → retain its prior hash and mark stale.

Init does not delete phase skills or unrelated product rules. `prune` is a
dry-run unless `--yes` is supplied. It only deletes stale regular files whose
content still matches the managed hash and whose source/destination mapping is
compatible with packaged harness or lexicon locations. Modified, unmanaged,
symlinked, incompatible, and out-of-root paths are preserved. Product
registries/config, the local index, and platform maps are outside prune scope.

## Local-first loop

```text
rebuild local index
  → analyze / grill / parity / suggest
  → member confirms local A/B/C
  → run allowlisted gen
  → optional cloudPromptSlice for unresolved work only
  → promote in product repo
  → rebuild + remember
```

## Rebuild safety

Registry and lexicon indexing runs in a SQLite transaction and the store closes
in `finally`. Lexicon namespaces are cleared before optional re-index so removed
vocabularies cannot leave stale rows.

## Harness types

| Type | Package assets |
|------|----------------|
| `common` | skill, rule, core hooks, registry lexicon |
| `docs` | docs + legacy/parity hooks |
| `fe` | frontend hooks |
| `be` | backend hooks |
| `test` | test hooks + taxonomy |
| `all` | all assets, explicit only |

Product phase skills (`/spec`, `/prototype`, `/api`, `/testcase`, etc.) remain
owned by their lane repos and are not shipped as ArtifactGraph MCP DNA.
