/**
 * CLI entry — humans / CI / installers.
 *
 * After packaging:
 *   curl install.sh | sh
 *   artifactgraph init                         # agents (↑↓ · Space · Enter)
 *   artifactgraph init --target=cursor,claude --yes
 *   artifactgraph init-project --project portal
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { resolveProject, loadPlatformReposMap, detectStack, packageRoot } from './config/platform-repos.js'
import { requireRepoConfig, writeBrownfieldConfig, loadRepoConfig } from './config/load-config.js'
import { IndexStore } from './db/index-store.js'
import { loadRegistries, indexRegistries, registryIndexSummary } from './registry/load-registries.js'
import { analyzeSpecFile } from './analyze/analyze-spec.js'
import { analyzeBullets } from './analyze/analyze-bullets.js'
import { parityCheck } from './analyze/parity-check.js'
import { runAllowlistedCommand } from './gen/run-command.js'
import { resolveSpecPath, pathResolutionSummary } from './config/resolve-paths.js'
import { indexLexicons, suggestTags } from './lexicon/load-lexicon.js'
import { installAgents, AGENT_IDS } from './install/agents.js'

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

Wire agents (global by default — not per product repo):
  init [--target=claude,cursor,codex,opencode,hermes,gemini,antigravity,kiro,kilo|auto|all]
       [--location=global|local] [--yes] [--wsl]
       [--print-config <agent>] [--mcp-file <path>]
       # no flags → TTY multi-select (↑↓ · Space · Enter)
  install …   # deprecated alias → init

Product repo (brownfield):
  projects
  init-project [--project <id>] [--stack <id>] [--force]   # default: cwd
  status       [--project <id>]
  rebuild      [--project <id>]
  analyze      [--project <id>] (--spec <path> | --bullets <text>)
  gaps         [--project <id>] (--spec <path> | --bullets <text>)
  suggest      [--project <id>] --lane fe|docs|plans [--bullets <text>]
  parity       [--project <id>] (--module <dir> | --findings <path>)
  gen          [--project <id>] --command <key> [--spec <path>]

Docs: docs/INIT.md · docs/INSTALL.md

Env:
  ARTIFACTGRAPH_WORKSPACE   folder that contains portal/, nextjs/, …
`)
  process.exit(1)
}

function arg(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`))
  if (eq) return eq.slice(flag.length + 1) || undefined
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

async function runInitAgents(opts: { deprecatedAlias?: boolean } = {}): Promise<void> {
  if (opts.deprecatedAlias) {
    console.error('note: `install` is deprecated — use `artifactgraph init`')
  }
  // Back-compat: old `init --project` meant product brownfield
  if (arg('--project') || arg('--stack') || has('--force')) {
    console.error(
      'note: product repo wire moved to `artifactgraph init-project` (routing this call)',
    )
    await runInitProject()
    return
  }
  try {
    const result = await installAgents({
      target: arg('--target'),
      location: (arg('--location') as 'global' | 'local' | undefined) ?? undefined,
      yes: has('--yes'),
      useWsl: has('--wsl'),
      mcpFile: arg('--mcp-file'),
      printConfig: arg('--print-config'),
    })
    if (arg('--print-config')) return
    console.log(
      `Wired artifactgraph → ${result.targets.join(', ') || '(none)'} (${result.location})`,
    )
    for (const w of result.written) {
      console.log(`  ${w.agent}: ${w.path}`)
    }
    for (const s of result.skipped) console.log(`  skip: ${s}`)
    console.log(`Agents: ${AGENT_IDS.join(' | ')}`)
    console.log('Restart agent(s), then try tool artifactgraph_projects')
    console.log(
      '(Product repo: cd <repo> && artifactgraph init-project && artifactgraph rebuild)',
    )
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

async function runInitProject(): Promise<void> {
  const ctx = resolveRepoContext()
  const dest = writeBrownfieldConfig(ctx.root, {
    stack: ctx.stack,
    projectId: ctx.id,
    force: has('--force'),
  })
  console.log(`Wrote ${dest} (stack=${ctx.stack})`)
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') usage()

  if (cmd === 'version' || cmd === '--version' || cmd === '-V') {
    console.log(`artifactgraph ${pkgVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }

  if (cmd === 'init') {
    await runInitAgents()
    return
  }

  if (cmd === 'install') {
    await runInitAgents({ deprecatedAlias: true })
    return
  }

  if (cmd === 'projects') {
    const map = loadPlatformReposMap()
    console.log(JSON.stringify({ workspaceRoot: map.workspaceRoot, projects: map.projects }, null, 2))
    return
  }

  if (cmd === 'init-project') {
    await runInitProject()
    return
  }

  const ctx = resolveRepoContext()

  if (cmd === 'status') {
    const cfg = loadRepoConfig(ctx.root)
    console.log(
      JSON.stringify(
        {
          id: ctx.id,
          root: ctx.root,
          stack: ctx.stack,
          config: cfg,
          paths: cfg ? pathResolutionSummary(ctx.root, cfg) : null,
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
    const lexicon = indexLexicons(store, ctx.root, cfg)
    const summary = { ...registryIndexSummary(loaded), ...lexicon }
    store.setMeta('indexSummary', JSON.stringify(summary))
    store.close()
    console.log(
      `Rebuilt index for ${ctx.id}: files=${summary.files} shells=${summary.designShells} common=${summary.commonIds} unit=${summary.unitPatterns} e2e=${summary.e2eBundles} lexiconHints=${summary.registryTagHints ?? 0} testTypes=${summary.testTypes ?? 0}`,
    )
    console.log(JSON.stringify(pathResolutionSummary(ctx.root, cfg), null, 2))
    return
  }

  if (cmd === 'analyze' || cmd === 'gaps') {
    const cfg = requireRepoConfig(ctx.root)
    const store = new IndexStore(ctx.root)
    const spec = arg('--spec')
    const bullets = arg('--bullets')
    const result = spec
      ? analyzeSpecFile(ctx.root, cfg, resolveSpecPath(ctx.root, cfg, spec), store)
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

  if (cmd === 'suggest') {
    const cfg = requireRepoConfig(ctx.root)
    const lane = (arg('--lane') ?? 'fe') as 'fe' | 'docs' | 'plans' | 'be'
    if (!['fe', 'docs', 'plans', 'be'].includes(lane)) {
      console.error('--lane must be fe | docs | plans | be')
      process.exit(1)
    }
    const result = suggestTags({
      repoRoot: ctx.root,
      cfg,
      lane,
      bullets: arg('--bullets') ?? '',
    })
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
