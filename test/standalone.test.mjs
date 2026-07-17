import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  installProjectAssets,
  normalizeInstallTypes,
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
