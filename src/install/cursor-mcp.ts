/**
 * Merge artifactgraph into Cursor's mcp.json (like `codegraph install --target=cursor`).
 *
 * Looks for:
 * - Linux/mac: ~/.cursor/mcp.json
 * - Windows: %USERPROFILE%\.cursor\mcp.json
 * - Optional: --mcp-file <path>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { packageRoot } from '../config/platform-repos.js'

export interface CursorInstallOptions {
  /** Absolute path to mcp.json; default ~/.cursor/mcp.json */
  mcpFile?: string
  /** Prefer wsl.exe wrapper (Windows Cursor + Linux checkout). */
  useWsl?: boolean
  yes?: boolean
}

/** Default Cursor MCP config path for this OS. */
export function defaultCursorMcpPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json')
}

/**
 * Build the mcpServers.artifactgraph entry for the installed package.
 */
export function buildArtifactgraphMcpEntry(opts: { useWsl?: boolean } = {}): {
  command: string
  args: string[]
} {
  const root = packageRoot()
  const mcpJs = path.join(root, 'bin', 'artifactgraph-mcp.mjs')
  const nodeBin = process.execPath

  if (opts.useWsl || process.env.ARTIFACTGRAPH_MCP_WSL === '1') {
    // Windows Cursor → run Node inside WSL against the Linux install tree
    const wslRoot = root.replace(/^\/mnt\/([a-z])\//i, (_, d) => `/mnt/${d}/`)
    return {
      command: 'wsl.exe',
      args: ['-e', 'bash', '-lc', `exec node '${wslRoot}/bin/artifactgraph-mcp.mjs'`],
    }
  }

  return {
    command: nodeBin,
    args: [mcpJs],
  }
}

/**
 * Read-merge-write Cursor mcp.json. Returns path written.
 */
export function installCursorMcp(opts: CursorInstallOptions = {}): string {
  const mcpFile = opts.mcpFile ?? defaultCursorMcpPath()
  mkdirSync(path.dirname(mcpFile), { recursive: true })

  let doc: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(mcpFile)) {
    doc = JSON.parse(readFileSync(mcpFile, 'utf8')) as typeof doc
  }
  doc.mcpServers ??= {}

  const entry = buildArtifactgraphMcpEntry({ useWsl: opts.useWsl })
  doc.mcpServers.artifactgraph = entry

  writeFileSync(mcpFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return mcpFile
}
