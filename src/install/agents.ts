/**
 * Wire artifactgraph MCP into agent configs (CodeGraph-style `install --target=`).
 *
 * Agents (CodeGraph parity + Kilo):
 *   claude | cursor | codex | opencode | hermes | gemini | antigravity | kiro | kilo
 *
 * Interactive TTY: ↑↓ + Space toggle + Enter
 * Non-interactive: --yes / --target=csv|auto|all
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { packageRoot } from '../config/platform-repos.js'
import { checkboxPrompt } from './prompt.js'
import { buildTomlTable, removeTomlTable, upsertTomlTable } from './toml.js'

export type AgentId =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'hermes'
  | 'gemini'
  | 'antigravity'
  | 'kiro'
  | 'kilo'

export type InstallLocation = 'global' | 'local'

/** Order matches CodeGraph multiselect, then Kilo. */
export const AGENT_IDS: AgentId[] = [
  'claude',
  'cursor',
  'codex',
  'opencode',
  'hermes',
  'gemini',
  'antigravity',
  'kiro',
  'kilo',
]

export const AGENT_DIRS: Record<AgentId, string[]> = {
  claude: ['.claude'],
  cursor: ['.cursor'],
  codex: ['.codex'],
  opencode: ['.opencode'],
  hermes: ['.hermes'],
  gemini: ['.gemini'],
  antigravity: ['.agents', '.gemini'],
  kiro: ['.kiro'],
  kilo: ['.kilocode'],
}

const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex CLI',
  opencode: 'opencode',
  hermes: 'Hermes Agent',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity IDE',
  kiro: 'Kiro',
  kilo: 'Kilo Code',
}

/** Accept short aliases in --target= */
const AGENT_ALIASES: Record<string, AgentId> = {
  claude: 'claude',
  cursor: 'cursor',
  codex: 'codex',
  opencode: 'opencode',
  hermes: 'hermes',
  gemini: 'gemini',
  antigravity: 'antigravity',
  agy: 'antigravity',
  'google-antigravity': 'antigravity',
  kiro: 'kiro',
  kilo: 'kilo',
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

type StdioEntry = { type?: string; command: string; args: string[] }

/** Build stdio MCP entry, optionally pinned to the initialized project root. */
export function buildMcpEntry(
  opts: { useWsl?: boolean; projectRoot?: string } = {},
): StdioEntry {
  const root = packageRoot()
  const mcpJs = path.join(root, 'bin', 'artifactgraph-mcp.mjs')
  const nodeBin = process.execPath
  const winMcp = detectWindowsCursorMcpPath()
  const forceWsl =
    opts.useWsl ||
    process.env.ARTIFACTGRAPH_MCP_WSL === '1' ||
    Boolean(process.env.WSL_DISTRO_NAME && winMcp)

  if (forceWsl) {
    const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
    const projectArg = opts.projectRoot
      ? ` --project-root ${quote(path.resolve(opts.projectRoot))}`
      : ''
    return {
      type: 'stdio',
      command: 'wsl.exe',
      args: [
        '-e',
        'bash',
        '-lc',
        `exec ${quote(nodeBin)} ${quote(mcpJs)}${projectArg}`,
      ],
    }
  }

  const args = [mcpJs]
  if (opts.projectRoot) args.push('--project-root', path.resolve(opts.projectRoot))
  return {
    type: 'stdio',
    command: nodeBin,
    args,
  }
}

/**
 * Antigravity mcp_config schema forbids unknown keys (no `type`).
 * Cursor/Claude/Kilo/Gemini/Kiro keep optional type: stdio.
 */
export function mcpEntryForAgent(agent: AgentId, entry: StdioEntry): StdioEntry {
  if (agent === 'antigravity') {
    return { command: entry.command, args: entry.args }
  }
  return entry
}

/** @deprecated use buildMcpEntry */
export function buildArtifactgraphMcpEntry(opts: { useWsl?: boolean } = {}) {
  const e = buildMcpEntry(opts)
  return { command: e.command, args: e.args }
}

export function defaultCursorMcpPath(): string {
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

/**
 * Antigravity: prefer unified `~/.gemini/config/mcp_config.json` (CodeGraph),
 * fall back to legacy `~/.gemini/antigravity/mcp_config.json`.
 */
export function defaultAntigravityMcpPath(): string {
  const win = detectWindowsAntigravityMcpPath()
  if (win) return win
  const unified = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json')
  const legacy = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json')
  const migrated = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json.migrated')
  if (existsSync(migrated) || existsSync(unified) || existsSync(path.dirname(unified))) {
    return unified
  }
  if (existsSync(legacy) || existsSync(path.dirname(legacy))) return legacy
  return unified
}

export function detectWindowsAntigravityMcpPath(): string | undefined {
  const usersRoot = '/mnt/c/Users'
  if (!existsSync(usersRoot)) return undefined
  try {
    const names = readdirSync(usersRoot).filter(
      (n) => !n.startsWith('.') && n !== 'Public' && n !== 'Default' && n !== 'All Users',
    )
    for (const name of names) {
      const base = path.join(usersRoot, name, '.gemini')
      const unified = path.join(base, 'config', 'mcp_config.json')
      const unifiedDir = path.join(base, 'config')
      if (existsSync(unified) || existsSync(unifiedDir)) return unified
      const legacy = path.join(base, 'antigravity', 'mcp_config.json')
      const legacyDir = path.join(base, 'antigravity')
      if (existsSync(legacy) || existsSync(legacyDir)) return legacy
    }
  } catch {
    /* ignore */
  }
  return undefined
}

function xdgConfigHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
}

function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes')
}

function opencodeConfigPath(location: InstallLocation, cwd: string): string {
  const dir = location === 'global' ? path.join(xdgConfigHome(), 'opencode') : cwd
  const jsonc = path.join(dir, 'opencode.jsonc')
  const json = path.join(dir, 'opencode.json')
  if (existsSync(jsonc)) return jsonc
  if (existsSync(json)) return json
  return jsonc
}

export function supportsLocation(_agent: AgentId, _location: InstallLocation): boolean {
  // Every selected agent supports project-local configuration under the init cwd.
  return true
}

export function agentConfigPath(
  agent: AgentId,
  location: InstallLocation,
  cwd = process.cwd(),
): string {
  if (location === 'local') {
    switch (agent) {
      case 'cursor':
        return path.join(cwd, '.cursor', 'mcp.json')
      case 'claude':
        return path.join(cwd, '.mcp.json')
      case 'gemini':
        return path.join(cwd, '.gemini', 'settings.json')
      case 'kiro':
        return path.join(cwd, '.kiro', 'settings', 'mcp.json')
      case 'opencode':
        return opencodeConfigPath('local', cwd)
      case 'kilo':
        return path.join(cwd, '.kilocode', 'mcp.json')
      case 'codex':
        return path.join(cwd, '.codex', 'config.toml')
      case 'hermes':
        return path.join(cwd, '.hermes', 'config.yaml')
      case 'antigravity':
        return path.join(cwd, '.gemini', 'config', 'mcp_config.json')
    }
  }

  switch (agent) {
    case 'cursor':
      return defaultCursorMcpPath()
    case 'claude':
      return path.join(os.homedir(), '.claude.json')
    case 'codex':
      return path.join(os.homedir(), '.codex', 'config.toml')
    case 'opencode':
      return opencodeConfigPath('global', cwd)
    case 'hermes':
      return path.join(hermesHome(), 'config.yaml')
    case 'gemini':
      return path.join(os.homedir(), '.gemini', 'settings.json')
    case 'antigravity':
      return defaultAntigravityMcpPath()
    case 'kiro':
      return path.join(os.homedir(), '.kiro', 'settings', 'mcp.json')
    case 'kilo':
      return path.join(os.homedir(), '.kilocode', 'mcp.json')
  }
}

/** Heuristic: agent looks installed / previously configured. */
export function detectAgents(cwd = process.cwd()): AgentId[] {
  const found: AgentId[] = []

  if (
    existsSync(path.join(os.homedir(), '.claude.json')) ||
    existsSync(path.join(os.homedir(), '.claude')) ||
    existsSync(path.join(cwd, '.claude.json')) ||
    existsSync(path.join(cwd, '.mcp.json'))
  ) {
    found.push('claude')
  }
  if (
    existsSync(path.join(os.homedir(), '.cursor')) ||
    existsSync(path.join(cwd, '.cursor')) ||
    Boolean(detectWindowsCursorMcpPath())
  ) {
    found.push('cursor')
  }
  if (existsSync(path.join(os.homedir(), '.codex'))) {
    found.push('codex')
  }
  if (
    existsSync(path.join(xdgConfigHome(), 'opencode')) ||
    existsSync(path.join(cwd, 'opencode.jsonc')) ||
    existsSync(path.join(cwd, 'opencode.json'))
  ) {
    found.push('opencode')
  }
  if (existsSync(hermesHome()) || existsSync(path.join(hermesHome(), 'config.yaml'))) {
    found.push('hermes')
  }
  if (
    existsSync(path.join(os.homedir(), '.gemini')) ||
    existsSync(path.join(cwd, '.gemini')) ||
    existsSync(path.join(cwd, 'GEMINI.md'))
  ) {
    found.push('gemini')
  }
  if (
    existsSync(path.join(os.homedir(), '.gemini', 'antigravity')) ||
    existsSync(path.join(os.homedir(), '.gemini', 'config')) ||
    existsSync(path.join(os.homedir(), '.antigravity-ide-server')) ||
    existsSync(path.join(cwd, '.gemini', 'antigravity')) ||
    Boolean(detectWindowsAntigravityMcpPath())
  ) {
    found.push('antigravity')
  }
  if (
    existsSync(path.join(os.homedir(), '.kiro')) ||
    existsSync(path.join(cwd, '.kiro'))
  ) {
    found.push('kiro')
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
    const id = AGENT_ALIASES[part]
    if (!id) {
      throw new Error(
        `Unknown target "${part}". Known: ${AGENT_IDS.join(', ')}, agy, auto, all`,
      )
    }
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function formatPrintConfig(agent: AgentId, location: InstallLocation): string {
  if (!supportsLocation(agent, location)) {
    return `# ${AGENT_LABEL[agent]} has no project-local config — use --location=global.\n`
  }
  const file = agentConfigPath(agent, location)
  const entry = mcpEntryForAgent(agent, buildMcpEntry())

  if (agent === 'codex') {
    const block = buildTomlTable('mcp_servers.artifactgraph', {
      command: entry.command,
      args: entry.args,
    })
    return `# Add to ${file}\n\n${block}\n`
  }

  if (agent === 'opencode') {
    const doc = {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        artifactgraph: {
          type: 'local',
          command: [entry.command, ...entry.args],
          enabled: true,
        },
      },
    }
    return `# Add to ${file}\n\n${JSON.stringify(doc, null, 2)}\n`
  }

  if (agent === 'hermes') {
    return [
      `# Add to ${file}`,
      '',
      'mcp_servers:',
      '  artifactgraph:',
      `    command: ${JSON.stringify(entry.command)}`,
      '    args:',
      ...entry.args.map((a) => `      - ${JSON.stringify(a)}`),
      '    timeout: 120',
      '    connect_timeout: 60',
      '    enabled: true',
      '',
      'platform_toolsets:',
      '  cli:',
      '    - hermes-cli',
      '    - mcp-artifactgraph',
      '',
    ].join('\n')
  }

  const doc = { mcpServers: { artifactgraph: entry } }
  return `# Add to ${file}\n\n${JSON.stringify(doc, null, 2)}\n`
}

/** Merge artifactgraph into mcpServers JSON file. */
export function mergeMcpJson(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim()
    if (raw) {
      try {
        doc = JSON.parse(raw) as typeof doc
      } catch (error) {
        throw new Error(
          `Cannot merge MCP config ${file}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  doc.mcpServers ??= {}
  doc.mcpServers.artifactgraph = entry
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return file
}

function mergeCodexToml(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const block = buildTomlTable('mcp_servers.artifactgraph', {
    command: entry.command,
    args: entry.args,
  })
  const { content } = upsertTomlTable(existing, 'mcp_servers.artifactgraph', block)
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  return file
}

/** Strip // line comments enough for simple .jsonc round-trips. */
function parseJsonLoose(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/^\s*\/\/.*$/gm, '')
  if (!stripped.trim()) return {}
  return JSON.parse(stripped) as Record<string, unknown>
}

function mergeOpencodeConfig(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: Record<string, unknown> = { $schema: 'https://opencode.ai/config.json' }
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    if (raw.trim()) {
      try {
        doc = parseJsonLoose(raw)
      } catch {
        /* keep schema default */
      }
    }
  }
  doc.$schema ??= 'https://opencode.ai/config.json'
  const mcp = (doc.mcp as Record<string, unknown> | undefined) ?? {}
  mcp.artifactgraph = {
    type: 'local',
    command: [entry.command, ...entry.args],
    enabled: true,
  }
  doc.mcp = mcp
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return file
}

function mergeHermesYaml(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: Record<string, unknown> = {}
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    if (raw.trim()) {
      try {
        doc = (parseYaml(raw) as Record<string, unknown>) ?? {}
      } catch {
        doc = {}
      }
    }
  }

  const servers = (doc.mcp_servers as Record<string, unknown> | undefined) ?? {}
  servers.artifactgraph = {
    command: entry.command,
    args: entry.args,
    timeout: 120,
    connect_timeout: 60,
    enabled: true,
  }
  doc.mcp_servers = servers

  const toolsets = (doc.platform_toolsets as Record<string, unknown> | undefined) ?? {}
  const cli = Array.isArray(toolsets.cli) ? [...(toolsets.cli as unknown[])] : ['hermes-cli']
  if (!cli.includes('mcp-artifactgraph')) cli.push('mcp-artifactgraph')
  toolsets.cli = cli
  doc.platform_toolsets = toolsets

  writeFileSync(file, stringifyYaml(doc), 'utf8')
  return file
}

function writeAgentConfig(
  agent: AgentId,
  location: InstallLocation,
  entry: StdioEntry,
): string {
  const file = agentConfigPath(agent, location)
  const shaped = mcpEntryForAgent(agent, entry)

  switch (agent) {
    case 'codex':
      return mergeCodexToml(file, shaped)
    case 'opencode':
      return mergeOpencodeConfig(file, shaped)
    case 'hermes':
      return mergeHermesYaml(file, shaped)
    default:
      return mergeMcpJson(file, shaped)
  }
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

function removeMcpJson(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8').trim()
  if (!raw) return false
  let doc: { mcpServers?: Record<string, unknown> }
  try {
    doc = JSON.parse(raw) as typeof doc
  } catch {
    return false
  }
  if (!doc.mcpServers || !('artifactgraph' in doc.mcpServers)) return false
  if (!dryRun) {
    delete doc.mcpServers.artifactgraph
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return true
}

function removeCodexToml(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const existing = readFileSync(file, 'utf8')
  const server = removeTomlTable(existing, 'mcp_servers.artifactgraph')
  const env = removeTomlTable(server.content, 'mcp_servers.artifactgraph.env')
  const removed = server.removed || env.removed
  if (removed && !dryRun) {
    writeFileSync(
      file,
      env.content.endsWith('\n') ? env.content : `${env.content}\n`,
      'utf8',
    )
  }
  return removed
}

function removeOpencodeConfig(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return false
  let doc: Record<string, unknown>
  try {
    doc = parseJsonLoose(raw)
  } catch {
    return false
  }
  const mcp = doc.mcp as Record<string, unknown> | undefined
  if (!mcp || !('artifactgraph' in mcp)) return false
  if (!dryRun) {
    delete mcp.artifactgraph
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return true
}

function removeHermesYaml(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return false
  let doc: Record<string, unknown>
  try {
    doc = (parseYaml(raw) as Record<string, unknown>) ?? {}
  } catch {
    return false
  }
  const servers = doc.mcp_servers as Record<string, unknown> | undefined
  const toolsets = doc.platform_toolsets as Record<string, unknown> | undefined
  const cli = toolsets && Array.isArray(toolsets.cli) ? (toolsets.cli as unknown[]) : []
  const hasServer = Boolean(servers && 'artifactgraph' in servers)
  const hasTool = cli.includes('mcp-artifactgraph')
  if (!hasServer && !hasTool) return false
  if (!dryRun) {
    if (hasServer) delete servers!.artifactgraph
    if (hasTool) toolsets!.cli = cli.filter((item) => item !== 'mcp-artifactgraph')
    writeFileSync(file, stringifyYaml(doc), 'utf8')
  }
  return true
}

export function removeClaudePermissions(
  location: InstallLocation,
  dryRun: boolean,
  cwd = process.cwd(),
): string | null {
  const settings =
    location === 'local'
      ? path.join(cwd, '.claude', 'settings.json')
      : path.join(os.homedir(), '.claude', 'settings.json')
  if (!existsSync(settings)) return null
  let doc: { permissions?: { allow?: string[] } }
  try {
    doc = JSON.parse(readFileSync(settings, 'utf8')) as typeof doc
  } catch {
    return null
  }
  const allow = doc.permissions?.allow
  const permission = 'mcp__artifactgraph__*'
  if (!allow?.includes(permission)) return null
  if (!dryRun) {
    doc.permissions!.allow = allow.filter((item) => item !== permission)
    writeFileSync(settings, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return settings
}

function removeAgentConfig(
  agent: AgentId,
  location: InstallLocation,
  dryRun: boolean,
  cwd: string,
): string | null {
  const file = agentConfigPath(agent, location, cwd)
  let removed: boolean
  switch (agent) {
    case 'codex':
      removed = removeCodexToml(file, dryRun)
      break
    case 'opencode':
      removed = removeOpencodeConfig(file, dryRun)
      break
    case 'hermes':
      removed = removeHermesYaml(file, dryRun)
      break
    default:
      removed = removeMcpJson(file, dryRun)
  }
  return removed ? file : null
}

export interface UninstallAgentsOptions {
  target?: string
  location?: InstallLocation
  yes?: boolean
  cwd?: string
}

export interface UninstallAgentsResult {
  targets: AgentId[]
  location: InstallLocation
  dryRun: boolean
  removed: string[]
  absent: string[]
}

/** Remove only ArtifactGraph-owned keys from shared agent configuration. */
export function uninstallAgents(
  opts: UninstallAgentsOptions = {},
): UninstallAgentsResult {
  const dryRun = !opts.yes
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd()
  const location = opts.location ?? 'local'
  const targets = parseTargets(opts.target ?? 'all', detectAgents(cwd))
  const removed: string[] = []
  const absent: string[] = []

  for (const agent of targets) {
    if (!supportsLocation(agent, location)) {
      absent.push(`${agent}: no ${location} config`)
      continue
    }
    const file = removeAgentConfig(agent, location, dryRun, cwd)
    if (file) removed.push(`${agent}: ${file}`)
    else absent.push(`${agent}: no artifactgraph entry`)
    if (agent === 'claude') {
      const permissions = removeClaudePermissions(location, dryRun, cwd)
      if (permissions) removed.push(`claude: ${permissions} (permissions)`)
    }
  }
  return { targets, location, dryRun, removed, absent }
}

async function promptInteractive(detected: AgentId[]): Promise<AgentId[]> {
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

  return targets
}

/**
 * Interactive / non-interactive multi-agent init (CodeGraph-style UX).
 * CLI command: `artifactgraph init` (alias: `install`).
 */
export async function installAgents(opts: InstallOptions = {}): Promise<InstallResult> {
  if (opts.printConfig) {
    const key = opts.printConfig.toLowerCase()
    const id = AGENT_ALIASES[key]
    if (!id) {
      throw new Error(
        `Unknown agent "${opts.printConfig}". Known: ${AGENT_IDS.join(', ')}, agy`,
      )
    }
    process.stdout.write(formatPrintConfig(id, opts.location ?? 'global'))
    return { targets: [id], location: opts.location ?? 'global', written: [], skipped: [] }
  }

  const detected = detectAgents()
  let location: InstallLocation = opts.location ?? 'local'
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
    location = opts.location ?? 'local'
  } else if (!process.stdin.isTTY) {
    targets = parseTargets('auto', detected)
    location = opts.location ?? 'local'
  } else {
    targets = await promptInteractive(detected)
    location = opts.location ?? 'local'
  }

  const baseEntry = buildMcpEntry({
    useWsl: opts.useWsl,
    projectRoot: location === 'local' ? process.cwd() : undefined,
  })
  const written: InstallResult['written'] = []
  const skipped: string[] = []

  for (const agent of targets) {
    if (!supportsLocation(agent, location)) {
      skipped.push(
        `${agent}: no project-local config — re-run with --location=global`,
      )
      continue
    }
    written.push({ agent, path: writeAgentConfig(agent, location, baseEntry) })
    if (agent === 'claude') {
      const perm = mergeClaudePermissions(location)
      if (perm) written.push({ agent: 'claude', path: `${perm} (permissions)` })
    }
  }

  if (!targets.length) skipped.push('no targets selected')

  return { targets, location, written, skipped }
}
