/**
 * Standalone project path resolution.
 *
 * Paths may be:
 * - absolute
 * - relative to the current product `repoRoot`
 *
 * External `@projectId` paths are legacy and disabled in normal runtime.
 */

import { existsSync, globSync } from 'node:fs'
import path from 'node:path'
import type { ArtifactgraphConfig } from '../types.js'
import { packageRoot } from './platform-repos.js'

/** Resolve one config path (specRoot, lexicon, command --dir token, …). */
export function resolveConfigPath(repoRoot: string, relOrAbs: string): string {
  if (!relOrAbs) return path.resolve(repoRoot)
  if (path.isAbsolute(relOrAbs)) return relOrAbs
  if (relOrAbs.startsWith('@')) {
    throw new Error(
      `External project path "${relOrAbs}" is disabled; use a path inside the current repo`,
    )
  }
  return path.resolve(repoRoot, relOrAbs)
}

/** Legacy status shape; standalone runtime has no implicit hubs. */
export function resolveHubRoots(
  _repoRoot: string,
  _cfg: ArtifactgraphConfig,
): { docs?: string; tests?: string } {
  return {}
}

/** Absolute directories listed in `specRoots`. */
export function resolveSpecRoots(repoRoot: string, cfg: ArtifactgraphConfig): string[] {
  return (cfg.specRoots ?? []).flatMap((root) => {
    try {
      const resolved = resolveConfigPath(repoRoot, root)
      return existsSync(resolved) ? [resolved] : []
    } catch {
      return []
    }
  })
}

/**
 * Resolve a spec/testcase path for analyze/grill.
 * Tries: absolute → repoRoot → each explicitly configured local specRoot.
 */
export function resolveSpecPath(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  specPath: string,
): string {
  if (path.isAbsolute(specPath)) return specPath
  if (specPath.startsWith('@')) return path.resolve(repoRoot, specPath)

  const underRepo = path.resolve(repoRoot, specPath)
  if (existsSync(underRepo)) return underRepo

  for (const root of resolveSpecRoots(repoRoot, cfg)) {
    const candidate = path.resolve(root, specPath)
    if (existsSync(candidate)) return candidate
  }

  return underRepo
}

/**
 * Expand repo-relative `gapSources` globs under the current product only.
 */
export function resolveGapSourceFiles(repoRoot: string, cfg: ArtifactgraphConfig): string[] {
  const found = new Set<string>()

  for (const raw of cfg.gapSources ?? []) {
    if (raw.startsWith('@')) continue
    for (const hit of safeGlob(raw, repoRoot)) found.add(hit)
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

/** Reject legacy external-project tokens inside allowlisted argv. */
export function expandArgvPaths(repoRoot: string, argv: string[]): string[] {
  return argv.map((part) => {
    if (!part.startsWith('@')) return part
    return resolveConfigPath(repoRoot, part)
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
  try {
    const abs = resolveConfigPath(repoRoot, rel)
    if (existsSync(abs)) return abs
  } catch {
    // Legacy external path: fall through to the packaged standalone baseline.
  }
  const filename =
    key === 'registryTags' ? 'registry-tags.en.txt' : 'testcase-taxonomy.en.txt'
  const baseline = path.join(packageRoot(), 'lexicon', filename)
  return existsSync(baseline) ? baseline : null
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
  }
}
