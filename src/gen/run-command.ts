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

export interface InspectCommandResult {
  ok: boolean
  commandKey: string
  allowlisted: boolean
  knownKeys: string[]
  argv?: string[]
  cwd: string
  executableOwner: 'product-repo' | 'codegenkit' | 'testkit' | 'docskit' | 'unknown'
  recommendation: string
}

function commandOwner(commandKey: string): InspectCommandResult['executableOwner'] {
  if (['docsRender', 'specSplit', 'specMerge', 'legacyValidate'].includes(commandKey)) {
    return 'docskit'
  }
  if (
    ['testcaseGen', 'testcaseGenDry', 'casesRender', 'testE2e', 'e2eRegistry'].includes(
      commandKey,
    )
  ) {
    return 'testkit'
  }
  if (
    [
      'gen',
      'genDry',
      'unitGen',
      'unitGenDry',
      'registryValidate',
      'unitRegistry',
      'commonRegistry',
      'contractGen',
      'contractGenDry',
      'contractRegistry',
      'nestGen',
      'nestGenDry',
      'nestRegistry',
    ].includes(commandKey)
  ) {
    return 'codegenkit'
  }
  return 'unknown'
}

/**
 * Inspect/materialize one product-owned allowlisted command without executing it.
 * ArtifactGraph recommends; the owning kit/product runner executes.
 */
export function inspectAllowlistedCommand(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  commandKey: string,
  vars: Record<string, string> = {},
): InspectCommandResult {
  const knownKeys = Object.keys(cfg.commands).sort()
  const template = cfg.commands[commandKey]
  const owner = commandOwner(commandKey)
  if (!template) {
    return {
      ok: false,
      commandKey,
      allowlisted: false,
      knownKeys,
      cwd: repoRoot,
      executableOwner: owner,
      recommendation: `Command "${commandKey}" is not allowlisted in artifactgraph.json.`,
    }
  }
  const argv = expandArgvPaths(repoRoot, materializeArgv(template, vars))
  return {
    ok: true,
    commandKey,
    allowlisted: true,
    knownKeys,
    argv,
    cwd: repoRoot,
    executableOwner: owner,
    recommendation:
      owner === 'unknown'
        ? 'Run with the product-owned command runner after review.'
        : `Execute with ${owner}; ArtifactGraph does not own this generator.`,
  }
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
  const inspected = inspectAllowlistedCommand(repoRoot, cfg, commandKey, vars)
  if (!inspected.allowlisted || !inspected.argv) {
    throw new Error(
      `Command "${commandKey}" not allowlisted. Known: ${inspected.knownKeys.join(', ')}`,
    )
  }
  const argv = inspected.argv
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
