/**
 * Load / write artifactgraph.json inside a product repo.
 *
 * Brownfield init does NOT copy templates — it only drops this config
 * (often cloned from stacks/<stack>.json) so MCP knows allowlisted commands
 * and optional dsl.lanes pointers. Registry JSON payloads stay in product git.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { packageRoot } from './platform-repos.js'
import type { ArtifactgraphConfig } from '../types.js'

export const CONFIG_NAME = 'artifactgraph.json'
export const INDEX_DIR = '.artifactgraph'

/** Read product-repo config; returns null if not initialized. */
export function loadRepoConfig(repoRoot: string): ArtifactgraphConfig | null {
  const file = path.join(repoRoot, CONFIG_NAME)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as ArtifactgraphConfig
}

/** Require config or throw (used by gen / analyze when project must be wired). */
export function requireRepoConfig(repoRoot: string): ArtifactgraphConfig {
  const cfg = loadRepoConfig(repoRoot)
  if (!cfg) {
    throw new Error(
      `Missing ${CONFIG_NAME} in ${repoRoot}. Run: artifactgraph init-project`,
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
  return JSON.parse(readFileSync(file, 'utf8')) as ArtifactgraphConfig
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
    writeFileSync(gitignore, '*\n!.gitignore\n', 'utf8')
  }
  return dest
}
