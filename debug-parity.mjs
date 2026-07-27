import { parityCheck } from './dist/analyze/parity-check.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const repo = mkdtempSync(path.join(os.tmpdir(), 'artifactgraph-parity-fixture-'))
const moduleDir = 'product/surfaces/admin-web/modules/CMP-01-auth'
const irDir = path.join(repo, moduleDir, 'login/code/W-01-web/ir')
mkdirSync(irDir, { recursive: true })
writeFileSync(
  path.join(irDir, 'spec.yaml'),
  'id: W-01-web\nfields:\n  - name: status\n    type: string\n    empty: omit\n',
)
const beIrDir = path.join(repo, moduleDir, 'login/code/API-01-web/ir')
mkdirSync(beIrDir, { recursive: true })
writeFileSync(
  path.join(beIrDir, 'spec.yaml'),
  'id: API-01-web\nfields:\n  - name: status\n    type: string\n    empty: null\n',
)

const result = parityCheck({ repoRoot: repo, moduleDir })
console.log(JSON.stringify(result, null, 2))
