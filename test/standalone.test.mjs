import test from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  installProjectAssets,
  normalizeInstallTypes,
  projectInstallStatus,
  pruneProjectAssets,
} from '../dist/install/project.js'
import { installAgents } from '../dist/install/agents.js'
import {
  defaultRepoConfig,
  loadRepoConfig,
} from '../dist/config/load-config.js'
import {
  resolveGapSourceFiles,
  resolveHubRoots,
  resolveVocabularyPath,
} from '../dist/config/resolve-paths.js'
import { parseRegistryTagsLexicon } from '../dist/lexicon/load-lexicon.js'
import { buildMcpEntry } from '../dist/install/agents.js'
import { IndexStore } from '../dist/db/index-store.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { inspectAllowlistedCommand } from '../dist/gen/run-command.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgVersion = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
).version
process.env.ARTIFACTGRAPH_STATE_DIR = mkdtempSync(
  path.join(os.tmpdir(), 'artifactgraph-test-state-'),
)

test('init installs local common + test assets without hubs', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-standalone-'))
  const result = installProjectAssets({
    repoRoot: repo,
    stack: 'generic',
    types: ['test'],
  })

  assert.deepEqual(result.types, ['common', 'test'])
  assert.equal(result.conflicts.length, 0)
  const config = loadRepoConfig(repo)
  assert.ok(config)
  assert.equal(
    config.vocabularies.registryTags,
    'artifactgraph/lexicon/registry-tags.en.txt',
  )
  assert.equal(
    config.vocabularies.testTaxonomy,
    'artifactgraph/lexicon/testcase-taxonomy.en.txt',
  )
  assert.equal(config.hubs, undefined)
  assert.equal(resolveHubRoots(repo, config).docs, undefined)
  assert.ok(resolveVocabularyPath(repo, config, 'registryTags')?.startsWith(repo))
  const ignore = readFileSync(path.join(repo, '.artifactgraph/.gitignore'), 'utf8')
  assert.match(ignore, /!install-manifest\.json/)
  const manifest = JSON.parse(
    readFileSync(path.join(repo, '.artifactgraph/install-manifest.json'), 'utf8'),
  )
  assert.deepEqual(
    {
      schemaVersion: manifest.schemaVersion,
      package: manifest.package,
      toolApi: manifest.toolApi,
      harnessApi: manifest.harnessApi,
      packageVersion: manifest.packageVersion,
    },
    {
      schemaVersion: 1,
      package: '@platform/artifactgraph',
      toolApi: 1,
      harnessApi: 1,
      packageVersion: pkgVersion,
    },
  )
  const status = projectInstallStatus(repo)
  assert.equal(status.compatibility, 'supported')
  assert.equal(status.compatible, true)
  assert.equal(status.legacy, false)
  assert.deepEqual(status.warnings, [])
})

test('init preserves a customized managed file on update', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-conflict-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  const skill = path.join(repo, '.cursor/skills/artifactgraph/SKILL.md')
  writeFileSync(skill, `${readFileSync(skill, 'utf8')}\ncustom\n`)

  const result = installProjectAssets({
    repoRoot: repo,
    stack: 'generic',
    types: ['fe'],
  })
  assert.ok(result.conflicts.includes('.cursor/skills/artifactgraph/SKILL.md'))
  assert.match(readFileSync(skill, 'utf8'), /custom/)
})

test('ArtifactGraph 2.0.0 legacy manifest warns and migrates on init', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-legacy-manifest-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  const manifestPath = path.join(repo, '.artifactgraph/install-manifest.json')
  const current = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const legacy = {
    version: 1,
    packageVersion: '2.0.0',
    types: current.types,
    files: current.files,
  }
  writeFileSync(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`)

  const before = projectInstallStatus(repo)
  assert.equal(before.compatibility, 'legacy')
  assert.equal(before.compatible, true)
  assert.equal(before.legacy, true)
  assert.match(before.warnings[0], /run artifactgraph init to migrate/)

  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  const migrated = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(migrated.version, undefined)
  assert.equal(migrated.schemaVersion, 1)
  assert.equal(migrated.package, '@platform/artifactgraph')
  assert.equal(migrated.toolApi, 1)
  assert.equal(migrated.harnessApi, 1)
  assert.equal(migrated.packageVersion, pkgVersion)
  assert.equal(projectInstallStatus(repo).compatibility, 'supported')
})

test('incompatible APIs fail before init writes or prune deletes', () => {
  const initRepo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-api-init-'))
  installProjectAssets({ repoRoot: initRepo, stack: 'generic', types: ['common'] })
  const manifestPath = path.join(initRepo, '.artifactgraph/install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.toolApi = 2
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const managed = path.join(initRepo, '.cursor/skills/artifactgraph/SKILL.md')
  unlinkSync(managed)

  assert.throws(
    () =>
      installProjectAssets({
        repoRoot: initRepo,
        stack: 'generic',
        types: ['common'],
      }),
    /Unsupported install-manifest toolApi 2.*Upgrade ArtifactGraph.*re-initialize/s,
  )
  assert.equal(existsSync(managed), false)
  const incompatible = projectInstallStatus(initRepo)
  assert.equal(incompatible.compatibility, 'incompatible')
  assert.equal(incompatible.compatible, false)
  assert.equal(incompatible.toolApi, 2)

  const pruneRepo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-api-prune-'))
  installProjectAssets({ repoRoot: pruneRepo, stack: 'generic', types: ['fe'] })
  installProjectAssets({ repoRoot: pruneRepo, stack: 'generic', types: ['common'] })
  const pruneManifestPath = path.join(pruneRepo, '.artifactgraph/install-manifest.json')
  const pruneManifest = JSON.parse(readFileSync(pruneManifestPath, 'utf8'))
  pruneManifest.harnessApi = 2
  writeFileSync(pruneManifestPath, `${JSON.stringify(pruneManifest, null, 2)}\n`)
  const stale = path.join(pruneRepo, '.cursor/extracts/artifactgraph-hooks-fe.md')

  assert.throws(
    () => pruneProjectAssets({ repoRoot: pruneRepo, yes: true }),
    /Unsupported install-manifest harnessApi 2.*Upgrade ArtifactGraph/s,
  )
  assert.equal(existsSync(stale), true)
})

test('CLI reports incompatibility and preflights init before agent writes', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-api-cli-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })
  const manifestPath = path.join(repo, '.artifactgraph/install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.schemaVersion = 2
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const cli = path.join(root, 'bin/artifactgraph.mjs')

  const statusResult = spawnSync(process.execPath, [cli, 'status'], {
    cwd: repo,
    encoding: 'utf8',
  })
  assert.equal(statusResult.status, 0, statusResult.stderr)
  const status = JSON.parse(statusResult.stdout)
  assert.equal(status.harness.compatibility, 'incompatible')
  assert.equal(status.harness.schemaVersion, 2)
  assert.match(status.harness.compatibilityError, /Upgrade ArtifactGraph/)

  const initResult = spawnSync(
    process.execPath,
    [cli, 'init', '--target=cursor', '--type=common', '--yes'],
    { cwd: repo, encoding: 'utf8' },
  )
  assert.equal(initResult.status, 1)
  assert.match(initResult.stderr, /Unsupported install-manifest schemaVersion 2/)
  assert.equal(existsSync(path.join(repo, '.cursor/mcp.json')), false)
})

test('legacy external paths degrade to package baseline and local-only gaps', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-paths-'))
  const config = {
    ...defaultRepoConfig('fixture'),
    vocabularies: { registryTags: '@base-docs/missing.txt' },
    gapSources: ['@base-docs/**/*.md', '**/HANDOFF.md'],
  }
  const baseline = resolveVocabularyPath(repo, config, 'registryTags')
  assert.equal(baseline, path.join(root, 'lexicon/registry-tags.en.txt'))
  assert.deepEqual(resolveGapSourceFiles(repo, config), [])
})

test('vocabularies preserve explicit non-hub paths on re-init', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-vocab-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['test'] })
  const cfgPath = path.join(repo, 'artifactgraph.json')
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  cfg.vocabularies.registryTags = '/tmp/custom-registry-tags.en.txt'
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')

  const result = installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  assert.equal(result.conflicts.length, 0)
  const cfg2 = JSON.parse(readFileSync(cfgPath, 'utf8'))
  assert.equal(cfg2.vocabularies.registryTags, '/tmp/custom-registry-tags.en.txt')
})

test('init never copies product-owned commands from stack presets', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-cmd-'))
  const result = installProjectAssets({
    repoRoot: repo,
    stack: 'nuxt4',
    types: ['fe'],
  })
  const cfg = JSON.parse(readFileSync(path.join(repo, 'artifactgraph.json'), 'utf8'))
  assert.deepEqual(cfg.commands, {})
  assert.equal(result.created.includes('artifactgraph.json'), true)
})

test('init marks removed type assets stale and prune is dry-run by default', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-prune-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  const staleRel = '.cursor/extracts/artifactgraph-hooks-fe.md'
  const staleFile = path.join(repo, staleRel)
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })

  const status = projectInstallStatus(repo)
  assert.deepEqual(status.stale.healthy, [staleRel])
  assert.equal(status.healthy.includes(staleRel), false)

  const dryRun = pruneProjectAssets({ repoRoot: repo })
  assert.equal(dryRun.dryRun, true)
  assert.deepEqual(dryRun.wouldDelete, [staleRel])
  assert.equal(existsSync(staleFile), true)

  const config = path.join(repo, 'artifactgraph.json')
  const index = path.join(repo, '.artifactgraph/index.db')
  const platformMap = path.join(repo, 'platform-repos.json')
  const registry = path.join(repo, 'registries/local.json')
  mkdirSync(path.dirname(registry), { recursive: true })
  for (const file of [index, platformMap, registry]) writeFileSync(file, 'product-owned\n')
  const manifestPath = path.join(repo, '.artifactgraph/install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const destRel of [
    'artifactgraph.json',
    '.artifactgraph/index.db',
    'platform-repos.json',
    'registries/local.json',
  ]) {
    manifest.files[destRel] = {
      source: 'harness/common/rules/artifactgraph.mdc',
      hash: 'a'.repeat(64),
      stale: true,
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const pruned = pruneProjectAssets({ repoRoot: repo, yes: true })
  assert.deepEqual(pruned.deleted, [staleRel])
  assert.deepEqual(pruned.preservedUnsafe.sort(), [
    '.artifactgraph/index.db',
    'artifactgraph.json',
    'platform-repos.json',
    'registries/local.json',
  ])
  assert.equal(existsSync(staleFile), false)
  for (const file of [config, index, platformMap, registry]) {
    assert.equal(existsSync(file), true)
  }
  assert.deepEqual(projectInstallStatus(repo).stale.healthy, [])
})

test('prune preserves modified and symlinked stale assets', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-prune-safe-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe', 'be'] })
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })
  const modifiedRel = '.cursor/extracts/artifactgraph-hooks-fe.md'
  const modified = path.join(repo, modifiedRel)
  writeFileSync(modified, `${readFileSync(modified, 'utf8')}custom\n`)

  const symlinkRel = '.cursor/extracts/artifactgraph-hooks-be.md'
  const symlink = path.join(repo, symlinkRel)
  const outside = path.join(os.tmpdir(), `artifactgraph-outside-${process.pid}.md`)
  writeFileSync(outside, readFileSync(symlink, 'utf8'))
  unlinkSync(symlink)
  symlinkSync(outside, symlink)

  const result = pruneProjectAssets({ repoRoot: repo, yes: true })
  assert.deepEqual(result.preservedModified, [modifiedRel])
  assert.deepEqual(result.preservedUnsafe, [symlinkRel])
  assert.equal(existsSync(modified), true)
  assert.equal(existsSync(symlink), true)
  assert.equal(existsSync(outside), true)
  unlinkSync(outside)
})

test('prune CLI honors project root and requires --yes to delete', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-prune-cli-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })
  const staleFile = path.join(repo, '.cursor/extracts/artifactgraph-hooks-fe.md')
  const cli = path.join(root, 'bin/artifactgraph.mjs')

  const dryRun = spawnSync(process.execPath, [cli, 'prune', '--project-root', repo], {
    encoding: 'utf8',
  })
  assert.equal(dryRun.status, 0, dryRun.stderr)
  assert.equal(JSON.parse(dryRun.stdout).dryRun, true)
  assert.equal(existsSync(staleFile), true)

  const missingRoot = spawnSync(
    process.execPath,
    [cli, 'prune', '--project-root', '--yes'],
    { cwd: repo, encoding: 'utf8' },
  )
  assert.equal(missingRoot.status, 1)
  assert.match(missingRoot.stderr, /--project-root requires a path/)
  assert.equal(existsSync(staleFile), true)

  const confirmed = spawnSync(
    process.execPath,
    [cli, 'prune', '--project-root', repo, '--yes'],
    { encoding: 'utf8' },
  )
  assert.equal(confirmed.status, 0, confirmed.stderr)
  assert.deepEqual(JSON.parse(confirmed.stdout).deleted, [
    '.cursor/extracts/artifactgraph-hooks-fe.md',
  ])
  assert.equal(existsSync(staleFile), false)
})

test('recommend-command inspects allowlist without executing', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-recommend-'))
  const marker = path.join(repo, 'must-not-exist.txt')
  const cfg = {
    ...defaultRepoConfig('fixture'),
    commands: {
      genDry: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`],
    },
  }
  const result = inspectAllowlistedCommand(repo, cfg, 'genDry', { spec: '' })
  assert.equal(result.ok, true)
  assert.equal(result.allowlisted, true)
  assert.equal(result.executableOwner, 'codegenkit')
  assert.equal(existsSync(marker), false)
})

test('allowlist check reports unknown key without executing', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-allowlist-'))
  const cfg = {
    ...defaultRepoConfig('fixture'),
    commands: { docsRender: ['bundlekit', 'render'] },
  }
  const result = inspectAllowlistedCommand(repo, cfg, 'registryValidate')
  assert.equal(result.ok, false)
  assert.equal(result.allowlisted, false)
  assert.deepEqual(result.knownKeys, ['docsRender'])
  assert.equal(result.executableOwner, 'codegenkit')
})

test('claude local init writes .mcp.json (project scope)', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-claude-'))
  const prev = process.cwd()
  process.chdir(repo)
  try {
    const res = await installAgents({
      target: 'claude',
      location: 'local',
      yes: true,
    })
    assert.ok(res.written.some((w) => w.agent === 'claude'))
    assert.equal(res.location, 'local')
    assert.ok(existsSync(path.join(repo, '.mcp.json')))
    assert.ok(
      !existsSync(path.join(repo, '.claude.json')),
      'should not write deprecated .claude.json',
    )
  } finally {
    process.chdir(prev)
  }
})

test('yes defaults previously global-only agents to project-local configs', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-local-agents-'))
  const prev = process.cwd()
  process.chdir(repo)
  try {
    const result = await installAgents({
      target: 'codex,hermes,antigravity',
      yes: true,
    })

    assert.equal(result.location, 'local')
    assert.deepEqual(result.skipped, [])
    assert.ok(existsSync(path.join(repo, '.codex', 'config.toml')))
    assert.ok(existsSync(path.join(repo, '.hermes', 'config.yaml')))
    assert.ok(existsSync(path.join(repo, '.gemini', 'config', 'mcp_config.json')))
  } finally {
    process.chdir(prev)
  }
})

test('baseline parser recognizes section K process tags', () => {
  const lexicon = parseRegistryTagsLexicon(
    path.join(root, 'lexicon/registry-tags.en.txt'),
  )
  assert.equal(
    lexicon.keywordHints['business process'],
    '#process: business-process',
  )
  assert.ok(lexicon.prefixes.includes('#process:'))
})

test('all expands explicitly to every install type', () => {
  assert.deepEqual(normalizeInstallTypes(['all']), [
    'common',
    'docs',
    'fe',
    'be',
    'test',
  ])
})

test('each init type installs independently', () => {
  for (const type of ['docs', 'fe', 'be', 'test', 'all']) {
    const repo = mkdtempSync(path.join(os.tmpdir(), `artifactgraph-${type}-`))
    const result = installProjectAssets({
      repoRoot: repo,
      stack: 'generic',
      types: [type],
    })
    assert.equal(result.conflicts.length, 0)
    assert.ok(result.types.includes('common'))
    if (type !== 'all') assert.ok(result.types.includes(type))
  }
})

test('index transactions roll back partial rebuild writes', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-tx-'))
  const store = new IndexStore(repo)
  assert.throws(() => {
    store.transaction(() => {
      store.upsertRegistryEntry('fixture', 'partial', { value: true })
      throw new Error('fixture failure')
    })
  })
  assert.deepEqual(store.listRegistryEntries('fixture'), [])
  store.close()
})

test('local MCP entry is pinned to the initialized repo', () => {
  const repo = '/tmp/example-artifactgraph-project'
  const entry = buildMcpEntry({ projectRoot: repo })
  assert.match(entry.args.join(' '), /--project-root/)
  assert.match(entry.args.join(' '), /example-artifactgraph-project/)
})

test('default stack presets contain no base hub runtime paths', () => {
  const stackDir = path.join(root, 'stacks')
  for (const name of [
    'generic',
    'nuxt4',
    'nextjs',
    'nuxt4-nest',
    'nextjs-nest',
    'laravel',
    'fastapi',
    'dotnet-line',
    'dotnet-integration',
  ]) {
    const text = readFileSync(path.join(stackDir, `${name}.json`), 'utf8')
    assert.doesNotThrow(() => JSON.parse(text), name)
    assert.doesNotMatch(text, /@base-(docs|tests)|"base-(docs|tests)"/)
  }
})

test('Cursor harness example is an exact generated export', () => {
  for (const file of [
    'common/skills/artifactgraph/SKILL.md',
    'common/skills/docs-mark/SKILL.md',
    'common/skills/platform-mark/SKILL.md',
    'common/extracts/docs-mark.md',
    'common/extracts/docs-mark-detect.md',
    'common/rules/artifactgraph.mdc',
    'common/extracts/artifactgraph-hooks-core.md',
    'docs/extracts/artifactgraph-hooks-docs.md',
    'docs/extracts/artifactgraph-parity.md',
    'fe/extracts/artifactgraph-hooks-fe.md',
    'be/extracts/artifactgraph-hooks-be.md',
    'test/extracts/artifactgraph-hooks-test.md',
  ]) {
    assert.equal(
      readFileSync(path.join(root, 'examples/cursor', file), 'utf8'),
      readFileSync(path.join(root, 'harness', file), 'utf8'),
      file,
    )
  }
})

test('MCP operates on a cwd-pinned repo without projectId', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-mcp-'))
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })
  const client = new Client({ name: 'standalone-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(root, 'bin/artifactgraph-mcp.mjs'),
      '--project-root',
      repo,
    ],
    stderr: 'pipe',
  })
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    const status = tools.tools.find((tool) => tool.name === 'artifactgraph_status')
    assert.ok(status)
    assert.equal(status.inputSchema.required, undefined)
    const response = await client.callTool({
      name: 'artifactgraph_status',
      arguments: {},
    })
    const payload = JSON.parse(response.content[0].text)
    assert.equal(payload.project.root, repo)
  } finally {
    await client.close()
  }
})

test('package bootstrap does not initialize mapped or arbitrary repositories', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['init:portal'], undefined)
  assert.equal(pkg.scripts['init:all'], undefined)

  const windowsInstaller = readFileSync(path.join(root, 'install.ps1'), 'utf8')
  assert.doesNotMatch(windowsInstaller, /artifactgraph_projects/)
  assert.doesNotMatch(windowsInstaller, /--mcp-file .*USERPROFILE/)
  assert.match(windowsInstaller, /cd \/path\/to\/product/)
})

test('dotnet-line suggests and infers as FE, not BE', async () => {
  const { inferSuggestLane } = await import('../dist/lexicon/infer-lane.js')
  const stack = JSON.parse(
    readFileSync(path.join(root, 'stacks/dotnet-line.json'), 'utf8'),
  )
  assert.ok(stack.dsl.lanes.fe)
  assert.equal(stack.dsl.lanes.be, undefined)
  assert.equal(inferSuggestLane({ ...stack, version: 2 }), 'fe')
})

test('stack presets use toolkit CLIs (no pnpm portal:/api:/nest: wrappers)', () => {
  const stackDir = path.join(root, 'stacks')
  for (const name of readdirSync(stackDir).filter((f) => f.endsWith('.json'))) {
    const stack = JSON.parse(readFileSync(path.join(stackDir, name), 'utf8'))
    for (const [key, argv] of Object.entries(stack.commands ?? {})) {
      assert.ok(Array.isArray(argv), `${name}.${key} argv`)
      assert.notEqual(argv[0], 'pnpm', `${name}.${key} must not use pnpm wrappers`)
      assert.ok(
        ['codegenkit', 'testkit', 'bundlekit', 'node'].includes(argv[0]) ||
          argv.length === 0,
        `${name}.${key}: unexpected bin ${argv[0]}`,
      )
      const joined = argv.join(' ')
      assert.doesNotMatch(
        joined,
        /\bportal:(gen|unit-gen|registry|lifecycle|e2e-registry)\b/,
        `${name}.${key}`,
      )
      assert.doesNotMatch(joined, /\b(api|nest|contract):(gen|unit-gen|registry)\b/, `${name}.${key}`)
      assert.doesNotMatch(joined, /^\.\/codegen\//, `${name}.${key}`)
    }
  }
})

test('shipped skill/rule route cross-repo lookups without CodeGraph ownership', () => {
  const skill = readFileSync(
    path.join(root, 'harness/common/skills/artifactgraph/SKILL.md'),
    'utf8',
  )
  const rule = readFileSync(
    path.join(root, 'harness/common/rules/artifactgraph.mdc'),
    'utf8',
  )
  for (const text of [skill, rule]) {
    assert.match(text, /HUBDOCS_ROOT/)
    assert.match(text, /codegraph-<key>/)
    assert.match(text, /Platform DNA/)
    assert.match(text, /local-only/i)
    assert.doesNotMatch(text, /auto-wire from .*platform-repos/)
  }
  assert.match(skill, /write cross-repo MCP entries/)
  assert.match(skill, /does not follow those pointers/)
})
