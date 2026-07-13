/**
 * Shared types for artifactgraph.
 *
 * Mental model:
 * - Product repo git files = SSOT (spec, registries, templates)
 * - SQLite (.artifactgraph/index.db) = local index for fast analyze / memory of confirms
 * - Cloud LLM = only for low-confidence gaps (this package tries to stay local-first)
 */

/** One missing / suggested artifact the agent or member should resolve. */
export type GapKind =
  | 'needs-component'
  | 'needs-ui'
  | 'needs-common'
  | 'needs-unit-test'
  | 'needs-e2e'
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
  templates?: { root: string; engine: string }
}

export interface PlatformProject {
  root: string
  role: string
  stack: string
  repo: string
  description?: string
}

export interface PlatformReposMap {
  workspaceRoot: string
  defaultGroup: string
  projects: Record<string, PlatformProject>
}
