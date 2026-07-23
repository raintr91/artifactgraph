/**
 * Shared `.gitignore` contract (Platform DNA semantics, ported standalone).
 *
 * Destination repos never hand-maintain toolkit ignore blocks. ArtifactGraph
 * merges only the entries its own init actually generated: idempotent,
 * EOL-preserving, equivalence-aware, with shared vs exclusive ownership.
 */

import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface OwnedGitignoreEntry {
  pattern: string
  /**
   * Shared entries may be relied on by other toolkits (for example `.cursor/`
   * or `.cursor/mcp.json`). They are ensured on init but kept on deinit.
   */
  shared?: boolean
}

export interface EnsureGitignoreResult {
  file: string
  /** Entries newly written by this call (trimmed source form). */
  added: string[]
  changed: boolean
}

export interface RemoveGitignoreResult {
  file?: string
  removed: string[]
  changed: boolean
}

export interface GeneratedTargetsInput {
  root: string
  /** Absolute paths written by installAgents under the repo (local only). */
  writtenAgentPaths?: string[]
  /** True when this init created artifactgraph.json (not a pre-existing file). */
  createdConfig?: boolean
  /** True when harness/lexicon assets under .cursor/ were installed. */
  wroteCursorHarness?: boolean
  /** True when lexicon assets under artifactgraph/ were installed. */
  wroteLexicon?: boolean
}

const LEGACY_START = '# >>> artifactgraph generated files'
const LEGACY_END = '# <<< artifactgraph generated files'

/**
 * Canonical form so `.cursor/`, `/.cursor/` and `.cursor` compare equal.
 * Preserves negation (`!`) and glob text; only leading `./`, leading `/` and
 * trailing `/` are normalized because git treats those as equivalent anchors.
 */
export function canonicalGitignorePattern(pattern: string): string {
  let value = pattern.trim()
  if (!value) return ''
  let negated = false
  if (value.startsWith('!')) {
    negated = true
    value = value.slice(1)
  }
  value = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
  return `${negated ? '!' : ''}${value}`
}

function detectEol(content: string): '\r\n' | '\n' {
  return /\r\n/.test(content) ? '\r\n' : '\n'
}

function presentPatterns(content: string): Set<string> {
  const set = new Set<string>()
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    set.add(canonicalGitignorePattern(line))
  }
  return set
}

function gitignorePath(root: string): string {
  const file = path.join(path.resolve(root), '.gitignore')
  if (existsSync(file) && !lstatSync(file).isFile()) {
    throw new Error(`.gitignore is not a regular file: ${file}`)
  }
  return file
}

/**
 * Strip the legacy ArtifactGraph marker block if present. Returns whether the
 * file content changed. Member lines outside the block are preserved.
 */
export function stripLegacyGitignoreBlock(root: string): { file: string; changed: boolean } {
  const file = gitignorePath(root)
  if (!existsSync(file)) return { file, changed: false }
  const original = readFileSync(file, 'utf8')
  const eol = detectEol(original)
  const hadTrailingNewline = /\r?\n$/.test(original)
  const lines = original.split(/\r?\n/)
  const start = lines.indexOf(LEGACY_START)
  if (start < 0) return { file, changed: false }
  const end = lines.indexOf(LEGACY_END, start + 1)
  if (end < 0) {
    throw new Error(`Invalid .gitignore: missing "${LEGACY_END}"`)
  }
  const kept = [...lines.slice(0, start), ...lines.slice(end + 1)]
  if (hadTrailingNewline && kept[kept.length - 1] === '') kept.pop()
  while (kept.length > 0 && kept.at(-1) === '') kept.pop()
  const body = kept.join(eol)
  const next = body.length ? `${body}${eol}` : ''
  if (next === original) return { file, changed: false }
  writeFileSync(file, next, 'utf8')
  return { file, changed: true }
}

/**
 * Ensure every pattern is present exactly once. Creates the file when missing,
 * preserves existing member content and the file's dominant EOL, and never
 * duplicates an equivalent pattern.
 */
export function ensureGitignoreEntries(root: string, patterns: string[]): EnsureGitignoreResult {
  const file = gitignorePath(root)
  const existed = existsSync(file)
  const content = existed ? readFileSync(file, 'utf8') : ''
  const eol = existed ? detectEol(content) : '\n'
  const present = presentPatterns(content)

  const seen = new Set<string>()
  const added: string[] = []
  for (const pattern of patterns) {
    const canonical = canonicalGitignorePattern(pattern)
    if (!canonical || present.has(canonical) || seen.has(canonical)) continue
    seen.add(canonical)
    added.push(pattern.trim())
  }
  if (!added.length) return { file, added: [], changed: false }

  const prefix = content.length > 0 && !/\r?\n$/.test(content) ? eol : ''
  writeFileSync(file, `${content}${prefix}${added.join(eol)}${eol}`)
  return { file, added, changed: true }
}

/**
 * Remove the given patterns (matched by equivalence) while preserving unrelated
 * member lines and the file's dominant EOL. Missing files/patterns are a no-op.
 */
export function removeGitignoreEntries(root: string, patterns: string[]): RemoveGitignoreResult {
  const file = gitignorePath(root)
  if (!existsSync(file)) return { removed: [], changed: false }

  const content = readFileSync(file, 'utf8')
  const eol = detectEol(content)
  const drop = new Set(patterns.map(canonicalGitignorePattern).filter(Boolean))
  const hadTrailingNewline = /\r?\n$/.test(content)

  const removed: string[] = []
  const kept: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    const canonical = trimmed && !trimmed.startsWith('#') ? canonicalGitignorePattern(trimmed) : ''
    if (canonical && drop.has(canonical)) {
      removed.push(trimmed)
      continue
    }
    kept.push(raw)
  }
  if (!removed.length) return { file, removed: [], changed: false }

  if (hadTrailingNewline && kept[kept.length - 1] === '') kept.pop()
  const body = kept.join(eol)
  writeFileSync(file, body.length && hadTrailingNewline ? `${body}${eol}` : body)
  return { file, removed, changed: true }
}

/** Merge previous + next ownership; shared is sticky once set. */
export function mergeGitignoreEntries(
  previous: OwnedGitignoreEntry[] | undefined,
  next: OwnedGitignoreEntry[] | undefined,
): OwnedGitignoreEntry[] {
  const byPattern = new Map<string, OwnedGitignoreEntry>()
  for (const entry of [...(previous ?? []), ...(next ?? [])]) {
    const key = canonicalGitignorePattern(entry.pattern)
    if (!key) continue
    const existing = byPattern.get(key)
    byPattern.set(key, {
      pattern: existing?.pattern ?? entry.pattern.trim(),
      ...(entry.shared || existing?.shared ? { shared: true } : {}),
    })
  }
  return [...byPattern.values()]
}

/** Map a repo-relative agent config path to the ignore pattern we own. */
export function agentPathIgnorePattern(repoRelative: string): string | null {
  const posix = repoRelative.split(path.sep).join('/').replace(/^\.\//, '')
  if (!posix || posix.startsWith('../')) return null
  const top = posix.split('/')[0]
  if (!top) return null
  // File-scoped agent configs stay exact.
  if (
    top === '.mcp.json' ||
    top === '.claude.json' ||
    top === 'opencode.json' ||
    top === 'opencode.jsonc'
  ) {
    return top
  }
  // Nested agent dirs (e.g. .codex/config.toml, .cursor/mcp.json) → top dir.
  if (top.startsWith('.')) return `${top}/`
  return null
}

/**
 * Desired ignore patterns for this init, derived from artifacts actually
 * produced under the repo. Global/out-of-repo agent paths are excluded.
 */
export function desiredGitignorePatterns(input: GeneratedTargetsInput): {
  exclusive: string[]
  shared: string[]
} {
  const exclusive: string[] = ['.artifactgraph/', '.docskit/']
  if (input.wroteLexicon) exclusive.push('artifactgraph/')
  if (input.createdConfig) exclusive.push('artifactgraph.json')

  const shared: string[] = []
  if (input.wroteCursorHarness) shared.push('.cursor/')

  const root = path.resolve(input.root)
  for (const absolute of input.writtenAgentPaths ?? []) {
    const resolved = path.resolve(absolute)
    const rel = path.relative(root, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
    const pattern = agentPathIgnorePattern(rel)
    if (pattern) shared.push(pattern)
  }

  const dedupe = (items: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of items) {
      const key = canonicalGitignorePattern(item)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }

  return { exclusive: dedupe(exclusive), shared: dedupe(shared) }
}

/**
 * Ensure desired patterns and return ownership records for the manifest.
 * Exclusive patterns are claimed only when this run actually added them;
 * shared patterns are always recorded when intended (sticky across toolkits).
 */
export function applyGeneratedGitignore(input: GeneratedTargetsInput): {
  file: string
  changed: boolean
  entries: OwnedGitignoreEntry[]
  added: string[]
} {
  const legacy = stripLegacyGitignoreBlock(input.root)
  const desired = desiredGitignorePatterns(input)
  const allPatterns = [...desired.exclusive, ...desired.shared]
  const ensured = ensureGitignoreEntries(input.root, allPatterns)
  const addedSet = new Set(ensured.added.map(canonicalGitignorePattern))

  const entries: OwnedGitignoreEntry[] = []
  for (const pattern of desired.exclusive) {
    if (addedSet.has(canonicalGitignorePattern(pattern))) {
      entries.push({ pattern })
    }
  }
  for (const pattern of desired.shared) {
    entries.push({ pattern, shared: true })
  }

  return {
    file: ensured.file,
    changed: legacy.changed || ensured.changed,
    entries: mergeGitignoreEntries([], entries),
    added: ensured.added,
  }
}

/** Status rows for owned ignore entries against the live `.gitignore`. */
export function gitignoreEntryStatus(
  root: string,
  entries: OwnedGitignoreEntry[],
): Array<{ pattern: string; shared: boolean; present: boolean }> {
  if (!entries.length) return []
  const file = gitignorePath(root)
  const present = new Set<string>()
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) present.add(canonicalGitignorePattern(trimmed))
    }
  }
  return entries.map((entry) => ({
    pattern: entry.pattern,
    shared: Boolean(entry.shared),
    present: present.has(canonicalGitignorePattern(entry.pattern)),
  }))
}
