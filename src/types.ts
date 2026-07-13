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
