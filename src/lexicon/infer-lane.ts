/**
 * Infer suggest/analyze lane from artifactgraph.json stack + dsl.lanes.
 */

import type { ArtifactgraphConfig } from '../types.js'
import type { SuggestLane } from './load-lexicon.js'

const FE_STACKS = new Set(['nuxt4', 'nextjs', 'nuxt4-nest', 'nextjs-nest', 'dotnet-line'])
const BE_STACKS = new Set(['laravel', 'fastapi', 'dotnet-integration'])

/** Product repo primarily FE (design/common registries). */
export function isFeStack(cfg: ArtifactgraphConfig): boolean {
  if (cfg.dsl?.lanes?.fe) return true
  if (cfg.dsl?.lanes?.be && !cfg.dsl?.lanes?.fe) return false
  return FE_STACKS.has(cfg.stack)
}

/** Product repo primarily BE (codegen registry). True if dsl.lanes.be present (incl. fullstack). */
export function isBeStack(cfg: ArtifactgraphConfig): boolean {
  if (cfg.dsl?.lanes?.be) return true
  if (cfg.dsl?.lanes?.fe && !cfg.dsl?.lanes?.be) return false
  return BE_STACKS.has(cfg.stack)
}

/** Default suggest_tags lane — fullstack (fe+be) defaults to fe; pass lane=be explicitly for API. */
export function inferSuggestLane(cfg: ArtifactgraphConfig): SuggestLane {
  if (isBeStack(cfg) && !isFeStack(cfg)) return 'be'
  return 'fe'
}
