/**
 * Grill-oriented check: surfaces askUser prompts for missing hashtags / commons.
 * Thin wrapper so MCP tool names match the product vocabulary (/dev-grill-docs).
 *
 * Extended (API Reuse): detects duplicate URI paths across product surfaces.
 * When a spec's path already exists in another surface without #reuse-api,
 * emits a `duplicate-api-route` gap with suggestedTag: '#reuse-api'.
 * The agent adds the tag — no A/B/C gate needed.
 */

import { existsSync } from 'node:fs'
import type { AnalyzeResult, ArtifactgraphConfig, Gap } from '../types.js'
import { analyzeSpecFile } from './analyze-spec.js'
import { analyzeBullets } from './analyze-bullets.js'
import { parseSpecFile, loadAllApiRoutes, detectDuplicateRoutes } from './api-routes.js'
import { resolveSpecPath } from '../config/resolve-paths.js'
import type { IndexStore } from '../db/index-store.js'

export interface GrillCheckInput {
  repoRoot: string
  cfg: ArtifactgraphConfig
  /** Existing IR spec — preferred when past /dev-grill. */
  specPath?: string
  /** Raw bullets — for early BA/dev notes before IR exists. */
  bullets?: string
  store?: IndexStore
}

/**
 * Returns analyze result focused on confirm questions (A/B/C).
 * Appends duplicate-api-route gaps when a spec defines paths that already
 * exist in other surfaces and lack a #reuse-api tag.
 * The suggested resolution is always: add #reuse-api tag.
 */
export function grillCheck(input: GrillCheckInput): AnalyzeResult {
  let base: AnalyzeResult
  if (input.specPath) {
    base = analyzeSpecFile(input.repoRoot, input.cfg, input.specPath, input.store)
  } else if (input.bullets?.trim()) {
    base = analyzeBullets(input.repoRoot, input.cfg, input.bullets, input.store)
  } else {
    throw new Error('grill_check requires specPath or bullets')
  }

  // --- Duplicate route detection (only when specPath provided + store available) ---
  if (input.specPath && input.store) {
    const duplicateGaps = checkDuplicateRoutes(
      input.repoRoot,
      input.cfg,
      input.specPath,
      base.tags,
      input.store,
    )
    if (duplicateGaps.length > 0) {
      base.gaps.push(...duplicateGaps)
      // Suggest #reuse-api as draft tag so agent can auto-apply
      if (!base.draftTags.includes('#reuse-api')) {
        base.draftTags.push('#reuse-api')
      }
      base.cloudPromptSlice =
        base.cloudPromptSlice +
        '\n\n## duplicate-api-route (apply #reuse-api to resolve)\n' +
        duplicateGaps.map((g) => `- ${g.message}`).join('\n')
    }
  }

  return base
}

/**
 * Check the current spec file's routes against the indexed API routes.
 * Returns gap list — suggestedTag '#reuse-api' on each.
 * No askUser / A/B/C: the resolution is simply adding #reuse-api to the spec.
 */
function checkDuplicateRoutes(
  repoRoot: string,
  cfg: ArtifactgraphConfig,
  specPath: string,
  existingTags: string[],
  store: IndexStore,
): Gap[] {
  // Already marked as reuse → nothing to flag
  const hasReuseTag = existingTags.some((t) => t.includes('#reuse-api'))
  if (hasReuseTag) return []

  const abs = resolveSpecPath(repoRoot, cfg, specPath)
  if (!existsSync(abs)) return []

  // Parse routes from the current spec
  const specRoutes = parseSpecFile(abs, repoRoot)
  if (specRoutes.length === 0) return []

  // Load all indexed routes (hybrid: index or on-demand scan)
  const allRoutes = loadAllApiRoutes(store, repoRoot, cfg)

  // Build route set excluding the current spec
  const currentSourceFile = specRoutes[0]?.sourceFile ?? ''
  const otherRoutes = allRoutes.filter((r) => r.sourceFile !== currentSourceFile)

  // Detect conflicts: current spec routes vs all others
  const combined = [...specRoutes, ...otherRoutes]
  const conflicts = detectDuplicateRoutes(combined).filter(
    (c) => c.sources.some((s) => s !== currentSourceFile) && c.sources.includes(currentSourceFile),
  )

  return conflicts.map((conflict) => {
    const otherSources = conflict.sources.filter((s) => s !== currentSourceFile)
    return {
      kind: 'duplicate-api-route' as const,
      message: `DUPLICATE_API_ROUTE: ${conflict.method} ${conflict.path} already defined in ${otherSources.join(', ')} — add #reuse-api to this spec`,
      suggestedTag: '#reuse-api',
      source: abs,
      severity: 'warn' as const,
      confidence: 0.92,
    }
  })
}

/**
 * Persist member confirm so next analyzeBullets can skip cloud.
 */
export function recordGrillDecision(
  store: IndexStore,
  subject: string,
  choice: 'A' | 'B' | 'C',
  payload: Record<string, unknown>,
): void {
  store.rememberDecision('grill-confirm', subject, { choice, ...payload })
}
