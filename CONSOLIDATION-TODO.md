# ArtifactGraph — consolidation handoff

Status: **planned — implement in this repo**  
Workspace: `/home/vutv/workspace/artifactgraph`  
Origin chat: base-docs hub discussion (docs tree + AG vocabulary ownership)

## Why this exists

ArtifactGraph must work for **many repos**, not only the `base-*` cluster.

Today several stacks hardcode hub paths such as:

```json
"vocabularies": {
  "registryTags": "@base-docs/platform/toolchain/lexicon/registry-tags.en.txt",
  "testTaxonomy": "@base-tests/catalog/lexicon/testcase-taxonomy.en.txt"
}
```

Plus similar hub coupling in `gapSources` / `specRoots` / `hubs.*` and
allowlisted command argv such as `pnpm --dir @base-docs ...`.

That is unsafe: external Laravel / FastAPI / .NET / other products may not have those hubs.

**Rule decided with owner:**

- Runtime MCP resolves the **current repo (`cwd`)**. It must not require a
  `projectId`, `repoRoot=.` argument, or lookup in packaged `platform-repos.json`.
- User runs `cd <target-repo> && artifactgraph init`.
- `platform-repos.json` may remain a tooling/migration inventory, but is never a
  runtime or init prerequisite.
- Package ships lexicon + MCP DNA baseline and syncs them on `artifactgraph init`.
- Resolve: **project-local → package baseline → empty** (never hub fallback).
- `@base-docs` / `@base-tests` links are OK only in **usage/guide docs**, not default stacks.
- Existing platform repos migrate to the same local model; no permanent hub
  runtime fallback is retained merely because a repo belongs to the base cluster.

Also: Cursor DNA (skill / rule / phase-hooks) is **triplicated** and drifted:

| Location | Role today |
|----------|------------|
| `artifactgraph/.cursor/` | Package-dev copy |
| `artifactgraph/examples/cursor/` | Consumer template (diverged; weaker parity) |
| `base-docs/.cursor/` | Hub copy (full hooks + older skill) |

Today `artifactgraph init` only wires MCP agents and `init-project` only writes
`artifactgraph.json`. Target UX consolidates both into `artifactgraph init`;
`init-project` remains a deprecated compatibility alias.

---

## Principles

1. **No hub or central project-map dependency** at runtime.
2. **Per-project ownership** of vocabulary + installed harness.
3. **Hub links only in docs/guides.**
4. **Type-scoped install:** `common` / `docs` / `fe` / `be` / `test` / `all`;
   every lane type automatically includes `common`.
5. **Do not touch `.agents/`** in this pass.
6. Phase skills (`/spec`, `/prototype`, …) stay on lane hubs/product repos — only **MCP DNA** consolidates here.
7. Re-running `artifactgraph init` is the update path: update package-managed
   files, preserve user customizations, and require `--force` for conflicts.

---

## Context — lexicon seed

Current rich vocabulary lives at hub (seed once into package baseline, then projects own copies):

- Hub reference (docs only after migration):  
  `../base-docs/platform/toolchain/lexicon/registry-tags.en.txt`  
  Includes `#process:` + section K (Business Process / E2E / Use Case / Scenario).
- Plans taxonomy hub:  
  `../base-tests/catalog/lexicon/testcase-taxonomy.en.txt`

Target layout after init:

```text
<product-repo>/
├─ artifactgraph.json
├─ artifactgraph/lexicon/
│  ├─ registry-tags.en.txt
│  └─ testcase-taxonomy.en.txt   # type=test/all
├─ .artifactgraph/install-manifest.json
└─ .cursor/
   ├─ skills/artifactgraph/
   ├─ rules/artifactgraph.mdc
   └─ extracts/artifactgraph-*.md
```

```json
"vocabularies": {
  "registryTags": "artifactgraph/lexicon/registry-tags.en.txt"
}
```

---

## Context — init types

| Type | Example repos | Install |
|------|---------------|---------|
| `common` | all | `/artifactgraph` skill + rule + hooks-core + registry lexicon |
| `docs` | docs hub / docs lanes | common + hooks-docs (+ legacy/parity) |
| `fe` | nuxt4, nextjs, client | common + hooks-fe |
| `be` | laravel, fastapi, dotnet backend | common + hooks-be |
| `test` | e2e/tests/plans | common + hooks-test + testcase taxonomy |
| `all` | explicit only | common + docs + fe + be + test |

The selector is multi-select like agent target selection. `all` selects every
type and must never be silently inferred.

---

## Epic A — Standalone runtime and unified init

### A1. Inventory and guard runtime coupling
- [x] Scan stacks, commands, config/path resolvers, lexicon loaders, MCP tools,
  docs, skills, rules, and extracts.
- [x] Inventory every runtime `@base-docs` / `@base-tests` use in `commands`,
  `vocabularies`, `gapSources`, `specRoots`, and `hubs.*`.
- [x] CI guard: default stacks/runtime code cannot contain base hub IDs;
  guide-only references remain allowed.

### A2. Remove `platform-repos.json` from runtime
- [x] Introduce one current-project context based on MCP/init process `cwd`.
- [x] MCP product tools no longer require `projectId`; do not add redundant
  `repoRoot=.` parameters.
- [x] `artifactgraph_projects` is not required for product operations; retire it
  or make it diagnostics-only.
- [x] Optional project maps remain tooling/migration inputs only.
- [x] Local MCP wiring launches against the repo in which `init` ran.

### A3. Local, non-throwing path policy
- [x] Remove implicit `base-docs` / `base-tests` defaults from `resolveHubRoots`.
- [x] Remove hub fallback from spec resolution and relative gap-source expansion.
- [x] Relative paths/globs resolve under the current product root only.
- [x] Missing optional paths return diagnostics / empty results; never abort
  `status`, `rebuild`, `suggest`, analyze, or gaps.
- [x] Remove or isolate `@project/...` expansion from default runtime behavior.

### A4. Ship baseline lexicons
- [x] Add `lexicon/registry-tags.en.txt` (generic baseline; seed from hub once).
- [x] Add `lexicon/testcase-taxonomy.en.txt` for `test` / `all`.
- [x] Loader: **project-local → package baseline → empty** (never hub fallback).
- [x] Add `lexicon/` to `package.json.files`; verify the packed artifact.
- [x] Support section K / `#process:` and add parser fixtures.
- [x] Clear stale lexicon SQLite namespaces before optional re-index.

### A5. Unify setup/update under `artifactgraph init`
- [x] In TTY with no params, show multi-select target agents followed by
  multi-select type: `common`, `docs`, `fe`, `be`, `test`, `all`.
- [x] User runs from target repo; use `cwd`. No required `--repo` or project ID.
- [x] Non-interactive:
  `artifactgraph init --target=cursor,claude --type=fe,test --yes`.
- [x] One init syncs MCP config, local project config, lexicons, and selected
  skills/rules/hooks.
- [x] `init-project` becomes a deprecated compatibility alias for project setup.
- [x] Unknown stack defaults to `generic`, never `nuxt4`; detection may suggest
  type/defaults but must not override user selection.

### A6. Safe copy/update semantics
- [x] Copy `artifactgraph/lexicon/*.txt`; config uses relative in-repo paths only.
- [x] First install creates missing package-managed files.
- [x] Re-run updates files unchanged from their prior package version.
- [x] Preserve customized files and report conflicts; `--force` overwrites explicitly.
- [x] Record package version, selected types, target files, and hashes in
  `.artifactgraph/install-manifest.json`.
- [x] Existing config must not prevent repair of missing lexicon/harness files.
- [x] Report `created` / `updated` / `skipped` / `conflict` accurately; write atomically.

### A7. Genericize stacks/config
- [x] Add a `generic` preset with empty/local commands, registries, and paths.
- [x] Remove hub IDs from all default commands, vocabularies, gap sources,
  spec roots, and hubs.
- [x] Do not install product-specific `portal:*`, `api:*`, or runner commands
  into unrelated repos.
- [x] Keep product commands only when the selected stack owns those scripts.
- [x] Add config schema validation and migration for version-1 configs.

### A8. Docs and package metadata
- [x] Update `docs/INIT.md` / `docs/INTERNALS.md`: per-project vocabulary,
  unified init, type selection, safe update, deprecated `init-project`.
- [x] Remove “lexicons on hubs” and “platform-bases only” wording from tools,
  README, comments, package description, skills, rules, and examples.
- [x] Align package, lockfile, and MCP server version metadata.

### A9. Standalone verification
- [x] Fresh isolated repo without base-*:
  `init` → `rebuild` → `status` → `suggest_tags`.
- [x] MCP tools work when the repo is absent from `platform-repos.json`.
- [x] Verify `docs`, `fe`, `be`, `test`, and explicit `all` independently.
- [x] Re-run is idempotent; customized-file conflict and `--force` are tested.
- [x] Smoke-test installation from `npm pack`, not only source/git clone.
- [x] Failed rebuild closes SQLite and cannot leave partial/stale index state.

---

## Epic B — Ship MCP DNA and skills through init

### B1. Single SSOT in this package
- [x] Canonical, shippable tree under `harness/`.
- [x] Add `harness/` to `package.json.files`.
- [x] `examples/cursor/` is generated export only; CI fails on drift.

### B2. Reconcile triplicated copies
- [x] Merge best of package `.cursor/`, `examples/cursor/`, and hub `base-docs/.cursor/` AG files.
- [x] Keep current local-first MCP tools in the skill; remove dependency on
  central project discovery.
- [x] Parity/legacy belongs only to the **docs** type overlay.
- [x] Fix wrong paths in examples (`docs/operational/...`).
- [x] Do not copy unrelated phase skills from the old
  `full/shared/docs/tests/tooling` platform sync profiles.

### B3. Split hooks by init type
- [x] `hooks-core.md`
- [x] `hooks-docs.md` (spec/grill/docsRender + legacy/parity)
- [x] `hooks-fe.md` · `hooks-be.md` · `hooks-test.md`
- [x] stacks → install type suggestions only; explicit user choice wins.

### B4. Integrate harness into CLI and MCP
- [x] `artifactgraph init` installs the selected types; no second required command.
- [x] MCP exposes equivalent init/update and harness-status capabilities.
- [x] MCP tools install the package-owned skill/rule/extract assets into current repo.
- [x] Reuse the manifest/hash conflict policy from A6.
- [x] Never install `all` unless the user explicitly selects it.

### B5. Thin hub copies (after A9)
- [ ] Hub AG skill/rule → short pointer to this package.
- [ ] Keep docs phase skills on hub.
- [ ] Hub `extract-registry`: core + docs overlay only.
- [ ] Skip `.agents/` mirror.

### B6. Hub docs = guides only
- [ ] Hub `platform/toolchain/ARTIFACTGRAPH*.md` remain overview links.
- [ ] Hub `registry-tags.en.txt` = **docs-project vocabulary** after migration, not global SSOT.

### B7. Multi-repo verify
- [ ] FE (nuxt4): common + fe.
- [ ] BE (laravel): common + be.
- [ ] Docs: common + docs; Test hub: common + test.
- [ ] Fullstack: common + fe + be; all only when explicitly requested.
- [x] External repo: package baseline + local files only.

---

## Epic C — Platform repo migration and cleanup handoffs

ArtifactGraph must not bulk-delete target-repo files. After the new init is
verified, create a repo-local cleanup handoff in every affected platform repo.

### C1. Generate one TODO per destination repo
- [x] Create root `ARTIFACTGRAPH-CLEANUP-TODO.md` in:
  `portal`, `nextjs`, `nuxt_nest`, `next_nest`, `api`, `fast-api-base`,
  `integration`, `line`, `base-docs`, `base-tests`, and `hubdocs` when applicable.
- [x] Uninstall prior AG install on those repos (`artifactgraph.json`,
  `.artifactgraph/`, AG MCP entry, AG skill/rule/hooks) so owners can reinstall clean.
- [x] Generate content from actual files/diff in that repo; do not paste a blind
  generic delete list.
- [x] Include selected init type, migration command, owner/review gate, exact
  paths, reason, replacement source, verification, and rollback note.
- [x] TODO generation is allowed; deletion remains a separate reviewed action.

### C2. Config cleanup checklist per product repo
- [ ] Replace hub vocabularies with `artifactgraph/lexicon/*.txt`.
- [ ] Remove `hubs`, hub `specRoots`, hub `gapSources`, and hub-backed command argv.
- [ ] Preserve valid repo-local registries, templates, and commands.
- [ ] Re-run `init`, `rebuild`, `status`, and lane-appropriate `suggest_tags`.

### C3. DNA cleanup checklist
- [ ] Mark old duplicate `.cursor/skills/artifactgraph/`,
  `.cursor/rules/artifactgraph.mdc`, and AG-owned extracts for removal only after
  the package-managed replacements are installed and diff-reviewed.
- [ ] Keep product/lane phase skills (`prototype`, `api`, `spec`, `testcase`,
  grill, unit, wire, etc.).
- [ ] Keep unrelated product rules (`platform-code-size`, `team-flow-*`, etc.).
- [ ] Never touch `.agents/`.

### C4. Suggested migration types
- [x] `portal`, `nextjs`: `fe`
- [x] `nuxt_nest`, `next_nest`: `fe,be`
- [x] `api`, `fast-api-base`, `integration`: `be`
- [ ] `line`: confirm `fe` vs `fe,be` from actual lane behavior before generating TODO.
- [x] `base-docs`: `docs`; keep docs phase skills, thin only duplicated AG DNA.
- [x] `base-tests`: `test`; keep testcase/grill-testcase phase skills.
- [ ] `hubdocs`: inspect actual use; do not infer a type solely from the old map.

### C5. Cleanup completion gate
- [ ] New package-managed files are present and manifest-tracked.
- [ ] No runtime `@base-docs` / `@base-tests` remains in product config.
- [ ] Repo works independently with sibling hubs unavailable.
- [ ] Cleanup TODO is reviewed before deleting duplicate files.
- [ ] Delete the cleanup TODO only after verification and owner sign-off.

---

## Out of scope

- Surface / `W-LN-*` ID allocation (docs skills).
- Merging Hubdocs into ArtifactGraph.
- Moving `/spec` or `/prototype` into this package.
- Syncing `.agents/` skills.
- Auto-wiping product `.cursor/`.
- Automatically deleting target-repo config/DNA; this pass creates reviewed
  root `ARTIFACTGRAPH-CLEANUP-TODO.md` handoffs instead.

---

## Execution order

```text
A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9
                         ↘
                          B1 → B2 → B3 → B4 → B5 → B6 → B7
                                                   ↘
                                                    C1 → C2 → C3 → C4 → C5
```

Finish **A9** before thinning hub copies (B5). Finish B7 before approving
target-repo deletions from Epic C.

---

## Definition of done

- [x] No central project map, `projectId`, or hub dependency in normal MCP runtime.
- [x] No `@base-docs` / `@base-tests` in default stack runtime paths or commands.
- [x] New project: `cd repo && artifactgraph init`; local lexicon + AG runs standalone.
- [x] No-arg TTY init offers target-agent and `docs|fe|be|test|all` selection.
- [x] Re-running init safely updates managed files without clobbering custom files.
- [ ] DNA skill/rule/hooks SSOT only in this package; base-docs has no full triplicate.
- [x] MCP DNA and skills are shipped and installed by type-scoped init.
- [ ] Docs hub links are documentation-only, not MCP runtime deps.
- [x] Every affected platform repo has an evidence-based cleanup TODO; no
  automatic cross-repo deletion occurred.

---

## Related paths in this repo

| Path | Note |
|------|------|
| `stacks/*.json` | Generic local presets; no hub runtime paths |
| `src/mcp/tools.ts` | Current-repo tools; no required project-map lookup |
| `src/lexicon/load-lexicon.ts` | Local → package → empty fallback |
| `src/config/load-config.ts` | Unified init config/migration |
| `src/config/resolve-paths.ts` | Local-only default path policy |
| `src/install/*` | Init wizard, type selection, managed-file sync |
| `harness/` | Shippable MCP DNA SSOT |
| `.cursor/skills|rules|extracts/` | DNA candidates (B) |
| `examples/cursor/` | Diverged consumer templates (B) |
| `docs/INIT.md` · `docs/INTERNALS.md` | Unified init/runtime docs |
| `ARTIFACTGRAPH-CLEANUP-TODO.md` | Per-target cleanup + clean-reinstall handoff |

Hub pointer (guide only): `../base-docs/platform/toolchain/ARTIFACTGRAPH.md`
https://www.youtube.com/watch?v=chIkNrI8KnA