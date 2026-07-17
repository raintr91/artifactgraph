/**
 * Spawn only allowlisted commands from artifactgraph.json.
 *
 * Security / token goal:
 * - Agent must NOT invent shell commands
 * - MCP substitutes {spec} etc., rejects legacy external paths, then runs fixed argv
 */

import { spawnSync } from 'node:child_process'
import type { ArtifactgraphConfig } from '../types.js'
import { expandArgvPaths } from '../config/resolve-paths.js'

export interface RunCommandResult {
  commandKey: string
  argv: string[]
  cwd: string
  exitCode: number | null
  stdout: string
  stderr: string
}

/**
 * Replace `{spec}` (and future placeholders) in the argv template.
 */
export function materializeArgv(template: string[], vars: Record<string, string>): string[] {
  return template.map((part) => {
    let out = part
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(v)
    }
    return out
  })
}

/**
 * Run one named command from config.commands.
 * @throws if commandKey is not in the allowlist
 */
export function runAllowlistedCommand(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  commandKey: string,
  vars: Record<string, string> = {},
): RunCommandResult {
  const template = cfg.commands[commandKey]
  if (!template) {
    const keys = Object.keys(cfg.commands).join(', ')
    throw new Error(`Command "${commandKey}" not allowlisted. Known: ${keys}`)
  }
  const argv = expandArgvPaths(repoRoot, materializeArgv(template, vars))
  const bin = argv[0]
  if (!bin) throw new Error(`Empty argv for command "${commandKey}"`)
  const args = argv.slice(1)
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    env: process.env,
  })
  return {
    commandKey,
    argv,
    cwd: repoRoot,
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}
