/**
 * Resolve paths to platform-repos.json and product repos.
 *
 * Workspace resolution order:
 * 1. ARTIFACTGRAPH_WORKSPACE env
 * 2. ~/.artifactgraph/workspace.path (written by install.sh when ~/workspace exists)
 * 3. platform-repos.json workspaceRoot relative to package root
 *
 * Project `root` fields are relative to that workspace (e.g. "portal"), not the package.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { PlatformProject, PlatformReposMap } from '../types.js'

/** Absolute path to the artifactgraph package root. */
export function packageRoot(): string {
  // dist/config → ../.. ; src/config → ../.. ; both land on package root when built the same
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

/** Read optional file created by install.sh: one line = absolute workspace path. */
function readWorkspacePathFile(): string | undefined {
  const candidates = [
    path.join(packageRoot(), 'workspace.path'),
    path.join(os.homedir(), '.artifactgraph', 'workspace.path'),
  ]
  for (const f of candidates) {
    if (!existsSync(f)) continue
    const line = readFileSync(f, 'utf8').trim().split('\n')[0]?.trim()
    if (line) return line
  }
  return undefined
}

/**
 * Absolute directory that contains portal/, nextjs/, … bases.
 */
export function resolveWorkspaceRoot(mapWorkspaceRoot: string): string {
  if (process.env.ARTIFACTGRAPH_WORKSPACE) {
    return path.resolve(process.env.ARTIFACTGRAPH_WORKSPACE)
  }
  const fromFile = readWorkspacePathFile()
  if (fromFile) return path.resolve(fromFile)
  return path.resolve(packageRoot(), mapWorkspaceRoot)
}

/**
 * Load platform-repos.json shipped with this MCP.
 */
export function loadPlatformReposMap(mapPath?: string): PlatformReposMap {
  const file = mapPath ?? path.join(packageRoot(), 'platform-repos.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    workspaceRoot?: string
    defaultGroup?: string
    harness?: PlatformReposMap['harness']
    projects: Record<string, PlatformProject>
  }
  const workspaceRoot = resolveWorkspaceRoot(raw.workspaceRoot ?? '..')
  const projects: Record<string, PlatformProject> = {}
  for (const [id, p] of Object.entries(raw.projects ?? {})) {
    projects[id] = {
      ...p,
      root: path.resolve(workspaceRoot, p.root),
    }
  }
  return {
    workspaceRoot,
    defaultGroup: raw.defaultGroup ?? 'platform-bases',
    harness: raw.harness,
    projects,
  }
}

/** Resolve harness sync profile for a project id (full | shared | docs | tests | tooling). */
export function resolveHarnessProfile(
  projectId: string,
  map?: PlatformReposMap,
): string {
  const m = map ?? loadPlatformReposMap()
  const p = m.projects[projectId]
  if (!p) return 'shared'
  if (p.harnessProfile) return p.harnessProfile
  return m.harness?.defaultByRole?.[p.role] ?? 'shared'
}

/** Expected `.cursor/skills` folder names for a project (from harness.profiles). */
export function resolveHarnessSkills(
  projectId: string,
  map?: PlatformReposMap,
): string[] {
  const m = map ?? loadPlatformReposMap()
  const profile = resolveHarnessProfile(projectId, m)
  return m.harness?.profiles?.[profile]?.skills ?? []
}

/** Look up one project; throws with a helpful list if id is wrong. */
export function resolveProject(projectId: string, mapPath?: string): PlatformProject & { id: string } {
  const map = loadPlatformReposMap(mapPath)
  const p = map.projects[projectId]
  if (!p) {
    const ids = Object.keys(map.projects).join(', ')
    throw new Error(`Unknown projectId "${projectId}". Known: ${ids}`)
  }
  if (!existsSync(p.root)) {
    throw new Error(
      `Project root missing: ${p.root} (${projectId}). Set ARTIFACTGRAPH_WORKSPACE to your bases folder (e.g. ~/workspace).`,
    )
  }
  return { id: projectId, ...p }
}

/**
 * Infer stack from cwd product repo (brownfield heuristics).
 */
export function detectStack(repoRoot: string): string {
  if (existsSync(path.join(repoRoot, 'nuxt.config.ts'))) return 'nuxt4'
  if (existsSync(path.join(repoRoot, 'next.config.ts')) || existsSync(path.join(repoRoot, 'next.config.js'))) {
    if (existsSync(path.join(repoRoot, 'nestgen')) || existsSync(path.join(repoRoot, 'server'))) return 'nextjs-nest'
    return 'nextjs'
  }
  if (existsSync(path.join(repoRoot, 'pyproject.toml'))) return 'fastapi'
  if (existsSync(path.join(repoRoot, 'artisan')) || existsSync(path.join(repoRoot, 'src', 'make_help.md'))) return 'laravel'
  if (existsSync(path.join(repoRoot, 'Integration.sln'))) return 'dotnet-integration'
  if (existsSync(path.join(repoRoot, 'Line.sln'))) return 'dotnet-line'
  return 'generic'
}
