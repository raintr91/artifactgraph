/**
 * Shared types for artifactgraph.
 *
 * Mental model (DSL loop):
 * - Product repo git = SSOT — registries/*.json, codegen/templates, specs, skills/docs
 * - MCP = index + protocol only — .artifactgraph/index.db, allowlisted gen, grill/parity remember
 * - MCP does NOT own or rewrite registry SSOT; promote stays in product docs/skills
 * - Cloud LLM = only low-confidence gaps (cloudPromptSlice)
 */

/** One missing / suggested artifact the agent or member should resolve. */
export type GapKind =
  | 'needs-component'
  | 'needs-ui'
  | 'needs-common'
  | 'needs-unit-test'
  | 'needs-e2e'
  /** Alias-oriented: missing testcase YAML / e2e bundle (prefer needs-e2e when registry miss). */
  | 'needs-testcase'
  | 'missing-hashtag'
  | 'missing-codegen-profile'
  | 'registry-miss'
  | 'handoff'
  /** Cross-surface drift: create≠edit validate, null vs '', FE≠BE, … */
  | 'parity-drift'
  /**
   * Action data-scope ≠ screen display data.
   * Screen shows hotel+rooms; btn (any kind) exports/sends/processes order data → warn.
   */
  | 'context-orphan'

export interface Gap {
  kind: GapKind
  /** Human-readable summary (safe to put in a cloud prompt). */
  message: string
  /** Suggested hashtag, e.g. "#needs-component: cell-status:MoStatusChip:label" */
  suggestedTag?: string
  /** Where it was found (spec path, handoff path, bullet line…). */
  source?: string
  severity: 'info' | 'warn' | 'error'
  /** 0–1: high = local MCP can apply without cloud. */
  confidence: number
  /** Machine id for remember / parity (e.g. password.min). */
  id?: string
}

/** How empty values are represented on one surface. */
export type EmptyPolicy = 'null' | 'empty-string' | 'omit' | 'empty-array' | 'unknown'

/**
 * One field observation on one surface (create / edit / api.update / …).
 * Produced by local scan of legacy.fields OR by cloud archaeology (same schema).
 */
export interface ParityObservation {
  surface: string
  required?: boolean
  type?: string
  empty?: EmptyPolicy
  /** Fingerprintable rules: min, max, regex, email, … */
  rules?: Record<string, unknown>
  source?: string
}

/** Structured finding — cloud MUST return this shape in the same archaeology turn. */
export interface ParityFinding {
  id: string
  field: string
  surfaces: string[]
  observed: ParityObservation[]
  severity?: 'info' | 'warn' | 'error'
  /** Optional A/B/C options; local synthesizes defaults if missing. */
  options?: Array<{ choice: 'A' | 'B' | 'C'; label: string; canon?: Record<string, unknown> }>
  askUser?: string
}

/**
 * Screen shows dataset A (primary + related visible on UI).
 * Action uses dataset B — if B ⊄ A → context-orphan (independent of btn label).
 */
export interface ContextOrphanFinding {
  id: string
  hostSurface: string
  /** Data the screen actually displays (primary entity + child/related rows on UI). */
  screenData: string[]
  action: {
    id: string
    label?: string
    kind?: string
    /** Data the action reads/writes/exports/sends — must be subset of screenData when in-scope. */
    usesData: string[]
  }
  reason?: string
  severity?: 'info' | 'warn' | 'error'
  options?: Array<{ choice: 'A' | 'B' | 'C'; label: string }>
  askUser?: string
  source?: string
}

/** Result of local analyze (spec path and/or bullet text). */
export interface AnalyzeResult {
  projectId?: string
  repoRoot: string
  specPath?: string
  /** Tags already on the spec (or drafted from bullets). */
  tags: string[]
  /** Draft tags suggested from bullets / registry match — not yet written. */
  draftTags: string[]
  gaps: Gap[]
  /** Short questions for member confirm (grill A/B/C style). */
  askUser: string[]
  /** Compact blob intended for cloud — only unresolved low-confidence gaps. */
  cloudPromptSlice: string
}

/** One DSL lane: which registry/templates/gen keys/tags belong together (documentation for agents). */
export interface DslLane {
  /** Path(s) under product repo — SSOT stays there. */
  registries?: string[]
  templates?: string
  /** Keys in artifactgraph.json commands for local gen. */
  genKeys: string[]
  /** Standard needs-* / phase tags agents should prefer. */
  needsTags?: string[]
  /** Short note for status / cloudPromptSlice. */
  note?: string
}

/**
 * Optional map of lanes (fe / be / unit / e2e / docs).
 * Does not store registry payloads — only pointers + gen keys for MCP index/protocol.
 */
export interface DslManifest {
  /** Always product-repo: registries + hbs live outside this MCP package. */
  ssot: 'product-repo'
  lanes: Record<string, DslLane>
}

/** @deprecated Legacy external hub ids; standalone runtime does not resolve them. */
export interface ArtifactgraphHubs {
  docs?: string
  tests?: string
}

/**
 * Project-relative lexicon paths for MCP suggest — NOT registry SSOT.
 * Init writes these under artifactgraph/lexicon/.
 */
export interface ArtifactgraphVocabularies {
  /** R2.1 — UI/API/mark DSL tag lexicon */
  registryTags?: string
  /** R3.1 — E2E taxonomy lexicon */
  testTaxonomy?: string
}

/** artifactgraph.json living in a product repo (brownfield wire). */
export interface ArtifactgraphConfig {
  version?: number
  stack: string
  mode: 'brownfield' | 'greenfield'
  projectId?: string
  commands: Record<string, string[]>
  registries: string[]
  gapSources?: string[]
  specRoots?: string[]
  /** @deprecated Standalone runtime ignores external hubs. */
  hubs?: ArtifactgraphHubs
  /** Lexicon file paths for suggest_tags / draftTags (local index). */
  vocabularies?: ArtifactgraphVocabularies
  templates?: { root: string; engine: string }
  /** Lane index metadata — optional; MCP rebuild still reads `registries[]`. */
  dsl?: DslManifest
}

/** Skill allowlist for one harness sync profile (full | shared | docs | tests | tooling). */
export interface PlatformHarnessProfile {
  groups?: string[]
  skills?: string[]
  note?: string
}

export interface PlatformHarnessSyncPolicy {
  /** propose = report drift only; never wipe other lanes blindly */
  mode?: 'propose' | 'apply'
  description?: string
}

export interface PlatformHarness {
  defaultByRole?: Record<string, string>
  profiles?: Record<string, PlatformHarnessProfile>
  syncPolicy?: PlatformHarnessSyncPolicy
}

export interface PlatformProject {
  root: string
  role: string
  stack: string
  repo: string
  description?: string
  /** Override harness.defaultByRole — full | shared | docs | tests | tooling */
  harnessProfile?: string
}

export interface PlatformReposMap {
  workspaceRoot: string
  defaultGroup: string
  harness?: PlatformHarness
  projects: Record<string, PlatformProject>
}
