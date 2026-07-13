/**
 * Grill-oriented check: surfaces askUser prompts for missing hashtags / commons.
 * Thin wrapper so MCP tool names match the product vocabulary (/dev-grill-docs).
 */

import type { AnalyzeResult, ArtifactgraphConfig } from '../types.js'
import { analyzeSpecFile } from './analyze-spec.js'
import { analyzeBullets } from './analyze-bullets.js'
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
 */
export function grillCheck(input: GrillCheckInput): AnalyzeResult {
  if (input.specPath) {
    return analyzeSpecFile(input.repoRoot, input.cfg, input.specPath, input.store)
  }
  if (input.bullets?.trim()) {
    return analyzeBullets(input.repoRoot, input.cfg, input.bullets, input.store)
  }
  throw new Error('grill_check requires specPath or bullets')
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
