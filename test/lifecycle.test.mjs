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
} from '../dist/install/project.js'
import { installAgents, uninstallAgents } from '../dist/install/agents.js'
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
