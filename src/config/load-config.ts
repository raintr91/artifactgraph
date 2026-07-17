/**
 * Load / write artifactgraph.json inside a product repo.
 *
 * Brownfield init does NOT copy templates — it only drops this config
 * (often cloned from stacks/<stack>.json) so MCP knows allowlisted commands
 * and optional dsl.lanes pointers. Registry JSON payloads stay in product git.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { packageRoot } from './platform-repos.js'
import type { ArtifactgraphConfig } from '../types.js'

export const CONFIG_NAME = 'artifactgraph.json'
export const INDEX_DIR = '.artifactgraph'

const artifactgraphConfigSchema = z.object({
  version: z.number().int().positive().optional(),
  stack: z.string().min(1),
  mode: z.enum(['brownfield', 'greenfield']),
  projectId: z.string().optional(),
  commands: z.record(z.string(), z.array(z.string())),
  registries: z.array(z.string()),
  gapSources: z.array(z.string()).optional(),
  specRoots: z.array(z.string()).optional(),
  hubs: z
    .object({ docs: z.string().optional(), tests: z.string().optional() })
    .optional(),
  vocabularies: z
    .object({
      registryTags: z.string().optional(),
      testTaxonomy: z.string().optional(),
    })
    .optional(),
  templates: z
    .object({ root: z.string(), engine: z.string() })
    .optional(),
  dsl: z.unknown().optional(),
})

export function parseRepoConfig(input: unknown): ArtifactgraphConfig {
  return artifactgraphConfigSchema.parse(input) as ArtifactgraphConfig
}

/** Standalone defaults when a repo has not been initialized yet. */
export function defaultRepoConfig(
  projectId = path.basename(process.cwd()),
): ArtifactgraphConfig {
  return {
    version: 2,
    stack: 'generic',
    mode: 'brownfield',
    projectId,
    commands: {},
    registries: [],
    gapSources: [],
    specRoots: [],
    vocabularies: {
      registryTags: 'artifactgraph/lexicon/registry-tags.en.txt',
    },
  }
}

/** Read product-repo config; returns null if not initialized. */
export function loadRepoConfig(repoRoot: string): ArtifactgraphConfig | null {
  const file = path.join(repoRoot, CONFIG_NAME)
  if (!existsSync(file)) return null
  return parseRepoConfig(JSON.parse(readFileSync(file, 'utf8')))
}

/** Load local config or standalone generic defaults. */
export function loadEffectiveRepoConfig(repoRoot: string): ArtifactgraphConfig {
  return loadRepoConfig(repoRoot) ?? defaultRepoConfig(path.basename(repoRoot))
}

/** Require config or throw (used by gen / analyze when project must be wired). */
export function requireRepoConfig(repoRoot: string): ArtifactgraphConfig {
  const cfg = loadRepoConfig(repoRoot)
  if (!cfg) {
    throw new Error(
      `Missing ${CONFIG_NAME} in ${repoRoot}. Run: artifactgraph init`,
    )
  }
  return cfg
}

/** Load stack preset from this package (stacks/nuxt4.json, …). */
export function loadStackPreset(stack: string): ArtifactgraphConfig {
  const file = path.join(packageRoot(), 'stacks', `${stack}.json`)
  if (!existsSync(file)) {
    throw new Error(`Unknown stack preset "${stack}" (expected ${file})`)
  }
  return parseRepoConfig(JSON.parse(readFileSync(file, 'utf8')))
}

/**
 * Write brownfield config into product repo + ensure .artifactgraph/ exists.
 * Never overwrites an existing artifactgraph.json unless `force`.
 */
export function writeBrownfieldConfig(
  repoRoot: string,
  opts: { stack: string; projectId: string; force?: boolean },
): string {
  const dest = path.join(repoRoot, CONFIG_NAME)
  if (existsSync(dest) && !opts.force) {
    return dest
  }
  const preset = loadStackPreset(opts.stack)
  const config: ArtifactgraphConfig = {
    version: 1,
    ...preset,
    projectId: opts.projectId,
    mode: 'brownfield',
  }
  writeFileSync(dest, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  mkdirSync(path.join(repoRoot, INDEX_DIR), { recursive: true })
  // Keep sqlite out of git
  const gitignore = path.join(repoRoot, INDEX_DIR, '.gitignore')
  if (!existsSync(gitignore)) {
    writeFileSync(
      gitignore,
      '*\n!.gitignore\n!install-manifest.json\n',
      'utf8',
    )
  }
  return dest
}
