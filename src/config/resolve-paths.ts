/**
 * Multi-hub path resolution.
 *
 * Paths may be:
 * - absolute
 * - relative to product `repoRoot` (incl. `../base-docs/...`)
 * - `@projectId` or `@projectId/sub/path` via platform-repos.json (workspace map)
 *
 * Prefer `@base-docs/...` / `@base-tests/...` so non-sibling layouts work
 * when ARTIFACTGRAPH_WORKSPACE (or workspace.path) points at the bases folder.
 */

import { existsSync, globSync } from 'node:fs'
import path from 'node:path'
import type { ArtifactgraphConfig } from '../types.js'
import { loadPlatformReposMap, resolveProject } from './platform-repos.js'

/** Resolve one config path (specRoot, lexicon, command --dir token, …). */
export function resolveConfigPath(repoRoot: string, relOrAbs: string): string {
  if (!relOrAbs) return path.resolve(repoRoot)
  if (path.isAbsolute(relOrAbs)) return relOrAbs
  if (relOrAbs.startsWith('@')) {
    const rest = relOrAbs.slice(1)
    const slash = rest.indexOf('/')
    const projectId = slash >= 0 ? rest.slice(0, slash) : rest
    const sub = slash >= 0 ? rest.slice(slash + 1) : ''
    const project = resolveProject(projectId)
    return sub ? path.join(project.root, sub) : project.root
  }
  return path.resolve(repoRoot, relOrAbs)
}

/** Hub project ids (defaults: base-docs / base-tests). */
export function resolveHubRoots(
  _repoRoot: string,
  cfg: ArtifactgraphConfig,
): { docs?: string; tests?: string } {
  const docsId = cfg.hubs?.docs ?? 'base-docs'
  const testsId = cfg.hubs?.tests ?? 'base-tests'
  const out: { docs?: string; tests?: string } = {}
  try {
    out.docs = resolveProject(docsId).root
  } catch {
    /* optional hub */
  }
  try {
    out.tests = resolveProject(testsId).root
  } catch {
    /* optional hub */
  }
  return out
}

/** Absolute directories listed in `specRoots`. */
export function resolveSpecRoots(repoRoot: string, cfg: ArtifactgraphConfig): string[] {
  return (cfg.specRoots ?? []).map((r) => resolveConfigPath(repoRoot, r))
}

/**
 * Resolve a spec/testcase path for analyze/grill.
 * Tries: absolute → @hub → repoRoot → each specRoot.
 */
export function resolveSpecPath(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  specPath: string,
): string {
  if (path.isAbsolute(specPath)) return specPath
  if (specPath.startsWith('@')) return resolveConfigPath(repoRoot, specPath)

  const underRepo = path.resolve(repoRoot, specPath)
  if (existsSync(underRepo)) return underRepo

  for (const root of resolveSpecRoots(repoRoot, cfg)) {
    const candidate = path.resolve(root, specPath)
    if (existsSync(candidate)) return candidate
  }

  const hubs = resolveHubRoots(repoRoot, cfg)
  for (const root of [hubs.docs, hubs.tests].filter(Boolean) as string[]) {
    const candidate = path.resolve(root, specPath)
    if (existsSync(candidate)) return candidate
  }

  return underRepo
}

/**
 * Expand `gapSources` globs under product repo + resolved hubs/specRoots.
 * Patterns may use @hub prefixes or repo-relative globs for HANDOFF / manifests.
 */
export function resolveGapSourceFiles(repoRoot: string, cfg: ArtifactgraphConfig): string[] {
  const hubs = resolveHubRoots(repoRoot, cfg)
  const searchRoots = [
    repoRoot,
    ...resolveSpecRoots(repoRoot, cfg),
    hubs.docs,
    hubs.tests,
  ].filter((r): r is string => Boolean(r))

  const uniqueRoots = [...new Set(searchRoots.map((r) => path.resolve(r)))]
  const found = new Set<string>()

  for (const raw of cfg.gapSources ?? []) {
    if (raw.startsWith('@')) {
      const rest = raw.slice(1)
      const slash = rest.indexOf('/')
      if (slash < 0) continue
      const projectId = rest.slice(0, slash)
      const pattern = rest.slice(slash + 1)
      let cwd: string
      try {
        cwd = resolveProject(projectId).root
      } catch {
        continue
      }
      for (const hit of safeGlob(pattern, cwd)) found.add(hit)
      continue
    }

    for (const cwd of uniqueRoots) {
      for (const hit of safeGlob(raw, cwd)) found.add(hit)
    }
  }

  return [...found].sort()
}

function safeGlob(pattern: string, cwd: string): string[] {
  if (!existsSync(cwd)) return []
  try {
    const hits = globSync(pattern, { cwd })
    return hits.map((rel) => (path.isAbsolute(rel) ? rel : path.join(cwd, rel)))
  } catch {
    return []
  }
}

/** Expand `@projectId[/…]` tokens inside allowlisted argv (after `{spec}` materialize). */
export function expandArgvPaths(repoRoot: string, argv: string[]): string[] {
  return argv.map((part) => {
    if (!part.startsWith('@')) return part
    try {
      return resolveConfigPath(repoRoot, part)
    } catch {
      return part
    }
  })
}

/** Resolve vocabulary lexicon path from config (relative to repo or @hub). */
export function resolveVocabularyPath(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  key: 'registryTags' | 'testTaxonomy',
): string | null {
  const rel = cfg.vocabularies?.[key]
  if (!rel) return null
  const abs = resolveConfigPath(repoRoot, rel)
  return existsSync(abs) ? abs : null
}

/** Summarize resolved roots for status / smoke. */
export function pathResolutionSummary(repoRoot: string, cfg: ArtifactgraphConfig) {
  const hubs = resolveHubRoots(repoRoot, cfg)
  return {
    repoRoot,
    hubs,
    specRoots: resolveSpecRoots(repoRoot, cfg),
    vocabularies: {
      registryTags: resolveVocabularyPath(repoRoot, cfg, 'registryTags'),
      testTaxonomy: resolveVocabularyPath(repoRoot, cfg, 'testTaxonomy'),
    },
    workspaceRoot: loadPlatformReposMap().workspaceRoot,
  }
}
