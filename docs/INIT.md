# `artifactgraph init`

`init` wires selected agents and initializes or safely updates the current
product repository. ArtifactGraph is standalone: normal runtime does not require
`platform-repos.json`, `base-docs`, or `base-tests`.

## Interactive

Always run from the target repository:

```bash
cd /path/to/product
artifactgraph init
```

The wizard first selects target agents, then install location, then ArtifactGraph
types:

- `common` — core skill, rule, hooks, and registry-tag lexicon; always included
- `docs` — docs/spec and legacy/parity hooks
- `fe` — frontend hooks
- `be` — backend hooks
- `test` — testcase hooks and taxonomy
- `all` — every type; only installed when explicitly selected

## Non-interactive

```bash
artifactgraph init --target=cursor --type=fe --yes
artifactgraph init --target=cursor,claude --type=fe,be --yes
artifactgraph init --target=all --type=all --yes
```

Project-local agent configuration is the default. Agents that only support
global configuration are reported as skipped unless `--location=global` is
explicit.

## Files installed

```text
artifactgraph.json
artifactgraph/lexicon/registry-tags.en.txt
artifactgraph/lexicon/testcase-taxonomy.en.txt   # test/all
.artifactgraph/install-manifest.json
.cursor/skills/artifactgraph/SKILL.md
.cursor/rules/artifactgraph.mdc
.cursor/extracts/artifactgraph-hooks-*.md
```

The local MCP launcher is pinned to the repository where `init` ran. MCP product
tools therefore use that repo directly and do not accept/require a project id.

## Safe updates

Re-run `artifactgraph init` after upgrading the package:

- missing managed files are created;
- unchanged managed files are updated;
- files already matching the package are skipped;
- customized managed files are reported as conflicts;
- `--force` explicitly replaces conflicts.

Hashes and selected types are stored in
`.artifactgraph/install-manifest.json`. Existing product phase skills and
unrelated rules are never removed by init.

## Compatibility aliases

`artifactgraph init-project` and `artifactgraph install` remain temporary
deprecated aliases. New automation must call `artifactgraph init`.

## After init

```bash
artifactgraph rebuild
artifactgraph status
artifactgraph suggest --lane=fe --bullets="list with filters"
```

`rebuild` reads product-local registries and lexicons into
`.artifactgraph/index.db`. Product git remains SSOT.

## WSL

Use project-local Cursor configuration from inside the WSL repo. The generated
MCP entry uses the package launcher and records the initialized project root.
Node 22 or newer is required for `node:sqlite`.
