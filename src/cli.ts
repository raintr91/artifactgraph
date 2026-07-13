/**
 * CLI entry — humans / CI / installers.
 *
 * After packaging:
 *   curl install.sh | sh
 *   artifactgraph version
 *   artifactgraph install --target=cursor --yes
 *   artifactgraph init --project portal
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { resolveProject, loadPlatformReposMap, detectStack, packageRoot } from './config/platform-repos.js'
import { requireRepoConfig, writeBrownfieldConfig, loadRepoConfig } from './config/load-config.js'
import { IndexStore } from './db/index-store.js'
import { loadRegistries, indexRegistries } from './registry/load-registries.js'
import { analyzeSpecFile } from './analyze/analyze-spec.js'
import { analyzeBullets } from './analyze/analyze-bullets.js'
import { parityCheck } from './analyze/parity-check.js'
import { runAllowlistedCommand } from './gen/run-command.js'
import { installCursorMcp } from './install/cursor-mcp.js'

const require = createRequire(import.meta.url)

function pkgVersion(): string {
  try {
    const pkg = require(path.join(packageRoot(), 'package.json')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function usage(): void {
  console.log(`artifactgraph ${pkgVersion()}

Install / Cursor:
  version
  install --target=cursor [--yes] [--wsl] [--mcp-file <path>]

Product repo (brownfield):
  projects
  init     [--project <id>] [--stack <id>] [--force]   # default: cwd
  status   [--project <id>]                            # default: cwd
  rebuild  [--project <id>]
  analyze  [--project <id>] (--spec <path> | --bullets <text>)
  gaps     [--project <id>] (--spec <path> | --bullets <text>)
  parity   [--project <id>] (--module <dir> | --findings <path>)
  gen      [--project <id>] --command <key> [--spec <path>]

Env:
  ARTIFACTGRAPH_WORKSPACE   folder that contains portal/, nextjs/, …
`)
  process.exit(1)
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function has(flag: string): boolean {
  return process.argv.includes(flag)
}

/** Resolve product root: --project map OR cwd. */
function resolveRepoContext(): { id: string; root: string; stack: string } {
  const projectId = arg('--project')
  if (projectId) {
    const p = resolveProject(projectId)
    return { id: p.id, root: p.root, stack: p.stack }
  }
  const root = process.cwd()
  const stack = arg('--stack') ?? detectStack(root)
  return { id: path.basename(root), root, stack }
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') usage()

  if (cmd === 'version' || cmd === '--version' || cmd === '-V') {
    console.log(`artifactgraph ${pkgVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }

  if (cmd === 'install') {
    const target = arg('--target') ?? 'cursor'
    if (target !== 'cursor') {
      console.error(`Unknown --target ${target} (only cursor supported in v0.1)`)
      process.exit(1)
    }
    const mcpFile = installCursorMcp({
      mcpFile: arg('--mcp-file'),
      useWsl: has('--wsl'),
      yes: has('--yes'),
    })
    console.log(`Wrote Cursor MCP config: ${mcpFile}`)
    console.log('Restart Cursor / reload MCP, then try tool artifactgraph_projects')
    return
  }

  if (cmd === 'projects') {
    const map = loadPlatformReposMap()
    console.log(JSON.stringify({ workspaceRoot: map.workspaceRoot, projects: map.projects }, null, 2))
    return
  }

  if (cmd === 'init') {
    const ctx = resolveRepoContext()
    const dest = writeBrownfieldConfig(ctx.root, {
      stack: ctx.stack,
      projectId: ctx.id,
      force: has('--force'),
    })
    console.log(`Wrote ${dest} (stack=${ctx.stack})`)
    return
  }

  const ctx = resolveRepoContext()

  if (cmd === 'status') {
    console.log(
      JSON.stringify(
        {
          id: ctx.id,
          root: ctx.root,
          stack: ctx.stack,
          config: loadRepoConfig(ctx.root),
          packageRoot: packageRoot(),
        },
        null,
        2,
      ),
    )
    return
  }

  if (cmd === 'rebuild') {
    const cfg = requireRepoConfig(ctx.root)
    const store = new IndexStore(ctx.root)
    const loaded = loadRegistries(ctx.root, cfg)
    indexRegistries(store, loaded)
    store.close()
    console.log(`Rebuilt index for ${ctx.id}: ${Object.keys(loaded.byFile).join(', ')}`)
    return
  }

  if (cmd === 'analyze' || cmd === 'gaps') {
    const cfg = requireRepoConfig(ctx.root)
    const store = new IndexStore(ctx.root)
    const spec = arg('--spec')
    const bullets = arg('--bullets')
    const result = spec
      ? analyzeSpecFile(ctx.root, cfg, spec, store)
      : analyzeBullets(ctx.root, cfg, bullets ?? '', store)
    store.close()
    if (cmd === 'gaps') {
      console.log(
        JSON.stringify(
          { gaps: result.gaps, askUser: result.askUser, cloudPromptSlice: result.cloudPromptSlice },
          null,
          2,
        ),
      )
    } else {
      console.log(JSON.stringify(result, null, 2))
    }
    return
  }

  if (cmd === 'parity') {
    const moduleDir = arg('--module')
    const findingsPath = arg('--findings')
    if (!moduleDir && !findingsPath) {
      console.error('parity requires --module <dir> and/or --findings <path>')
      usage()
      return
    }
    const store = new IndexStore(ctx.root)
    const result = parityCheck({
      repoRoot: ctx.root,
      projectId: ctx.id,
      moduleDir,
      findingsPath,
      store,
    })
    store.close()
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (cmd === 'gen') {
    const cfg = requireRepoConfig(ctx.root)
    const commandKey = arg('--command')
    if (!commandKey) {
      console.error('Missing --command')
      usage()
      return
    }
    const result = runAllowlistedCommand(ctx.root, cfg, commandKey, {
      spec: arg('--spec') ?? '',
    })
    console.log(result.stdout)
    if (result.stderr) console.error(result.stderr)
    process.exit(result.exitCode ?? 1)
  }

  usage()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
