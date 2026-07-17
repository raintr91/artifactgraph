#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'harness')
const output = path.join(root, 'examples', 'cursor')

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

for (const type of ['common', 'docs', 'fe', 'be', 'test']) {
  cpSync(path.join(source, type), path.join(output, type), { recursive: true })
}

console.log(`Exported Cursor harness example → ${output}`)
