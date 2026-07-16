#!/usr/bin/env node
/**
 * R1: Build a VS Code / Cursor multi-root `.code-workspace` from platform-repos.json
 * so listed repos are IN the workspace (no External File Accept for edits).
 *
 * Usage (from any product base that has platform-repos.json):
 *   node scripts/platform-workspace-from-repos.mjs
 *   node scripts/platform-workspace-from-repos.mjs --group=platform-bases
 *   node scripts/platform-workspace-from-repos.mjs --out=platform-bases.code-workspace
 *   pnpm platform:workspace
 *
 * Then: File → Open Workspace from File… → platform-bases.code-workspace
 * Do NOT open only a single folder if you need cross-repo agent edits.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const out = {
    group: null,
    outFile: 'platform-bases.code-workspace',
    syncBases: false,
    cwd: process.cwd(),
    includeReadOnly: false,
  }
  for (const a of argv) {
    if (a.startsWith('--group=')) out.group = a.slice('--group='.length)
    else if (a.startsWith('--out=')) out.outFile = a.slice('--out='.length)
    else if (a === '--sync-bases') out.syncBases = true
    else if (a === '--include-readonly') out.includeReadOnly = true
    else if (a.startsWith('--cwd=')) out.cwd = path.resolve(a.slice('--cwd='.length))
  }
  return out
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

function loadReposMap(repoRoot) {
  const main = path.join(repoRoot, 'platform-repos.json')
  if (!existsSync(main)) {
    throw new Error(`Missing ${main}`)
  }
  let doc = JSON.parse(readFileSync(main, 'utf8'))
  const local = path.join(repoRoot, 'platform-repos.local.json')
  if (existsSync(local)) {
    doc = deepMerge(doc, JSON.parse(readFileSync(local, 'utf8')))
  }
  return doc
}

/**
 * Unique folders for a group. Prefer write:true entries; skip missing roots.
 * Honors `workspaceRoot` (artifactgraph map): project.root is relative to that base.
 */
function buildFolders(repoRoot, doc, groupId, includeReadOnly) {
  const group = doc.groups?.[groupId]
  if (!group?.projects?.length) {
    throw new Error(`Unknown or empty group "${groupId}". Known: ${Object.keys(doc.groups || {}).join(', ')}`)
  }

  const rootsBase = doc.workspaceRoot
    ? path.resolve(repoRoot, doc.workspaceRoot)
    : repoRoot

  /** @type {Map<string, { name: string, path: string, ids: string[] }>} */
  const byAbs = new Map()

  for (const id of group.projects) {
    const proj = doc.projects?.[id]
    if (!proj?.root) {
      console.warn(`skip ${id}: missing projects.${id}.root`)
      continue
    }
    if (proj.write === false && !includeReadOnly) {
      console.warn(`skip ${id}: write=false (pass --include-readonly to force)`)
      continue
    }

    let abs = path.resolve(rootsBase, proj.root)
    // MCP map quirk: artifactgraph root "." + workspaceRoot ".." → workspace/, not this checkout
    if (
      doc.workspaceRoot &&
      (proj.root === '.' || abs === rootsBase) &&
      proj.repo &&
      existsSync(path.join(rootsBase, proj.repo))
    ) {
      abs = path.join(rootsBase, proj.repo)
    }
    if (!existsSync(abs)) {
      console.warn(`skip ${id}: root not on disk (${proj.root} → ${abs})`)
      continue
    }

    // Paths in .code-workspace are relative to the workspace file (repoRoot)
    const rel = path.relative(repoRoot, abs) || '.'
    const folderPath = rel === '' ? '.' : rel.split(path.sep).join('/')

    const existing = byAbs.get(abs)
    if (existing) {
      existing.ids.push(id)
      if (id === group.primary) existing.name = id
      continue
    }

    byAbs.set(abs, {
      name: id,
      path: folderPath,
      ids: [id],
    })
  }

  const order = group.projects
  const folders = [...byAbs.values()].sort((a, b) => {
    const ia = Math.min(...a.ids.map((id) => order.indexOf(id)).filter((i) => i >= 0), 999)
    const ib = Math.min(...b.ids.map((id) => order.indexOf(id)).filter((i) => i >= 0), 999)
    return ia - ib
  })

  return folders.map(({ name, path: p, ids }) => ({
    name: ids.length > 1 ? `${name} (${ids.join(', ')})` : name,
    path: p,
  }))
}

function writeWorkspace(repoRoot, outFile, folders, groupId) {
  const workspace = {
    folders,
    settings: {
      // Hint only — member must open this file as workspace
      'files.exclude': {},
    },
    extensions: {},
  }
  // JSONC-friendly header via leading comment not valid in JSON — put _comment field
  const payload = {
    folders: workspace.folders,
    settings: {
      ...workspace.settings,
    },
  }
  const dest = path.join(repoRoot, outFile)
  const header = [
    '// Generated by scripts/platform-workspace-from-repos.mjs — do not hand-edit.',
    `// Group: ${groupId} · regenerate: pnpm platform:workspace`,
    '// Open via: File → Open Workspace from File… (not "Open Folder" on a single repo).',
    '',
  ].join('\n')

  // .code-workspace is JSONC in practice; write pure JSON for max compatibility
  writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  // Also write a tiny sibling readme note? skip — PROJECT-MAPS covers it
  void header
  return dest
}

/** Copy this script into sibling bases and regenerate their workspace files. */
function syncBases(portalScriptsDir) {
  const ws = path.resolve(portalScriptsDir, '../..')
  const scriptSrc = path.join(portalScriptsDir, 'platform-workspace-from-repos.mjs')
  const targets = [
    'portal',
    'nextjs',
    'nuxt_nest',
    'next_nest',
    'fast-api-base',
    'api',
    'integration',
    'line',
    'base-docs',
    'base-tests',
    'artifactgraph',
    'hubdocs',
  ]

  for (const dir of targets) {
    const root = path.join(ws, dir)
    if (!existsSync(root)) {
      console.warn(`SKIP missing ${dir}`)
      continue
    }
    if (!existsSync(path.join(root, 'platform-repos.json'))) {
      console.warn(`SKIP ${dir}: no platform-repos.json`)
      continue
    }
    const scriptsDir = path.join(root, 'scripts')
    mkdirSync(scriptsDir, { recursive: true })
    const destScript = path.join(scriptsDir, 'platform-workspace-from-repos.mjs')
    copyFileSync(scriptSrc, destScript)

    // Generate from that repo's map
    const doc = loadReposMap(root)
    const groupId = doc.defaultGroup || 'platform-bases'
    const folders = buildFolders(root, doc, groupId, false)
    const out = writeWorkspace(root, 'platform-bases.code-workspace', folders, groupId)
    console.log(`OK ${dir}: script + ${path.basename(out)} (${folders.length} folders)`)
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.syncBases) {
    // When invoked from portal/scripts
    const scriptsDir = existsSync(path.join(opts.cwd, 'scripts', 'platform-workspace-from-repos.mjs'))
      ? path.join(opts.cwd, 'scripts')
      : __dirname
    syncBases(scriptsDir)
    return
  }

  const repoRoot = opts.cwd
  const doc = loadReposMap(repoRoot)
  const groupId = opts.group || doc.defaultGroup || 'platform-bases'
  const folders = buildFolders(repoRoot, doc, groupId, opts.includeReadOnly)
  if (!folders.length) {
    throw new Error(`No folders resolved for group "${groupId}"`)
  }
  const dest = writeWorkspace(repoRoot, opts.outFile, folders, groupId)
  console.log(`Wrote ${dest}`)
  console.log(`Folders (${folders.length}):`)
  for (const f of folders) console.log(`  - ${f.name}: ${f.path}`)
  console.log('\nOpen this .code-workspace in Cursor (Open Workspace from File).')
}

main()
