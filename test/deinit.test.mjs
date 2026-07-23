import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  installProjectAssets,
  uninstallProjectAssets,
} from '../dist/install/project.js'

function temp(name) {
  return mkdtempSync(path.join(os.tmpdir(), `artifactgraph-${name}-`))
}

test('deinit removes all skills for all agents', () => {
  const repo = temp('deinit-all')
  
  installProjectAssets({
    repoRoot: repo,
    stack: 'generic',
    types: ['common', 'docs'],
    agents: ['cursor', 'claude', 'gemini']
  })

  // Check they exist
  assert.equal(existsSync(path.join(repo, '.claude/skills/artifactgraph/SKILL.md')), true)
  assert.equal(existsSync(path.join(repo, '.cursor/skills/artifactgraph/SKILL.md')), true)
  assert.equal(existsSync(path.join(repo, '.gemini/skills/artifactgraph/SKILL.md')), true)

  const result = uninstallProjectAssets({ repoRoot: repo, yes: true })
  console.log('Result:', result)
  
  // They should be deleted
  assert.equal(existsSync(path.join(repo, '.claude/skills/artifactgraph/SKILL.md')), false)
  assert.equal(existsSync(path.join(repo, '.cursor/skills/artifactgraph/SKILL.md')), false)
  assert.equal(existsSync(path.join(repo, '.gemini/skills/artifactgraph/SKILL.md')), false)
})
