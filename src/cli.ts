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
import { lstatSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
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
import { installAgents, uninstallAgents, AGENT_IDS } from './install/agents.js'
import { checkboxPrompt, selectPrompt } from './install/prompt.js'
import {
  assertProjectManifestCompatible,
  installProjectAssets,
  normalizeInstallTypes,
  parseInstallTypes,
  pruneProjectAssets,
  projectInstallStatus,
  uninstallProjectAssets,
  type InstallType,
} from './install/project.js'
import {
  discoverInstalls,
  ledgerPath,
  readLedger,
  removeLedger,
} from './install/ledger.js'

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
  deinit [--project-root <path>] [--yes]  # remove this repo's harness + local MCP
  rebuild
  analyze      (--spec <path> | --bullets <text>)
  gaps         (--spec <path> | --bullets <text>)
  suggest      --lane fe|docs|plans [--bullets <text>]
  parity       (--module <dir> | --findings <path>)
  recommend-command --command <key> [--spec <path>]
  allowlist-check   --command <key>
  gen               --command <key> [--spec <path>] # deprecated executable shim

Global uninstall (run anywhere; removes all repo installs + MCP + CLI):
  uninstall [--discover <dir>] [--yes]    # dry-run/confirm unless --yes

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
    const ctx = resolveRepoContext()
    assertProjectManifestCompatible(ctx.root)
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
    const types = await resolveInitTypes(ctx.stack)
    const writtenAgentPaths = result.written
      .map((entry) => entry.path)
      .filter((file) => !file.includes('(permissions)'))
    const project = installProjectAssets({
      repoRoot: ctx.root,
      stack: ctx.stack,
      types,
      force: has('--force'),
      writtenAgentPaths,
    })
    console.log(`Initialized ${ctx.root} (types=${project.types.join(',')})`)
    for (const key of ['created', 'updated', 'skipped', 'conflicts'] as const) {
      if (project[key].length) console.log(`  ${key}: ${project[key].join(', ')}`)
    }
    console.log(
      `gitignore: ${project.gitignore.changed ? 'updated' : 'unchanged'} ${project.gitignore.file}`,
    )
    if (project.gitignore.added.length) {
      console.log(`  added: ${project.gitignore.added.join(', ')}`)
    }
    if (!project.types.includes('docs')) {
      console.log(
        'note: non-docs ArtifactGraph indexes this repo only; use CODEGENKIT_DOCS_ROOT/DOCSKIT_ROOT to reach the docs registry hub',
      )
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

type UninstallScope =
  | 'repo'
  | 'all-repos'
  | 'mcp-local'
  | 'mcp-global'
  | 'cli'
  | 'all'

const UNINSTALL_SCOPES: UninstallScope[] = [
  'repo',
  'all-repos',
  'mcp-local',
  'mcp-global',
  'cli',
  'all',
]

interface UninstallFlags {
  yes: boolean
  keepMcp: boolean
  target?: string
  projectRoot?: string
  discoverDir?: string
}

function cliLayout(): { installDir: string; binDir: string } {
  const nativeWindowsDir =
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'artifactgraph')
      : undefined
  const installDir = process.env.ARTIFACTGRAPH_INSTALL_DIR
    ? path.resolve(process.env.ARTIFACTGRAPH_INSTALL_DIR)
    : nativeWindowsDir ?? path.join(os.homedir(), '.artifactgraph')
  const binDir = process.env.ARTIFACTGRAPH_BIN_DIR
    ? path.resolve(process.env.ARTIFACTGRAPH_BIN_DIR)
    : nativeWindowsDir
      ? path.join(nativeWindowsDir, 'bin')
      : path.join(os.homedir(), '.local', 'bin')
  return { installDir, binDir }
}

function lexists(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

function realOrSelf(file: string): string {
  try {
    return realpathSync(file)
  } catch {
    return file
  }
}

function removeCli(dryRun: boolean): {
  removed: string[]
  wouldRemove: string[]
  skipped: string[]
} {
  const { installDir, binDir } = cliLayout()
  const result = {
    removed: [] as string[],
    wouldRemove: [] as string[],
    skipped: [] as string[],
  }
  const current = realOrSelf(process.cwd())
  for (const target of [
    path.join(binDir, 'artifactgraph'),
    path.join(binDir, 'artifactgraph-mcp'),
    path.join(binDir, 'artifactgraph.cmd'),
    path.join(binDir, 'artifactgraph-mcp.cmd'),
    installDir,
  ]) {
    if (!lexists(target)) continue
    if (target === installDir && realOrSelf(target) === current) {
      result.skipped.push(`${target} (running from here — remove manually)`)
    } else if (dryRun) {
      result.wouldRemove.push(target)
    } else {
      try {
        rmSync(target, { recursive: true, force: true })
        result.removed.push(target)
      } catch (error) {
        result.skipped.push(
          `${target} (${error instanceof Error ? error.message : String(error)})`,
        )
      }
    }
  }
  return result
}

function repoTargets(flags: UninstallFlags): string[] {
  const repos = new Set(readLedger())
  if (flags.discoverDir) {
    for (const repo of discoverInstalls(flags.discoverDir)) repos.add(repo)
  }
  return [...repos]
}

function runUninstallScope(scope: UninstallScope, flags: UninstallFlags): void {
  const root = flags.projectRoot ? path.resolve(flags.projectRoot) : process.cwd()
  const removeRepo = (repoRoot: string): void => {
    console.log(`repo: ${repoRoot}`)
    const result = uninstallProjectAssets({ repoRoot, yes: flags.yes })
    for (const file of result.wouldDelete) console.log(`  would delete: ${file}`)
    for (const file of result.deleted) console.log(`  deleted: ${file}`)
    for (const file of result.preservedModified) {
      console.log(`  preserve modified: ${file}`)
    }
    for (const file of result.preservedUnsafe) console.log(`  preserve unsafe: ${file}`)
    for (const pattern of result.gitignorePreservedShared) {
      console.log(`  preserve shared ignore: ${pattern}`)
    }
  }
  const removeMcp = (location: 'local' | 'global', cwd: string): void => {
    const result = uninstallAgents({
      target: flags.target ?? 'all',
      location,
      cwd,
      yes: flags.yes,
    })
    if (!result.removed.length) {
      console.log(`  mcp (${location}): no artifactgraph entry`)
    }
    for (const entry of result.removed) {
      console.log(`  ${flags.yes ? 'unwired' : 'would unwire'} (${location}): ${entry}`)
    }
  }
  const removeCliInstall = (): void => {
    const result = removeCli(!flags.yes)
    for (const file of result.wouldRemove) console.log(`  would remove: ${file}`)
    for (const file of result.removed) console.log(`  removed: ${file}`)
    for (const file of result.skipped) console.log(`  skip: ${file}`)
  }

  if (scope === 'repo') {
    removeRepo(root)
    if (!flags.keepMcp) removeMcp('local', root)
    return
  }
  if (scope === 'all-repos' || scope === 'all') {
    const repos = repoTargets(flags)
    if (!repos.length) console.log('  (no registered repos — try --discover <dir>)')
    for (const repo of repos) {
      removeRepo(repo)
      if (!flags.keepMcp) removeMcp('local', repo)
    }
    if (scope === 'all-repos') return
  }
  if (scope === 'mcp-local') {
    removeMcp('local', root)
    return
  }
  if (scope === 'mcp-global' || scope === 'all') removeMcp('global', root)
  if (scope === 'cli' || scope === 'all') removeCliInstall()
  if (scope === 'all') {
    if (flags.yes) {
      if (removeLedger()) console.log(`  ledger removed: ${ledgerPath()}`)
    } else {
      console.log(`  would remove ledger: ${ledgerPath()}`)
    }
  }
}

async function runUninstall(defaultScope: 'repo' | 'all'): Promise<void> {
  const requiredPath = (flag: string): string | undefined => {
    const value = arg(flag)
    if (has(flag) && (!value || value.startsWith('-'))) {
      throw new Error(`${flag} requires a path`)
    }
    return value
  }
  let projectRoot: string | undefined
  let discoverDir: string | undefined
  try {
    projectRoot = requiredPath('--project-root')
    discoverDir = requiredPath('--discover')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
    return
  }
  const flags: UninstallFlags = {
    yes: has('--yes'),
    keepMcp: has('--keep-mcp'),
    target: arg('--target'),
    projectRoot,
    discoverDir,
  }
  try {
    const scopeArg = arg('--scope')
    let scope: UninstallScope = defaultScope
    if (defaultScope === 'all' && scopeArg) {
      if (!UNINSTALL_SCOPES.includes(scopeArg as UninstallScope)) {
        throw new Error(`--scope must be one of: ${UNINSTALL_SCOPES.join(', ')}`)
      }
      scope = scopeArg as UninstallScope
    }
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !flags.yes
    if (interactive) {
      console.log(`\nPreview (${scope}):`)
      runUninstallScope(scope, { ...flags, yes: false })
      const answer = await selectPrompt<'yes' | 'no'>({
        message:
          defaultScope === 'repo'
            ? 'Apply artifactgraph deinit for this repo?'
            : 'Apply global artifactgraph uninstall (all repos + MCP + CLI)?',
        defaultIndex: 0,
        choices: [
          { value: 'no', name: 'No — cancel' },
          { value: 'yes', name: 'Yes — remove now' },
        ],
      })
      if (answer !== 'yes') {
        console.log('Cancelled.')
        return
      }
      console.log(`\nApplying (${scope}):`)
      runUninstallScope(scope, { ...flags, yes: true })
      console.log(`\nUninstalled (${scope}).`)
      return
    }
    runUninstallScope(scope, flags)
    console.log(
      flags.yes
        ? `\nUninstalled (${scope}).`
        : `\nDry-run (${scope}) — pass --yes to apply.`,
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      console.log('\nCancelled.')
      return
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
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

  if (cmd === 'deinit') {
    await runUninstall('repo')
    return
  }

  if (cmd === 'uninstall') {
    await runUninstall('all')
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
