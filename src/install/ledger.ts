/**
 * Install ledger for repo-local ArtifactGraph harnesses.
 *
 * State survives CLI upgrades/removal:
 *   $ARTIFACTGRAPH_STATE_DIR
 *   $XDG_STATE_HOME/artifactgraph
 *   ~/.local/state/artifactgraph
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const INSTALL_MANIFEST_REL = '.artifactgraph/install-manifest.json'

export function stateDir(): string {
  if (process.env.ARTIFACTGRAPH_STATE_DIR) {
    return path.resolve(process.env.ARTIFACTGRAPH_STATE_DIR)
  }
  const base = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(os.homedir(), '.local', 'state')
  return path.join(base, 'artifactgraph')
}

export function ledgerPath(): string {
  return path.join(stateDir(), 'installs.json')
}

function normalize(repoRoot: string): string {
  const absolute = path.resolve(repoRoot)
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

function hasManifest(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, ...INSTALL_MANIFEST_REL.split('/')))
}

function rawRepos(): string[] {
  const file = ledgerPath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { repos?: unknown }
    const repos = Array.isArray(parsed.repos) ? parsed.repos : []
    return [
      ...new Set(
        repos
          .filter((repo): repo is string => typeof repo === 'string')
          .map(normalize),
      ),
    ]
  } catch {
    return []
  }
}

export function readLedger(): string[] {
  return rawRepos().filter(hasManifest)
}

function writeLedger(repos: string[]): void {
  try {
    const file = ledgerPath()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(
      file,
      `${JSON.stringify({ version: 1, repos: [...new Set(repos)].sort() }, null, 2)}\n`,
      'utf8',
    )
  } catch {
    // Best effort: lifecycle safety does not depend on the ledger.
  }
}

export function recordInstall(repoRoot: string): void {
  const root = normalize(repoRoot)
  const repos = rawRepos()
  if (!repos.includes(root)) writeLedger([...repos, root])
}

export function forgetInstall(repoRoot: string): void {
  const root = normalize(repoRoot)
  const repos = rawRepos()
  if (repos.includes(root)) writeLedger(repos.filter((repo) => repo !== root))
}

export function removeLedger(): boolean {
  const file = ledgerPath()
  if (!existsSync(file)) return false
  try {
    unlinkSync(file)
    return true
  } catch {
    return false
  }
}

/** Recover older installs that predate the ledger. */
export function discoverInstalls(dir: string, maxDepth = 5): string[] {
  const found: string[] = []
  const walk = (current: string, depth: number): void => {
    if (depth > maxDepth) return
    if (hasManifest(current)) {
      found.push(normalize(current))
      return
    }
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const child = path.join(current, name)
      try {
        if (statSync(child).isDirectory()) walk(child, depth + 1)
      } catch {
        // Skip unreadable paths and racing deletions.
      }
    }
  }
  walk(path.resolve(dir), 0)
  return [...new Set(found)]
}
