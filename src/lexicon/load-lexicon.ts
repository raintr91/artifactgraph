/**
 * Parse hub lexicon txt files (R2.1 registry-tags / R3.1 testcase-taxonomy).
 * Local index only — never dump full file into cloudPromptSlice.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { ArtifactgraphConfig } from '../types.js'
import { resolveVocabularyPath } from '../config/resolve-paths.js'
import type { IndexStore } from '../db/index-store.js'

export type SuggestLane = 'fe' | 'docs' | 'plans' | 'be'

export interface RegistryTagsLexicon {
  kind: 'registryTags'
  path: string
  prefixes: string[]
  shellIds: string[]
  /** Lowercase keyword → suggested draft tag (subset). */
  keywordHints: Record<string, string>
  terms: string[]
}

export interface TestTaxonomyLexicon {
  kind: 'testTaxonomy'
  path: string
  types: string[]
  scenarios: string[]
  dimensions: {
    business: string[]
    technical: string[]
    quality: string[]
  }
  terms: string[]
}

export type LoadedLexicon = RegistryTagsLexicon | TestTaxonomyLexicon

export interface SuggestTagsResult {
  lane: SuggestLane
  draftTags: string[]
  enums?: Record<string, string[]>
  matches: Array<{ term: string; tag?: string; score: number }>
  sourcePaths: string[]
  /** Tiny slice for cloud — matches only, not full lexicon */
  cloudPromptSlice: string
}

const DEFAULT_BE_PROFILE_TAGS: Record<string, string[]> = {
  index: ['#api: index', '#pattern: CRUD'],
  store: ['#api: store', '#needs-dto: request'],
  show: ['#api: show', '#needs-dto: response'],
  update: ['#api: update', '#needs-dto: request'],
  destroy: ['#api: destroy'],
}

/** Built-in BE hints when R2.1 section lacks explicit mapping. */
const DEFAULT_BE_KEYWORD_HINTS: Record<string, string> = {
  endpoint: '#needs-endpoint',
  endpoints: '#needs-endpoint',
  'rest api': '#api: rest',
  pagination: '#api: pagination',
  'request body': '#needs-dto: request',
  'response body': '#needs-dto: response',
  dto: '#needs-dto',
  validator: '#needs-dto: request',
  middleware: '#api: middleware',
  resource: '#api: resource',
  controller: '#needs-endpoint',
}

const DEFAULT_PROFILE_TAGS: Record<string, string[]> = {
  list: ['#shell: DataListPage', '#pattern: CRUD', '#style: shadcn/ui'],
  create: ['#shell: DataFormPage', '#pattern: CRUD', '#style: shadcn/ui'],
  detail: ['#shell: DataDetailPage', '#pattern: CRUD', '#style: shadcn/ui'],
}

function stripComments(line: string): string {
  const t = line.trim()
  if (!t || t.startsWith('#') || t.startsWith('=') || t.startsWith('-')) return ''
  return t
}

/** Parse R2.1 registry-tags.en.txt */
export function parseRegistryTagsLexicon(absPath: string): RegistryTagsLexicon {
  const text = readFileSync(absPath, 'utf8')
  const prefixes: string[] = []
  const shellIds: string[] = []
  const keywordHints: Record<string, string> = {}
  const terms: string[] = []

  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('====')) continue
    if (/^[A-J]\.\s/.test(line) || line.startsWith('PREFIXES')) {
      section = line
      continue
    }
    if (line.startsWith('#') && line.includes(':') && !line.startsWith('# ')) {
      // comment examples like #shell: DataListPage inside prose — skip file header `# Registry`
      if (line.startsWith('# Registry') || line.startsWith('# Suggested') || line.startsWith('# Alternatives')) continue
    }
    // prefix lines: #shell:       page...
    const pref = line.match(/^(#[\w*-]+):\s/)
    if (pref && section.includes('PREFIX')) {
      prefixes.push(`${pref[1]}:`)
      continue
    }
    // Canonical shell IDs line
    if (line.includes('DataListPage') && line.includes('·')) {
      for (const id of line.split(/[·|]/).map((s) => s.trim()).filter(Boolean)) {
        if (/^[A-Z][A-Za-z0-9]+$/.test(id)) shellIds.push(id)
      }
      continue
    }
    // Example tags
    const tagEx = line.match(/^(#[\w:-]+(?::[\w|-]+)*)$/)
    if (tagEx) {
      terms.push(tagEx[1]!)
      continue
    }
    if (line.startsWith('#api:') || line.startsWith('#data:') || line.startsWith('#shell:')) {
      terms.push(line.split(/\s/)[0]!)
      continue
    }

    const clean = stripComments(line)
    if (!clean) continue
    // "Status chip / Badge / Pill" style
    const parts = clean.split(/\s*\/\s*|\s·\s/).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      if (p.length < 3 || p.length > 48) continue
      if (/^[A-Z]{2,}-/.test(p)) continue
      terms.push(p)
      const key = p.toLowerCase()
      if (/(status\s*chip|badge|pill)/i.test(p)) {
        keywordHints[key] = '#needs-component: cell-status:MoStatusChip:label'
      } else if (/^CRUD$/i.test(p)) {
        keywordHints[key] = '#pattern: CRUD'
      } else if (/list|index|directory/i.test(p) && section.startsWith('A.')) {
        keywordHints[key] = '#shell: DataListPage'
      } else if (/create|new|form/i.test(p) && section.startsWith('A.')) {
        keywordHints[key] = '#shell: DataFormPage'
      } else if (/detail|show|read-only/i.test(p) && section.startsWith('A.')) {
        keywordHints[key] = '#shell: DataDetailPage'
      } else if (/wizard|stepper/i.test(p)) {
        keywordHints[key] = '#shell: WizardPage'
      } else if (/dashboard|overview/i.test(p)) {
        keywordHints[key] = '#shell: DashboardPage'
      } else if (
        /endpoint|route|controller|resource/i.test(p) &&
        (/API|BE|endpoint/i.test(section) || section.includes('H.'))
      ) {
        keywordHints[key] = '#needs-endpoint'
      } else if (/dto|request|response|payload|validator/i.test(p) && /API|BE|data/i.test(section)) {
        keywordHints[key] = '#needs-dto'
      }
    }
  }

  for (const [k, v] of Object.entries(DEFAULT_BE_KEYWORD_HINTS)) {
    if (!(k in keywordHints)) keywordHints[k] = v
  }

  return {
    kind: 'registryTags',
    path: absPath,
    prefixes: [...new Set(prefixes)],
    shellIds: [...new Set(shellIds)],
    keywordHints,
    terms: [...new Set(terms)].slice(0, 400),
  }
}

/** Parse R3.1 testcase-taxonomy.en.txt */
export function parseTestTaxonomyLexicon(absPath: string): TestTaxonomyLexicon {
  const text = readFileSync(absPath, 'utf8')
  const types: string[] = []
  const scenarios: string[] = []
  const dimensions = { business: [] as string[], technical: [] as string[], quality: [] as string[] }
  const terms: string[] = []

  let section = ''
  let dimKey: keyof typeof dimensions | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('====')) continue
    if (line.startsWith('LEVEL 1')) {
      section = 'LEVEL1'
      dimKey = null
      continue
    }
    if (line.startsWith('MODERN CASE TYPES')) {
      section = 'TYPES'
      dimKey = null
      continue
    }
    if (line.startsWith('THREE FILTER')) {
      section = 'DIMS'
      dimKey = null
      continue
    }
    if (line.startsWith('LEVEL 2') || line.startsWith('LEVEL 3') || line.startsWith('CASE YAML') || line.startsWith('WHERE AUTOMATION') || line.startsWith('ID /')) {
      section = ''
      dimKey = null
      continue
    }
    if (section === 'DIMS') {
      if (line === 'business:' || line === 'technical:' || line === 'quality:') {
        dimKey = line.slice(0, -1) as keyof typeof dimensions
        continue
      }
      const bare = line.split(/\s+#/)[0]!.trim()
      if (dimKey && /^[a-z][\w-]*$/.test(bare)) {
        dimensions[dimKey].push(bare)
        terms.push(bare)
      }
      continue
    }
    if (section === 'TYPES') {
      const m = line.match(/^([a-z][\w-]*)\s{2,}\S/)
      if (m && m[1] !== 'regression') {
        types.push(m[1]!)
        terms.push(m[1]!)
      }
      continue
    }
    if (section === 'LEVEL1') {
      if (/^[A-Z][A-Za-z /]+$/.test(line) && line.length < 40 && !line.includes('Example')) {
        scenarios.push(line)
        terms.push(line)
      }
    }
  }

  return {
    kind: 'testTaxonomy',
    path: absPath,
    types: [...new Set(types)],
    scenarios: [...new Set(scenarios)],
    dimensions: {
      business: [...new Set(dimensions.business)],
      technical: [...new Set(dimensions.technical)],
      quality: [...new Set(dimensions.quality)],
    },
    terms: [...new Set(terms)],
  }
}

export function loadRegistryTagsLexicon(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
): RegistryTagsLexicon | null {
  const abs = resolveVocabularyPath(repoRoot, cfg, 'registryTags')
  if (!abs) return null
  return parseRegistryTagsLexicon(abs)
}

export function loadTestTaxonomyLexicon(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
): TestTaxonomyLexicon | null {
  const abs = resolveVocabularyPath(repoRoot, cfg, 'testTaxonomy')
  if (!abs) return null
  return parseTestTaxonomyLexicon(abs)
}

/** Index lexicons into SQLite under registry namespaces lexicon:*. */
export function indexLexicons(
  store: IndexStore,
  repoRoot: string,
  cfg: ArtifactgraphConfig,
): Record<string, number> {
  const summary: Record<string, number> = {}
  const reg = loadRegistryTagsLexicon(repoRoot, cfg)
  if (reg) {
    store.clearRegistry('lexicon:registryTags')
    store.upsertRegistryEntry('lexicon:registryTags', '_meta', {
      path: reg.path,
      prefixes: reg.prefixes,
      shellIds: reg.shellIds,
      termCount: reg.terms.length,
    })
    let i = 0
    for (const [k, tag] of Object.entries(reg.keywordHints)) {
      store.upsertRegistryEntry('lexicon:registryTags', `hint:${k}`, { tag })
      i++
    }
    summary.registryTagHints = i
    summary.registryTagTerms = reg.terms.length
  }
  const tax = loadTestTaxonomyLexicon(repoRoot, cfg)
  if (tax) {
    store.clearRegistry('lexicon:testTaxonomy')
    store.upsertRegistryEntry('lexicon:testTaxonomy', '_meta', {
      path: tax.path,
      types: tax.types,
      scenarios: tax.scenarios,
      dimensions: tax.dimensions,
    })
    summary.testTypes = tax.types.length
    summary.testScenarios = tax.scenarios.length
  }
  return summary
}

function scoreTerm(haystack: string, term: string): number {
  const t = term.toLowerCase()
  if (t.length < 3) return 0
  if (haystack.includes(t)) return Math.min(1, 0.55 + t.length / 40)
  return 0
}

/**
 * Suggest draft tags / taxonomy enums for a lane (local-first).
 */
export function suggestTags(opts: {
  repoRoot: string
  cfg: ArtifactgraphConfig
  lane: SuggestLane
  bullets?: string
  limit?: number
}): SuggestTagsResult {
  const { repoRoot, cfg, lane } = opts
  const bullets = opts.bullets ?? ''
  const hay = bullets.toLowerCase()
  const limit = opts.limit ?? 12
  const draftTags: string[] = []
  const matches: SuggestTagsResult['matches'] = []
  const sourcePaths: string[] = []
  let enums: Record<string, string[]> | undefined

  if (lane === 'fe' || lane === 'docs') {
    const lex = loadRegistryTagsLexicon(repoRoot, cfg)
    if (lex) {
      sourcePaths.push(lex.path)
      let profile: 'list' | 'create' | 'detail' | null = null
      if (/(list|table|search|filter|danh sách|bảng)/i.test(bullets)) profile = 'list'
      else if (/(create|form|new|tạo|form nhập)/i.test(bullets)) profile = 'create'
      else if (/(detail|show|chi tiết)/i.test(bullets)) profile = 'detail'
      if (profile) draftTags.push(...(DEFAULT_PROFILE_TAGS[profile] ?? []))

      for (const [term, tag] of Object.entries(lex.keywordHints)) {
        if (tag.startsWith('#needs-endpoint') || tag.startsWith('#needs-dto') || tag.startsWith('#api:')) continue
        const s = scoreTerm(hay, term)
        if (s > 0) {
          matches.push({ term, tag, score: s })
          draftTags.push(tag)
        }
      }
      for (const id of lex.shellIds) {
        const s = scoreTerm(hay, id)
        if (s > 0) {
          matches.push({ term: id, tag: `#shell: ${id}`, score: s })
          draftTags.push(`#shell: ${id}`)
        }
      }
      for (const term of lex.terms) {
        if (term.startsWith('#api:') || term.startsWith('#needs-')) continue
        const s = scoreTerm(hay, term)
        if (s >= 0.7) matches.push({ term, score: s })
      }
    }
  }

  if (lane === 'be') {
    const lex = loadRegistryTagsLexicon(repoRoot, cfg)
    if (lex) sourcePaths.push(lex.path)

    let beProfile: keyof typeof DEFAULT_BE_PROFILE_TAGS | null = null
    if (/(index|list|collection|danh sách)/i.test(bullets)) beProfile = 'index'
    else if (/(store|create|post|tạo mới)/i.test(bullets)) beProfile = 'store'
    else if (/(show|get by id|chi tiết|detail)/i.test(bullets)) beProfile = 'show'
    else if (/(update|put|patch|cập nhật)/i.test(bullets)) beProfile = 'update'
    else if (/(destroy|delete|xóa)/i.test(bullets)) beProfile = 'destroy'
    if (beProfile) draftTags.push(...(DEFAULT_BE_PROFILE_TAGS[beProfile] ?? []))

    const hints = lex?.keywordHints ?? DEFAULT_BE_KEYWORD_HINTS
    for (const [term, tag] of Object.entries(hints)) {
      const beTag =
        tag.startsWith('#needs-endpoint') ||
        tag.startsWith('#needs-dto') ||
        tag.startsWith('#api:') ||
        tag.startsWith('#data:') ||
        tag.startsWith('#pattern:')
      if (!beTag && lex) continue
      const s = scoreTerm(hay, term)
      if (s > 0) {
        matches.push({ term, tag, score: s })
        draftTags.push(tag)
      }
    }
    if (lex) {
      for (const term of lex.terms) {
        if (!term.startsWith('#api:') && !term.startsWith('#needs-') && !term.startsWith('#data:')) continue
        const s = scoreTerm(hay, term.replace(/^#/, '').replace(':', ' '))
        if (s >= 0.55) {
          matches.push({ term, tag: term, score: s })
          draftTags.push(term)
        }
      }
    }

    const needsFromDsl = cfg.dsl?.lanes?.be?.needsTags ?? []
    for (const tag of needsFromDsl) {
      const key = tag.replace(/^#needs-/, '').split(':')[0] ?? ''
      if (key && scoreTerm(hay, key.replace(/-/g, ' ')) > 0) draftTags.push(tag)
    }
  }

  if (lane === 'plans') {
    const tax = loadTestTaxonomyLexicon(repoRoot, cfg)
    if (tax) {
      sourcePaths.push(tax.path)
      enums = {
        type: tax.types,
        'dimensions.business': tax.dimensions.business,
        'dimensions.technical': tax.dimensions.technical,
        'dimensions.quality': tax.dimensions.quality,
        scenario: tax.scenarios,
      }
      for (const t of tax.types) {
        const s = scoreTerm(hay, t.replace(/-/g, ' '))
        if (s > 0 || hay.includes(t)) {
          matches.push({ term: t, tag: `type:${t}`, score: Math.max(s, 0.6) })
          draftTags.push(`type:${t}`)
        }
      }
      for (const dim of ['business', 'technical', 'quality'] as const) {
        for (const v of tax.dimensions[dim]) {
          const s = scoreTerm(hay, v.replace(/-/g, ' '))
          if (s > 0) {
            matches.push({ term: v, tag: `dimensions.${dim}:${v}`, score: s })
            draftTags.push(`dimensions.${dim}:${v}`)
          }
        }
      }
      for (const sc of tax.scenarios) {
        const s = scoreTerm(hay, sc)
        if (s > 0) {
          matches.push({ term: sc, tag: `scenario:${sc}`, score: s })
          draftTags.push(`scenario:${sc}`)
        }
      }
    }
  }

  matches.sort((a, b) => b.score - a.score)
  const topMatches = matches.slice(0, limit)
  const uniqueDraft = [...new Set(draftTags)].slice(0, limit)

  const cloudPromptSlice = [
    `## suggest_tags lane=${lane} (local lexicon)`,
    `draft: ${uniqueDraft.join(', ') || '(none)'}`,
    ...topMatches.slice(0, 8).map((m) => `- ${m.term}${m.tag ? ` → ${m.tag}` : ''} (${m.score.toFixed(2)})`),
  ].join('\n')

  return {
    lane,
    draftTags: uniqueDraft,
    enums,
    matches: topMatches,
    sourcePaths,
    cloudPromptSlice,
  }
}
