/**
 * Turn user bullet text into draft tags + gaps WITHOUT calling the cloud.
 *
 * Heuristics (local-first):
 * - registries aliasIndex + design shells (FE)
 * - R2.1 registry-tags lexicon keywordHints (lane fe | be from stack)
 * - R3.1 via explicit plans lane (not auto here)
 * - Prior decisions in SQLite raise confidence
 *
 * Output is a draft — writing YAML is a later apply step (after member confirm).
 */

import type { AnalyzeResult, ArtifactgraphConfig, Gap } from '../types.js'
import { loadRegistries } from '../registry/load-registries.js'
import type { IndexStore } from '../db/index-store.js'
import { suggestTags } from '../lexicon/load-lexicon.js'
import { inferSuggestLane, isBeStack, isFeStack } from '../lexicon/infer-lane.js'

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
  const lane = inferSuggestLane(cfg)
  const fe = isFeStack(cfg)
  const be = isBeStack(cfg)

  let profile: 'list' | 'create' | 'detail' | 'unknown' = 'unknown'
  if (/(list|table|search|filter|danh sách|bảng)/i.test(bullets)) profile = 'list'
  else if (/(create|form|new|tạo|form nhập)/i.test(bullets)) profile = 'create'
  else if (/(detail|show|chi tiết)/i.test(bullets)) profile = 'detail'

  const fromLex = suggestTags({ repoRoot, cfg, lane, bullets, limit: 16 })
  if (fromLex.draftTags.length) {
    draftTags.push(...fromLex.draftTags)
  } else if (fe && profile === 'list') {
    draftTags.push('#shell: DataListPage', '#pattern: CRUD', '#style: shadcn/ui')
  } else if (fe && profile === 'create') {
    draftTags.push('#shell: DataFormPage', '#pattern: CRUD', '#style: shadcn/ui')
  } else if (fe && profile === 'detail') {
    draftTags.push('#shell: DataDetailPage', '#pattern: CRUD', '#style: shadcn/ui')
  }

  if (fe) {
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
  }

  if (be) {
    if (/(endpoint|route|controller|api resource)/i.test(bullets) && !draftTags.some((t) => t.includes('#needs-endpoint'))) {
      const tag = '#needs-endpoint'
      draftTags.push(tag)
      gaps.push({
        kind: 'registry-miss',
        message: 'Bullets mention API surface — draft needs-endpoint',
        suggestedTag: tag,
        severity: 'warn',
        confidence: 0.72,
      })
      askUser.push(`[GRILL-MARK] API scope: A) mark ${tag}  B) defer`)
    }
    if (/(dto|request body|response|validator|payload)/i.test(bullets) && !draftTags.some((t) => t.includes('#needs-dto'))) {
      const tag = '#needs-dto'
      draftTags.push(tag)
      gaps.push({
        kind: 'registry-miss',
        message: 'Bullets mention DTO/validation — draft needs-dto',
        suggestedTag: tag,
        severity: 'warn',
        confidence: 0.7,
      })
    }
  }

  if (profile === 'unknown' && !fromLex.draftTags.length) {
    gaps.push({
      kind: 'missing-codegen-profile',
      message: be
        ? 'Could not infer REST action (index/store/show/…) — need clarifying question or cloud'
        : 'Could not infer list/create/detail from bullets — need clarifying question or cloud',
      severity: 'error',
      confidence: 0.4,
    })
    askUser.push(be ? 'REST action? index | store | show | update | destroy | other' : 'Profile? list | create | detail | other')
  }

  const uniqueDraft = [...new Set(draftTags)]

  const cloudPromptSlice = [
    '## bullet analyze (local)',
    `lane: ${lane}`,
    `inferred profile: ${profile}`,
    `draft tags: ${uniqueDraft.join(', ') || '(none)'}`,
    fromLex.sourcePaths.length
      ? `lexicon: ${fromLex.sourcePaths.join(', ')}`
      : 'lexicon: (not configured)',
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
