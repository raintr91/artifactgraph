/**
 * Context orphan = action data-scope mismatch (NOT "btn is named export/send").
 *
 * Screen displays hotel + rooms (+ other related visible on UI).
 * A button (export / send mail / anything) uses order / campaign / … data
 * that is NOT in that display set → warn member.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ContextOrphanFinding, Gap } from '../types.js'

export function contextOrphanSchemaBlock(): string {
  return [
    '## contextOrphans (same turn — WARN ONLY, no A/B/C)',
    'Warn when action.usesData is NOT a subset of screenData (what the UI shows).',
    'Example: list shows hotel+rooms; action uses order rows → orphan.',
    'NOT about the verb (export/mail); about WHICH DATA the action touches.',
    'Each: id, hostSurface, screenData[], action:{id,label?,kind?,usesData[]}, reason?',
    'Do NOT ask member to unify — surface as warning only (no gate / no remember required).',
    'Skip when usesData ⊆ screenData (incl. related child data shown on the same screen).',
  ].join('\n')
}

export function parseContextOrphansDoc(doc: unknown): ContextOrphanFinding[] {
  if (!doc || typeof doc !== 'object') return []
  const root = doc as Record<string, unknown>
  const list = Array.isArray(root.contextOrphans)
    ? root.contextOrphans
    : Array.isArray(root.orphans)
      ? root.orphans
      : []
  return list.map((item, i) => normalizeOrphan(item, i)).filter(Boolean) as ContextOrphanFinding[]
}

export function scanModuleContextOrphans(repoRoot: string, moduleDir: string): ContextOrphanFinding[] {
  const abs = path.isAbsolute(moduleDir) ? moduleDir : path.join(repoRoot, moduleDir)
  if (!existsSync(abs)) return []
  const out: ContextOrphanFinding[] = []
  for (const file of listYamlFiles(abs)) {
    const doc = parseYaml(readFileSync(file, 'utf8')) as Record<string, unknown>
    out.push(...orphansFromDoc(doc, file))
  }
  return out
}

export function orphanToGap(f: ContextOrphanFinding): Gap {
  return {
    kind: 'context-orphan',
    id: f.id,
    message:
      f.reason ??
      `Action "${f.action.label ?? f.action.id}" usesData=[${f.action.usesData.join(',')}] ` +
        `but screen ${f.hostSurface} displays [${f.screenData.join(',')}]`,
    source: f.source,
    // Cap at warn — orphan is advisory only, never blocks handoff
    severity: f.severity === 'info' ? 'info' : 'warn',
    confidence: 0.88,
  }
}

function normalizeOrphan(raw: unknown, index: number): ContextOrphanFinding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const actionRaw = o.action
  if (!actionRaw || typeof actionRaw !== 'object') return null
  const action = actionRaw as Record<string, unknown>
  const hostSurface = String(o.hostSurface ?? o.surface ?? '').trim()
  const actionId = String(action.id ?? action.name ?? action.label ?? '').trim()
  const screenData = toStrList(o.screenData ?? o.displays ?? o.hostData)
  const usesData = toStrList(
    action.usesData ?? action.data ?? action.operatesOn ?? action.entity ?? action.target,
  )
  if (!hostSurface || !actionId || !screenData.length || !usesData.length) return null
  if (isSubset(usesData, screenData)) return null
  return {
    id: String(o.id ?? `${slug(hostSurface)}.${slug(actionId)}.${index}`),
    hostSurface,
    screenData,
    action: {
      id: actionId,
      label: action.label != null ? String(action.label) : undefined,
      kind: action.kind != null ? String(action.kind) : undefined,
      usesData,
    },
    reason: typeof o.reason === 'string' ? o.reason : undefined,
    severity:
      o.severity === 'info' || o.severity === 'warn' || o.severity === 'error'
        ? o.severity
        : 'warn',
    options: Array.isArray(o.options)
      ? (o.options as ContextOrphanFinding['options'])
      : undefined,
    askUser: typeof o.askUser === 'string' ? o.askUser : undefined,
    source: o.source != null ? String(o.source) : undefined,
  }
}

function orphansFromDoc(doc: Record<string, unknown>, file: string): ContextOrphanFinding[] {
  const screenData = screenDataFromDoc(doc, file)
  if (!screenData.length) return []
  const hostSurface = String(doc.id ?? path.basename(path.dirname(file)))
  const out: ContextOrphanFinding[] = []
  for (const a of extractActions(doc)) {
    if (!a.usesData.length) continue
    if (isSubset(a.usesData, screenData)) continue
    out.push({
      id: `${slug(hostSurface)}.${slug(a.id)}.orphan`,
      hostSurface,
      screenData,
      action: a,
      reason:
        `Action uses [${a.usesData.join(',')}] but screen displays [${screenData.join(',')}]`,
      severity: 'warn',
      source: file,
    })
  }
  return out
}

function screenDataFromDoc(doc: Record<string, unknown>, file: string): string[] {
  const explicit = toStrList(
    (doc.legacy as Record<string, unknown> | undefined)?.screenData ??
      (doc.review as Record<string, unknown> | undefined)?.screenData,
  )
  if (explicit.length) return explicit

  const names: string[] = []
  const spec = doc.spec as Record<string, unknown> | undefined
  for (const raw of Array.isArray(spec?.entities) ? spec.entities : []) {
    if (raw && typeof raw === 'object') {
      const e = raw as Record<string, unknown>
      const n = String(e.name ?? e.id ?? e.key ?? '').trim()
      if (n) names.push(n)
    }
  }
  for (const raw of Array.isArray(spec?.relationships) ? spec.relationships : []) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    for (const k of ['to', 'target', 'entity', 'child', 'name']) {
      if (r[k]) names.push(String(r[k]))
    }
  }
  const gen = doc.gen as Record<string, unknown> | undefined
  const codegen = gen?.codegen as Record<string, unknown> | undefined
  if (codegen?.entity) names.push(String(codegen.entity))
  if (!names.length) {
    const id = String(doc.id ?? path.basename(path.dirname(file)))
    const m = id.match(/^[a-z]+-([a-z0-9]+)/i)
    if (m?.[1]) names.push(m[1])
  }
  return uniqSlugged(names)
}

function extractActions(doc: Record<string, unknown>): Array<{
  id: string
  label?: string
  kind?: string
  usesData: string[]
}> {
  const buckets: unknown[] = []
  const design = doc.design as Record<string, unknown> | undefined
  if (Array.isArray(design?.actions)) buckets.push(...design.actions)
  const legacy = doc.legacy as Record<string, unknown> | undefined
  if (Array.isArray(legacy?.ui)) buckets.push(...legacy.ui)
  if (Array.isArray(legacy?.behaviors)) buckets.push(...legacy.behaviors)
  const out: Array<{ id: string; label?: string; kind?: string; usesData: string[] }> = []
  for (const raw of buckets) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const id = String(o.id ?? o.name ?? o.key ?? o.action ?? o.label ?? '').trim()
    if (!id) continue
    const usesData = toStrList(o.usesData ?? o.data ?? o.operatesOn ?? o.entity ?? o.target)
    if (!usesData.length) continue
    out.push({
      id,
      label: o.label != null ? String(o.label) : undefined,
      kind: o.kind != null ? String(o.kind) : o.type != null ? String(o.type) : undefined,
      usesData,
    })
  }
  return out
}

function isSubset(uses: string[], screen: string[]): boolean {
  const set = new Set(screen.map(slug))
  return uses.every((u) => set.has(slug(u)))
}

function toStrList(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean)
  const s = String(v).trim()
  return s ? [s] : []
}

function uniqSlugged(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const k = slug(n)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function listYamlFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 4) return
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'md') continue
      const p = path.join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p, depth + 1)
      else if (/\.(ya?ml)$/i.test(name) && !name.includes('test.yaml')) out.push(p)
    }
  }
  walk(dir, 0)
  return out
}
