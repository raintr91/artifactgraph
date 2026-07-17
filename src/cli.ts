/**
 * CLI entry — humans / CI / installers.
 *
 * After packaging:
 *   curl install.sh | sh
 *   artifactgraph init                         # agents (↑↓ · Space · Enter)
 *   artifactgraph init --target=cursor,claude --yes
 *   cd <product-repo> && artifactgraph init
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { detectStack, packageRoot } from './config/platform-repos.js'
import { requireRepoConfig, loadRepoConfig } from './config/load-config.js'
import { IndexStore } from './db/index-store.js'
import { loadRegistries, indexRegistries, registryIndexSummary } from './registry/load-registries.js'
import { analyzeSpecFile } from './analyze/analyze-spec.js'
import { analyzeBullets } from './analyze/analyze-bullets.js'
import { parityCheck } from './analyze/parity-check.js'
import {
  inspectAllowlistedCommand,
  runAllowlistedCommand,
} from './gen/run-command.js'
import { resolveSpecPath, pathResolutionSummary } from './config/resolve-paths.js'
import { indexLexicons, suggestTags } from './lexicon/load-lexicon.js'
import { installAgents, AGENT_IDS } from './install/agents.js'
import { checkboxPrompt } from './install/prompt.js'
import {
  installProjectAssets,
  normalizeInstallTypes,
  parseInstallTypes,
  pruneProjectAssets,
  projectInstallStatus,
  type InstallType,
} from './install/project.js'

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

Initialize current repo + wire agents:
  init [--target=claude,cursor,codex,opencode,hermes,gemini,antigravity,kiro,kilo|auto|all]
       [--type=common,docs,fe,be,test|all]
       [--location=global|local] [--yes] [--wsl]
       [--print-config <agent>] [--mcp-file <path>]
       # no flags → target + type TTY multi-select (↑↓ · Space · Enter)
  install …   # deprecated alias → init

Current product repo:
  init-project [--stack <id>] [--type <types>] [--force]   # deprecated alias
  status
  prune [--project-root <path>] [--yes]   # dry-run unless --yes
  rebuild
  analyze      (--spec <path> | --bullets <text>)
  gaps         (--spec <path> | --bullets <text>)
  suggest      --lane fe|docs|plans [--bullets <text>]
  parity       (--module <dir> | --findings <path>)
  recommend-command --command <key> [--spec <path>]
  allowlist-check   --command <key>
  gen               --command <key> [--spec <path>] # deprecated executable shim

Docs: docs/INIT.md · docs/INSTALL.md

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

/** Resolve the current product root directly; MCP repos do not own workspace maps. */
function resolveRepoContext(): { id: string; root: string; stack: string } {
  const root = process.cwd()
  const stack = arg('--stack') ?? detectStack(root)
  return { id: path.basename(root), root, stack }
}

async function runInitAgents(opts: { deprecatedAlias?: boolean } = {}): Promise<void> {
  if (opts.deprecatedAlias) {
    console.error('note: `install` is deprecated — use `artifactgraph init`')
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
    const ctx = resolveRepoContext()
    const types = await resolveInitTypes(ctx.stack)
    const project = installProjectAssets({
      repoRoot: ctx.root,
      stack: ctx.stack,
      types,
      force: has('--force'),
    })
    console.log(`Initialized ${ctx.root} (types=${project.types.join(',')})`)
    for (const key of ['created', 'updated', 'skipped', 'conflicts'] as const) {
      if (project[key].length) console.log(`  ${key}: ${project[key].join(', ')}`)
    }
    console.log('Restart agent(s), then run artifactgraph rebuild')
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

function suggestedTypes(stack: string): InstallType[] {
  if (stack === 'nuxt4-nest' || stack === 'nextjs-nest') return ['fe', 'be']
  if (stack === 'nuxt4' || stack === 'nextjs' || stack === 'dotnet-line') return ['fe']
  if (stack === 'docs-c4') return ['docs']
  if (stack === 'e2e-plans') return ['test']
  if (['laravel', 'fastapi', 'dotnet-integration'].includes(stack)) return ['be']
  return ['common']
}

async function resolveInitTypes(stack: string): Promise<InstallType[]> {
  const requested = arg('--type')
  if (requested) return parseInstallTypes(requested)
  const suggested = suggestedTypes(stack)
  if (has('--yes') || !process.stdin.isTTY || !process.stdout.isTTY) {
    return normalizeInstallTypes(suggested)
  }
  const selected = await checkboxPrompt<InstallType>({
    message: 'Which ArtifactGraph types should be installed?',
    choices: [
      { value: 'common', name: 'common — core skill, rule, hooks, lexicon', checked: true },
      { value: 'docs', name: 'docs — spec/docs + legacy/parity hooks', checked: suggested.includes('docs') },
      { value: 'fe', name: 'fe — frontend hooks', checked: suggested.includes('fe') },
      { value: 'be', name: 'be — backend hooks', checked: suggested.includes('be') },
      { value: 'test', name: 'test — testcase hooks + taxonomy', checked: suggested.includes('test') },
      { value: 'all', name: 'all — every type (explicit)', checked: false },
    ],
  })
  return normalizeInstallTypes(selected)
}

async function runInitProject(): Promise<void> {
  console.error('note: `init-project` is deprecated — use `artifactgraph init`')
  const ctx = resolveRepoContext()
  const result = installProjectAssets({
    repoRoot: ctx.root,
    stack: ctx.stack,
    types: await resolveInitTypes(ctx.stack),
    force: has('--force'),
  })
  console.log(
    `Initialized ${result.root} (stack=${ctx.stack}, types=${result.types.join(',')})`,
  )
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

  if (cmd === 'init-project') {
    await runInitProject()
    return
  }

  if (cmd === 'prune') {
    const projectRoot = arg('--project-root')
    if (has('--project-root') && (!projectRoot || projectRoot.startsWith('-'))) {
      console.error('--project-root requires a path')
      process.exitCode = 1
      return
    }
    const result = pruneProjectAssets({
      repoRoot: projectRoot ?? process.cwd(),
      yes: has('--yes'),
    })
    console.log(JSON.stringify(result, null, 2))
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
          harness: projectInstallStatus(ctx.root),
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
    let summary: Record<string, number>
    try {
      summary = store.transaction(() => {
        const loaded = loadRegistries(ctx.root, cfg)
        indexRegistries(store, loaded)
        const lexicon = indexLexicons(store, ctx.root, cfg)
        const next = { ...registryIndexSummary(loaded), ...lexicon }
        store.setMeta('indexSummary', JSON.stringify(next))
        return next
      })
    } finally {
      store.close()
    }
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

  if (cmd === 'recommend-command' || cmd === 'allowlist-check') {
    const cfg = requireRepoConfig(ctx.root)
    const commandKey = arg('--command')
    if (!commandKey) {
      console.error('Missing --command')
      usage()
      return
    }
    const result = inspectAllowlistedCommand(ctx.root, cfg, commandKey, {
      spec: arg('--spec') ?? '',
    })
    if (cmd === 'allowlist-check') {
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            commandKey,
            allowlisted: result.allowlisted,
            knownKeys: result.knownKeys,
            executableOwner: result.executableOwner,
            recommendation: result.recommendation,
          },
          null,
          2,
        ),
      )
    } else {
      console.log(JSON.stringify(result, null, 2))
    }
    process.exit(result.allowlisted ? 0 : 1)
  }

  if (cmd === 'gen') {
    console.error(
      'deprecated: `artifactgraph gen` executes product commands; use `recommend-command` / `allowlist-check`, then the owning kit',
    )
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
