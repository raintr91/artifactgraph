import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  installProjectAssets,
  uninstallProjectAssets,
  projectInstallStatus,
} from '../dist/install/project.js'
import { installAgents, uninstallAgents } from '../dist/install/agents.js'
import {
  canonicalGitignorePattern,
  ensureGitignoreEntries,
  stripLegacyGitignoreBlock,
} from '../dist/install/gitignore.js'
import {
  discoverInstalls,
  forgetInstall,
  ledgerPath,
  readLedger,
  recordInstall,
} from '../dist/install/ledger.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const state = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-lifecycle-state-'))
process.env.ARTIFACTGRAPH_STATE_DIR = state

function temp(name) {
  return mkdtempSync(path.join(os.tmpdir(), `artifactgraph-${name}-`))
}

test('install ledger records, forgets, and discovers repo installs', () => {
  const workspace = temp('discover')
  const repo = path.join(workspace, 'nested', 'repo')
  mkdirSync(repo, { recursive: true })
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })

  assert.deepEqual(readLedger(), [repo])
  assert.deepEqual(discoverInstalls(workspace), [repo])
  forgetInstall(repo)
  assert.deepEqual(readLedger(), [])
  recordInstall(repo)
  assert.deepEqual(readLedger(), [repo])
  assert.equal(ledgerPath(), path.join(state, 'installs.json'))
})

test('deinit removes owned files but preserves modified and product config', () => {
  const repo = temp('deinit')
  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['fe'] })
  const modifiedRel = '.cursor/skills/artifactgraph/SKILL.md'
  const modified = path.join(repo, modifiedRel)
  writeFileSync(modified, `${readFileSync(modified, 'utf8')}member change\n`)

  const preview = uninstallProjectAssets({ repoRoot: repo })
  assert.equal(preview.dryRun, true)
  assert.ok(preview.preservedModified.includes(modifiedRel))
  assert.equal(existsSync(path.join(repo, '.artifactgraph/install-manifest.json')), true)

  const result = uninstallProjectAssets({ repoRoot: repo, yes: true })
  assert.ok(result.preservedModified.includes(modifiedRel))
  assert.equal(existsSync(modified), true)
  assert.equal(existsSync(path.join(repo, '.cursor/rules/artifactgraph.mdc')), false)
  assert.equal(existsSync(path.join(repo, 'artifactgraph.json')), true)
  assert.equal(existsSync(path.join(repo, '.artifactgraph/install-manifest.json')), false)
  assert.equal(readLedger().includes(repo), false)
})

test('MCP uninstall removes only ArtifactGraph keys from shared config', () => {
  const repo = temp('shared-mcp')
  const config = path.join(repo, '.cursor', 'mcp.json')
  mkdirSync(path.dirname(config), { recursive: true })
  writeFileSync(
    config,
    `${JSON.stringify({
      editorSetting: true,
      mcpServers: {
        artifactgraph: { command: 'artifactgraph-mcp', args: [] },
        another: { command: 'other', args: [] },
      },
    }, null, 2)}\n`,
  )

  const preview = uninstallAgents({
    target: 'cursor',
    location: 'local',
    cwd: repo,
  })
  assert.equal(preview.removed.length, 1)
  assert.ok(JSON.parse(readFileSync(config, 'utf8')).mcpServers.artifactgraph)

  uninstallAgents({ target: 'cursor', location: 'local', cwd: repo, yes: true })
  const remaining = JSON.parse(readFileSync(config, 'utf8'))
  assert.equal(remaining.editorSetting, true)
  assert.equal(remaining.mcpServers.artifactgraph, undefined)
  assert.deepEqual(remaining.mcpServers.another, { command: 'other', args: [] })
})

test('local uninstall removes Codex, Hermes, and Antigravity entries', async () => {
  const repo = temp('local-agent-uninstall')
  const previousCwd = process.cwd()
  process.chdir(repo)
  try {
    const installed = await installAgents({
      target: 'codex,hermes,antigravity',
      yes: true,
    })
    assert.equal(installed.location, 'local')
    assert.deepEqual(installed.skipped, [])

    const removed = uninstallAgents({
      target: 'codex,hermes,antigravity',
      location: 'local',
      cwd: repo,
      yes: true,
    })
    assert.equal(removed.removed.length, 3)

    const codex = readFileSync(path.join(repo, '.codex', 'config.toml'), 'utf8')
    const hermes = readFileSync(path.join(repo, '.hermes', 'config.yaml'), 'utf8')
    const antigravity = JSON.parse(
      readFileSync(path.join(repo, '.gemini', 'config', 'mcp_config.json'), 'utf8'),
    )
    assert.doesNotMatch(codex, /mcp_servers\.artifactgraph/)
    assert.doesNotMatch(hermes, /artifactgraph/)
    assert.equal(antigravity.mcpServers.artifactgraph, undefined)
  } finally {
    process.chdir(previousCwd)
  }
})

test('CLI deinit is repo-local and uninstall is global from any directory', () => {
  const cli = path.join(packageRoot, 'bin', 'artifactgraph.mjs')
  const repoA = temp('global-a')
  const repoB = temp('global-b')
  const anywhere = temp('anywhere')
  const fakeHome = temp('home')
  const fakeInstall = path.join(fakeHome, '.artifactgraph')
  const fakeBin = path.join(fakeHome, '.local', 'bin')
  mkdirSync(fakeInstall, { recursive: true })
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(path.join(fakeInstall, 'marker'), 'installed\n')
  for (const name of ['artifactgraph', 'artifactgraph-mcp']) {
    symlinkSync(cli, path.join(fakeBin, name))
  }

  installProjectAssets({ repoRoot: repoA, stack: 'generic', types: ['common'] })
  installProjectAssets({ repoRoot: repoB, stack: 'generic', types: ['common'] })
  for (const repo of [repoA, repoB]) {
    writeFileSync(
      path.join(repo, '.mcp.json'),
      '{"mcpServers":{"artifactgraph":{"command":"node","args":[]}}}\n',
    )
  }

  const deinit = spawnSync(
    process.execPath,
    [cli, 'deinit', '--project-root', repoA, '--target=claude', '--yes'],
    {
      cwd: anywhere,
      encoding: 'utf8',
      env: { ...process.env, ARTIFACTGRAPH_STATE_DIR: state },
    },
  )
  assert.equal(deinit.status, 0, deinit.stderr)
  assert.match(deinit.stdout, /Uninstalled \(repo\)/)
  assert.equal(existsSync(path.join(repoA, '.artifactgraph/install-manifest.json')), false)
  assert.equal(existsSync(path.join(repoB, '.artifactgraph/install-manifest.json')), true)

  const global = spawnSync(
    process.execPath,
    [cli, 'uninstall', '--target=claude', '--yes'],
    {
      cwd: anywhere,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: fakeHome,
        ARTIFACTGRAPH_STATE_DIR: state,
        ARTIFACTGRAPH_INSTALL_DIR: fakeInstall,
        ARTIFACTGRAPH_BIN_DIR: fakeBin,
      },
    },
  )
  assert.equal(global.status, 0, global.stderr)
  assert.match(global.stdout, /Uninstalled \(all\)/)
  assert.equal(existsSync(path.join(repoB, '.artifactgraph/install-manifest.json')), false)
  assert.equal(
    JSON.parse(readFileSync(path.join(repoB, '.mcp.json'), 'utf8')).mcpServers
      .artifactgraph,
    undefined,
  )
  assert.equal(existsSync(fakeInstall), false)
  assert.equal(existsSync(path.join(fakeBin, 'artifactgraph')), false)
  assert.equal(existsSync(ledgerPath()), false)
})

test('CLI uninstall defaults to dry-run without --yes', () => {
  const cli = path.join(packageRoot, 'bin', 'artifactgraph.mjs')
  const fakeHome = temp('dry-home')
  const result = spawnSync(process.execPath, [cli, 'uninstall'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: fakeHome,
      ARTIFACTGRAPH_STATE_DIR: temp('dry-state'),
      ARTIFACTGRAPH_INSTALL_DIR: path.join(fakeHome, '.artifactgraph'),
      ARTIFACTGRAPH_BIN_DIR: path.join(fakeHome, '.local', 'bin'),
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Dry-run \(all\)/)
})

test('gitignore helpers are idempotent, equivalence-aware, and preserve CRLF', () => {
  const repo = temp('gitignore-helpers')
  const file = path.join(repo, '.gitignore')
  writeFileSync(file, 'node_modules/\r\n/.cursor/\r\n', 'utf8')

  const first = ensureGitignoreEntries(repo, ['.cursor/', '.artifactgraph/', 'dist'])
  assert.deepEqual(first.added.sort(), ['.artifactgraph/', 'dist'])
  assert.match(readFileSync(file, 'utf8'), /\r\n/)

  const second = ensureGitignoreEntries(repo, ['/.cursor/', '.artifactgraph/'])
  assert.deepEqual(second.added, [])
  assert.equal(second.changed, false)
  assert.equal(canonicalGitignorePattern('/.cursor/'), canonicalGitignorePattern('.cursor'))
})

test('init merges actual local targets into .gitignore and status reports missing', async () => {
  const repo = temp('gitignore-init')
  writeFileSync(path.join(repo, '.gitignore'), '# member\nnode_modules/\n', 'utf8')
  const previousCwd = process.cwd()
  process.chdir(repo)
  try {
    const agents = await installAgents({ target: 'cursor,claude', yes: true })
    const first = installProjectAssets({
      repoRoot: repo,
      stack: 'generic',
      types: ['common'],
      writtenAgentPaths: agents.written.map((entry) => entry.path),
    })
    assert.equal(first.gitignore.changed, true)
    const ignore = readFileSync(path.join(repo, '.gitignore'), 'utf8')
    assert.match(ignore, /# member/)
    assert.match(ignore, /node_modules\//)
    assert.match(ignore, /\.artifactgraph\//)
    assert.match(ignore, /artifactgraph\//)
    assert.match(ignore, /artifactgraph\.json/)
    assert.match(ignore, /\.cursor\//)
    assert.match(ignore, /\.mcp\.json/)
    assert.doesNotMatch(ignore, />>> artifactgraph generated files/)

    const manifest = JSON.parse(
      readFileSync(path.join(repo, '.artifactgraph/install-manifest.json'), 'utf8'),
    )
    assert.ok(manifest.gitignore.some((entry) => entry.pattern === '.cursor/' && entry.shared))
    assert.ok(
      manifest.gitignore.some(
        (entry) => entry.pattern === '.artifactgraph/' && !entry.shared,
      ),
    )

    const second = installProjectAssets({
      repoRoot: repo,
      stack: 'generic',
      types: ['common'],
      writtenAgentPaths: agents.written.map((entry) => entry.path),
    })
    assert.equal(second.gitignore.changed, false)

    // Drop an exclusive line and confirm status reports it missing.
    writeFileSync(
      path.join(repo, '.gitignore'),
      '# member\nnode_modules/\n.cursor/\n.mcp.json\n',
      'utf8',
    )
    const status = projectInstallStatus(repo)
    assert.ok(status.gitignore.some((entry) => entry.pattern === '.artifactgraph/' && !entry.present))
    assert.ok(status.missing.some((item) => item.includes('.artifactgraph/')))
  } finally {
    process.chdir(previousCwd)
  }
})

test('local agent paths are ignored; global paths are not claimed', async () => {
  const repo = temp('gitignore-local-global')
  const previousCwd = process.cwd()
  process.chdir(repo)
  try {
    const local = await installAgents({
      target: 'codex,hermes,antigravity',
      yes: true,
    })
    installProjectAssets({
      repoRoot: repo,
      stack: 'generic',
      types: ['common'],
      writtenAgentPaths: local.written.map((entry) => entry.path),
    })
    const ignore = readFileSync(path.join(repo, '.gitignore'), 'utf8')
    assert.match(ignore, /\.codex\//)
    assert.match(ignore, /\.hermes\//)
    assert.match(ignore, /\.gemini\//)

    const elsewhere = temp('gitignore-global-elsewhere')
    process.chdir(elsewhere)
    const global = await installAgents({
      target: 'cursor',
      location: 'global',
      yes: true,
      mcpFile: path.join(elsewhere, 'outside-mcp.json'),
    })
    // mcpFile path writes outside normal agentConfigPath; project install with
    // an absolute path under a different root must not claim it.
    installProjectAssets({
      repoRoot: elsewhere,
      stack: 'generic',
      types: ['common'],
      writtenAgentPaths: [path.join(os.homedir(), '.cursor', 'mcp.json')],
    })
    const globalIgnore = readFileSync(path.join(elsewhere, '.gitignore'), 'utf8')
    assert.match(globalIgnore, /\.artifactgraph\//)
    assert.match(globalIgnore, /\.cursor\//)
    assert.doesNotMatch(globalIgnore, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    void global
  } finally {
    process.chdir(previousCwd)
  }
})

test('deinit removes exclusive ignore entries but keeps shared .cursor/', async () => {
  const repo = temp('gitignore-deinit')
  const previousCwd = process.cwd()
  process.chdir(repo)
  try {
    writeFileSync(
      path.join(repo, '.gitignore'),
      '# other toolkit\n.cursor/\ncoverage/\n',
      'utf8',
    )
    const agents = await installAgents({ target: 'cursor', yes: true })
    installProjectAssets({
      repoRoot: repo,
      stack: 'generic',
      types: ['common'],
      writtenAgentPaths: agents.written.map((entry) => entry.path),
    })
    assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /\.artifactgraph\//)

    const result = uninstallProjectAssets({ repoRoot: repo, yes: true })
    assert.ok(result.gitignorePreservedShared.includes('.cursor/'))
    const ignore = readFileSync(path.join(repo, '.gitignore'), 'utf8')
    assert.match(ignore, /# other toolkit/)
    assert.match(ignore, /\.cursor\//)
    assert.match(ignore, /coverage\//)
    assert.doesNotMatch(ignore, /\.artifactgraph\//)
    assert.doesNotMatch(ignore, /^artifactgraph\.json$/m)
    assert.equal(existsSync(path.join(repo, 'artifactgraph.json')), true)
  } finally {
    process.chdir(previousCwd)
  }
})

test('legacy gitignore marker block is stripped on init', () => {
  const repo = temp('gitignore-legacy')
  writeFileSync(
    path.join(repo, '.gitignore'),
    [
      'keep-me',
      '# >>> artifactgraph generated files',
      '/.cursor/',
      '/.artifactgraph/',
      '# <<< artifactgraph generated files',
      '',
    ].join('\n'),
    'utf8',
  )
  const stripped = stripLegacyGitignoreBlock(repo)
  assert.equal(stripped.changed, true)
  assert.equal(readFileSync(path.join(repo, '.gitignore'), 'utf8'), 'keep-me\n')

  installProjectAssets({ repoRoot: repo, stack: 'generic', types: ['common'] })
  const ignore = readFileSync(path.join(repo, '.gitignore'), 'utf8')
  assert.match(ignore, /keep-me/)
  assert.match(ignore, /\.artifactgraph\//)
  assert.doesNotMatch(ignore, />>> artifactgraph generated files/)
})
