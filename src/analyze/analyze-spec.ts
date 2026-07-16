/**
 * Analyze an existing ir/spec.yaml (or any YAML with tags/codegen).
 *
 * Local-first: compare tags + codegen block against registries → Gap[].
 * High-confidence gaps can be fixed without cloud; low-confidence go into cloudPromptSlice.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { AnalyzeResult, ArtifactgraphConfig, Gap } from '../types.js'
import { loadRegistries } from '../registry/load-registries.js'
import { resolveSpecPath } from '../config/resolve-paths.js'
import type { IndexStore } from '../db/index-store.js'
import { parityCloudSchemaBlock } from './parity-check.js'
import { isBeStack, isFeStack } from '../lexicon/infer-lane.js'

interface SpecDoc {
  tags?: string[]
  specOrigin?: string
  codegen?: { profile?: string; entity?: string; module?: string }
  marks?: Array<{ kind?: string; tag?: string }>
  ui?: { columns?: Array<{ key?: string; component?: string }> }
}

function asTags(doc: SpecDoc): string[] {
  const tags = [...(doc.tags ?? [])]
  for (const m of doc.marks ?? []) {
    if (m.tag) tags.push(m.tag)
  }
  return tags.map((t) => t.trim())
}

function hasPrefix(tags: string[], prefix: string): boolean {
  return tags.some((t) => t.replace(/\s+/g, ' ').startsWith(prefix))
}

/**
 * Core analyzer for a single spec file.
 */
export function analyzeSpecFile(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  specPath: string,
  store?: IndexStore,
): AnalyzeResult {
  const abs = resolveSpecPath(repoRoot, cfg, specPath)
  if (!existsSync(abs)) {
    throw new Error(`Spec not found: ${abs}`)
  }
  const doc = parseYaml(readFileSync(abs, 'utf8')) as SpecDoc
  const tags = asTags(doc)
  const regs = loadRegistries(repoRoot, cfg)
  const gaps: Gap[] = []
  const askUser: string[] = []

  const fe = isFeStack(cfg)
  const be = isBeStack(cfg)

  // --- codegen readiness ---
  if (!doc.codegen?.profile) {
    gaps.push({
      kind: 'missing-codegen-profile',
      message: 'Missing codegen.profile — stack gen will refuse.',
      source: abs,
      severity: 'error',
      confidence: 0.95,
    })
  }

  const profile = doc.codegen?.profile

  // --- shell / pattern for FE stacks only ---
  if (fe && (profile === 'list' || profile === 'create' || profile === 'edit')) {
    if (!hasPrefix(tags, '#shell:')) {
      const suggested =
        profile === 'list' ? '#shell: DataListPage' : '#shell: DataFormPage'
      gaps.push({
        kind: 'missing-hashtag',
        message: `No #shell: tag for profile=${profile}`,
        suggestedTag: suggested,
        source: abs,
        severity: 'warn',
        confidence: 0.9,
      })
      askUser.push(`[GRILL-MARK] Missing shell for ${profile}. Apply ${suggested}? (B=mark)`)
    }
    if (!hasPrefix(tags, '#pattern:')) {
      gaps.push({
        kind: 'missing-hashtag',
        message: 'No #pattern: tag (usually CRUD)',
        suggestedTag: '#pattern: CRUD',
        source: abs,
        severity: 'info',
        confidence: 0.85,
      })
    }
  }

  // --- columns without component → FE only ---
  if (fe) {
    for (const col of doc.ui?.columns ?? []) {
      if (col.key && !col.component) {
        const tag = `#needs-component: cell-${col.key}:Mo${pascal(col.key)}:label`
        gaps.push({
          kind: 'needs-component',
          message: `Column "${col.key}" has no component — prototype should implement or mark needs-component`,
          suggestedTag: tag,
          source: abs,
          severity: 'warn',
          confidence: 0.7,
        })
        askUser.push(
          `[GRILL-MARK] Column ${col.key}: A) local cell  B) ${tag}  C) defer`,
        )
      }
    }
  }

  // --- BE: endpoint/dto tags when api profile without marks ---
  if (be && profile && !tags.some((t) => t.includes('#needs-endpoint'))) {
    if (/(index|list|store|show|update|destroy|resource|api)/i.test(profile)) {
      gaps.push({
        kind: 'registry-miss',
        message: `BE profile=${profile} with no #needs-endpoint tag`,
        suggestedTag: '#needs-endpoint',
        source: abs,
        severity: 'info',
        confidence: 0.65,
      })
    }
  }

  // --- already tagged needs-* stay visible in inventory ---
  for (const t of tags) {
    if (t.includes('#needs-component')) {
      gaps.push({
        kind: 'needs-component',
        message: `Spec already marks: ${t}`,
        suggestedTag: t,
        source: abs,
        severity: 'info',
        confidence: 1,
      })
    }
    if (t.includes('#needs-ui')) {
      gaps.push({
        kind: 'needs-ui',
        message: `Spec already marks: ${t}`,
        suggestedTag: t,
        source: abs,
        severity: 'info',
        confidence: 1,
      })
    }
    if (t.includes('#needs-common') || t.includes('#needs-unit-test')) {
      gaps.push({
        kind: t.includes('unit') ? 'needs-unit-test' : 'needs-common',
        message: `Spec already marks: ${t}`,
        suggestedTag: t,
        source: abs,
        severity: 'info',
        confidence: 1,
      })
    }
    if (t.includes('#needs-endpoint') || t.includes('#needs-dto')) {
      gaps.push({
        kind: 'registry-miss',
        message: `Spec already marks: ${t}`,
        suggestedTag: t,
        source: abs,
        severity: 'info',
        confidence: 1,
      })
    }
  }

  // --- non-legacy: confirm generated blocks with member (LOCAL, not cloud) ---
  const origin = String(doc.specOrigin ?? '')
  const isLegacy = origin === 'legacy' || abs.includes('_legacy')
  if (!isLegacy && (doc.codegen?.profile || tags.length > 0)) {
    askUser.push(
      '[GRILL-CONFIRM] Blocks/tags đề xuất từ IR (không clone legacy). Member xác nhận đúng trước khi gen? (yes / edit / defer) — local only, không cloud',
    )
    gaps.push({
      kind: 'missing-hashtag',
      message: 'Non-legacy spec: confirm generated blocks/tags with member before gen (local askUser)',
      source: abs,
      severity: 'info',
      confidence: 0.95,
    })
  }

  // --- unit hint (FE list or BE index) ---
  if (
    regs.unitPatterns.length &&
    !tags.some((t) => t.includes('#needs-unit') || t.includes('#unit:'))
  ) {
    const unitProfile = fe && profile === 'list'
    const beIndex = be && profile && /index|list/i.test(profile)
    if (unitProfile || beIndex) {
      gaps.push({
        kind: 'needs-unit-test',
        message: unitProfile
          ? 'List profile with no unit-test tags — consider unit-gen after prototype'
          : 'Index/list API with no unit-test tags — consider unit-gen',
        source: abs,
        severity: 'info',
        confidence: 0.6,
      })
    }
  }

  const unresolved = gaps.filter((g) => g.confidence < 0.8 || g.severity !== 'info')
  let cloudPromptSlice = formatCloudSlice(unresolved, tags)
  if (isLegacy) {
    cloudPromptSlice = `${cloudPromptSlice}\n\n${parityCloudSchemaBlock()}`
  }

  const result: AnalyzeResult = {
    projectId: cfg.projectId,
    repoRoot,
    specPath: abs,
    tags,
    draftTags: [],
    gaps,
    askUser,
    cloudPromptSlice,
  }
  store?.saveGapSnapshot(abs, gaps)
  return result
}

function pascal(s: string): string {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('')
}

/** Compact text for cloud — NEVER dump full registry. */
function formatCloudSlice(gaps: Gap[], tags: string[]): string {
  const lines = [
    '## artifactgraph unresolved (local preflight)',
    `existing tags: ${tags.slice(0, 20).join(', ') || '(none)'}`,
    ...gaps.map((g) => `- [${g.severity}/${g.kind} c=${g.confidence}] ${g.message}${g.suggestedTag ? ` → ${g.suggestedTag}` : ''}`),
  ]
  return lines.join('\n')
}
