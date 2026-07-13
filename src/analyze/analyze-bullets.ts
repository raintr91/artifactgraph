/**
 * Turn user bullet text into draft tags + gaps WITHOUT calling the cloud.
 *
 * Heuristics only (v0.1):
 * - keywords list/table/form → profile + shell from design registry aliases
 * - "status chip" / known aliases → ui or needs-ui
 * - Prior decisions in SQLite raise confidence
 *
 * Output is a draft — writing YAML is a later apply step (after member confirm).
 */

import type { AnalyzeResult, ArtifactgraphConfig, Gap } from '../types.js'
import { loadRegistries } from '../registry/load-registries.js'
import type { IndexStore } from '../db/index-store.js'

/**
 * @param bullets Free-text lines from the user (BA/dev), not full IR yet
 */
export function analyzeBullets(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  bullets: string,
  store?: IndexStore,
): AnalyzeResult {
  const text = bullets.toLowerCase()
  const regs = loadRegistries(repoRoot, cfg)
  const draftTags: string[] = []
  const gaps: Gap[] = []
  const askUser: string[] = []

  let profile: 'list' | 'create' | 'detail' | 'unknown' = 'unknown'
  if (/(list|table|search|filter|danh sách|bảng)/i.test(bullets)) profile = 'list'
  else if (/(create|form|new|tạo|form nhập)/i.test(bullets)) profile = 'create'
  else if (/(detail|show|chi tiết)/i.test(bullets)) profile = 'detail'

  if (profile === 'list') {
    draftTags.push('#shell: DataListPage', '#pattern: CRUD', '#style: shadcn/ui')
  } else if (profile === 'create') {
    draftTags.push('#shell: DataFormPage', '#pattern: CRUD', '#style: shadcn/ui')
  }

  for (const [alias, canonical] of Object.entries(regs.aliasToCanonical)) {
    if (alias.length < 4) continue
    if (text.includes(alias)) {
      if (regs.designShells.includes(canonical)) {
        draftTags.push(`#shell: ${canonical}`)
      } else {
        draftTags.push(`#ui: ${canonical}`)
      }
    }
  }

  if (/(status|trạng thái).*(chip|badge|tag)/i.test(bullets)) {
    const tag = '#needs-component: cell-status:MoStatusChip:label'
    const remembered = store?.findDecisions('column:status') ?? []
    const confidence = remembered.length ? 0.92 : 0.75
    draftTags.push(tag)
    gaps.push({
      kind: 'needs-component',
      message: 'Bullets mention status chip — draft needs-component',
      suggestedTag: tag,
      severity: 'warn',
      confidence,
    })
    if (confidence < 0.85) {
      askUser.push(`[GRILL-MARK] Status column: A) plain text  B) ${tag}  C) defer`)
    }
  }

  if (profile === 'unknown') {
    gaps.push({
      kind: 'missing-codegen-profile',
      message: 'Could not infer list/create/detail from bullets — need clarifying question or cloud',
      severity: 'error',
      confidence: 0.4,
    })
    askUser.push('Profile? list | create | detail | other')
  }

  const uniqueDraft = [...new Set(draftTags)]

  const cloudPromptSlice = [
    '## bullet analyze (local)',
    `inferred profile: ${profile}`,
    `draft tags: ${uniqueDraft.join(', ') || '(none)'}`,
    ...gaps.filter((g) => g.confidence < 0.8).map((g) => `- ${g.message}`),
    '',
    '### user bullets',
    bullets.trim().slice(0, 2000),
  ].join('\n')

  return {
    projectId: cfg.projectId,
    repoRoot,
    tags: [],
    draftTags: uniqueDraft,
    gaps,
    askUser,
    cloudPromptSlice,
  }
}
