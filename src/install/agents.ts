/**
 * Wire artifactgraph MCP into agent configs (CodeGraph-style `install --target=`).
 *
 * Agents: cursor | claude | kilo
 * Interactive TTY: ↑↓ + Space toggle + Enter (like CodeGraph)
 * Non-interactive: --yes / --target=csv|auto|all
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { packageRoot } from '../config/platform-repos.js'
import { checkboxPrompt, selectPrompt } from './prompt.js'

export type AgentId = 'cursor' | 'claude' | 'kilo'
export type InstallLocation = 'global' | 'local'

export const AGENT_IDS: AgentId[] = ['cursor', 'claude', 'kilo']

const AGENT_LABEL: Record<AgentId, string> = {
  cursor: 'Cursor',
  claude: 'Claude Code',
  kilo: 'Kilo Code',
}

export interface InstallOptions {
  /** csv / auto / all / single id */
  target?: string
  location?: InstallLocation
  yes?: boolean
  useWsl?: boolean
  /** Override path for one-shot (legacy --mcp-file, cursor only) */
  mcpFile?: string
  /** Dump snippet for one agent; no writes */
  printConfig?: string
}

export interface InstallResult {
  targets: AgentId[]
  location: InstallLocation
  written: Array<{ agent: AgentId; path: string }>
  skipped: string[]
}

/** Build stdio MCP entry (shared shape for cursor/claude/kilo). */
export function buildMcpEntry(opts: { useWsl?: boolean } = {}): {
  type?: string
  command: string
  args: string[]
} {
  const root = packageRoot()
  const mcpJs = path.join(root, 'bin', 'artifactgraph-mcp.mjs')
  const nodeBin = process.execPath
  // Cursor-on-Windows + MCP code in WSL: must go through wsl.exe
  const winMcp = detectWindowsCursorMcpPath()
  const forceWsl =
    opts.useWsl ||
    process.env.ARTIFACTGRAPH_MCP_WSL === '1' ||
    Boolean(process.env.WSL_DISTRO_NAME && winMcp)

  if (forceWsl) {
    return {
      type: 'stdio',
      command: 'wsl.exe',
      args: ['-e', 'bash', '-lc', `exec '${nodeBin}' '${mcpJs}'`],
    }
  }

  return {
    type: 'stdio',
    command: nodeBin,
    args: [mcpJs],
  }
}

/** @deprecated use buildMcpEntry */
export function buildArtifactgraphMcpEntry(opts: { useWsl?: boolean } = {}) {
  const e = buildMcpEntry(opts)
  return { command: e.command, args: e.args }
}

export function defaultCursorMcpPath(): string {
  // Cursor on Windows reads %USERPROFILE%\.cursor\mcp.json — not WSL ~/.cursor
  const win = detectWindowsCursorMcpPath()
  if (win) return win
  return path.join(os.homedir(), '.cursor', 'mcp.json')
}

/** When running inside WSL, prefer the Windows Cursor config Cursor actually loads. */
export function detectWindowsCursorMcpPath(): string | undefined {
  const usersRoot = '/mnt/c/Users'
  if (!existsSync(usersRoot)) return undefined
  try {
    const names = readdirSync(usersRoot).filter(
      (n) => !n.startsWith('.') && n !== 'Public' && n !== 'Default' && n !== 'All Users',
    )
    for (const name of names) {
      const candidate = path.join(usersRoot, name, '.cursor', 'mcp.json')
      const dir = path.join(usersRoot, name, '.cursor')
      if (existsSync(candidate) || existsSync(dir)) return candidate
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function agentConfigPath(
  agent: AgentId,
  location: InstallLocation,
  cwd = process.cwd(),
): string {
  if (location === 'local') {
    if (agent === 'cursor') return path.join(cwd, '.cursor', 'mcp.json')
    if (agent === 'claude') return path.join(cwd, '.claude.json')
    return path.join(cwd, '.kilocode', 'mcp.json')
  }
  if (agent === 'cursor') return defaultCursorMcpPath()
  if (agent === 'claude') return path.join(os.homedir(), '.claude.json')
  return path.join(os.homedir(), '.kilocode', 'mcp.json')
}

/** Heuristic: agent looks installed / previously configured. */
export function detectAgents(cwd = process.cwd()): AgentId[] {
  const found: AgentId[] = []
  if (
    existsSync(path.join(os.homedir(), '.cursor')) ||
    existsSync(path.join(cwd, '.cursor'))
  ) {
    found.push('cursor')
  }
  if (
    existsSync(path.join(os.homedir(), '.claude.json')) ||
    existsSync(path.join(os.homedir(), '.claude')) ||
    existsSync(path.join(cwd, '.claude.json'))
  ) {
    found.push('claude')
  }
  if (
    existsSync(path.join(os.homedir(), '.kilocode')) ||
    existsSync(path.join(cwd, '.kilocode')) ||
    existsSync(path.join(cwd, '.kilo'))
  ) {
    found.push('kilo')
  }
  return found
}

export function parseTargets(raw: string | undefined, detected: AgentId[]): AgentId[] {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v || v === 'auto') return detected.length ? detected : (['cursor'] as AgentId[])
  if (v === 'all') return [...AGENT_IDS]
  if (v === 'none') return []
  const out: AgentId[] = []
  for (const part of v.split(/[,\s]+/).filter(Boolean)) {
    if (!AGENT_IDS.includes(part as AgentId)) {
      throw new Error(`Unknown target "${part}". Known: ${AGENT_IDS.join(', ')}, auto, all`)
    }
    if (!out.includes(part as AgentId)) out.push(part as AgentId)
  }
  return out
}

export function formatPrintConfig(agent: AgentId, location: InstallLocation): string {
  const file = agentConfigPath(agent, location)
  const entry = buildMcpEntry()
  const doc = { mcpServers: { artifactgraph: entry } }
  return `# Add to ${file}\n\n${JSON.stringify(doc, null, 2)}\n`
}

/** Merge artifactgraph into mcpServers JSON file. */
export function mergeMcpJson(
  file: string,
  entry: { command: string; args: string[]; type?: string },
): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(file)) {
    doc = JSON.parse(readFileSync(file, 'utf8')) as typeof doc
  }
  doc.mcpServers ??= {}
  doc.mcpServers.artifactgraph = entry
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return file
}

/** Claude Code: optional auto-allow for artifactgraph tools. */
export function mergeClaudePermissions(
  location: InstallLocation,
  cwd = process.cwd(),
): string | null {
  const settings =
    location === 'local'
      ? path.join(cwd, '.claude', 'settings.json')
      : path.join(os.homedir(), '.claude', 'settings.json')
  mkdirSync(path.dirname(settings), { recursive: true })
  let doc: { permissions?: { allow?: string[] } } = {}
  if (existsSync(settings)) {
    try {
      doc = JSON.parse(readFileSync(settings, 'utf8')) as typeof doc
    } catch {
      doc = {}
    }
  }
  doc.permissions ??= {}
  doc.permissions.allow ??= []
  const wild = 'mcp__artifactgraph__*'
  if (!doc.permissions.allow.includes(wild)) {
    doc.permissions.allow.push(wild)
    writeFileSync(settings, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    return settings
  }
  return null
}

/** Legacy single-target Cursor helper. */
export function installCursorMcp(opts: {
  mcpFile?: string
  useWsl?: boolean
  yes?: boolean
} = {}): string {
  const entry = buildMcpEntry({ useWsl: opts.useWsl })
  const file = opts.mcpFile ?? defaultCursorMcpPath()
  return mergeMcpJson(file, entry)
}

async function promptInteractive(detected: AgentId[]): Promise<{
  targets: AgentId[]
  location: InstallLocation
}> {
  console.log('artifactgraph init — wire MCP into agents\n')
  const pre = detected.length > 0 ? detected : (['cursor'] as AgentId[])

  const targets = await checkboxPrompt<AgentId>({
    message: 'Which agents should get artifactgraph MCP?',
    choices: AGENT_IDS.map((id) => ({
      value: id,
      name: detected.includes(id)
        ? `${AGENT_LABEL[id]}  (detected)`
        : AGENT_LABEL[id],
      checked: pre.includes(id),
    })),
  })

  const location = await selectPrompt<InstallLocation>({
    message: 'Install location?',
    defaultIndex: 0,
    choices: [
      {
        value: 'global',
        name: 'global — ~/.cursor · ~/.claude.json · ~/.kilocode (all projects)',
      },
      {
        value: 'local',
        name: 'local — .cursor / .claude.json / .kilocode in this repo only',
      },
    ],
  })

  return { targets, location }
}

/**
 * Interactive / non-interactive multi-agent init (CodeGraph-style UX).
 * CLI command: `artifactgraph init` (alias: `install`).
 */
export async function installAgents(opts: InstallOptions = {}): Promise<InstallResult> {
  if (opts.printConfig) {
    const id = opts.printConfig.toLowerCase() as AgentId
    if (!AGENT_IDS.includes(id)) {
      throw new Error(`Unknown agent "${opts.printConfig}". Known: ${AGENT_IDS.join(', ')}`)
    }
    process.stdout.write(formatPrintConfig(id, opts.location ?? 'global'))
    return { targets: [id], location: opts.location ?? 'global', written: [], skipped: [] }
  }

  const detected = detectAgents()
  let location: InstallLocation = opts.location ?? 'global'
  let targets: AgentId[]

  if (opts.mcpFile) {
    const entry = buildMcpEntry({ useWsl: opts.useWsl })
    const written = mergeMcpJson(opts.mcpFile, entry)
    return {
      targets: ['cursor'],
      location: 'global',
      written: [{ agent: 'cursor', path: written }],
      skipped: [],
    }
  }

  if (opts.yes || opts.target) {
    targets = parseTargets(opts.target ?? 'auto', detected)
    location = opts.location ?? 'global'
  } else if (!process.stdin.isTTY) {
    targets = parseTargets('auto', detected)
    location = opts.location ?? 'global'
  } else {
    const picked = await promptInteractive(detected)
    targets = picked.targets
    location = opts.location ?? picked.location
  }

  const entry = buildMcpEntry({ useWsl: opts.useWsl })
  const written: InstallResult['written'] = []
  const skipped: string[] = []

  for (const agent of targets) {
    const file = agentConfigPath(agent, location)
    written.push({ agent, path: mergeMcpJson(file, entry) })
    if (agent === 'claude') {
      const perm = mergeClaudePermissions(location)
      if (perm) written.push({ agent: 'claude', path: `${perm} (permissions)` })
    }
  }

  if (!targets.length) skipped.push('no targets selected')

  return { targets, location, written, skipped }
}
