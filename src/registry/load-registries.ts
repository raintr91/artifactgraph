/**
 * Load product registries into memory (+ optional IndexStore upsert).
 *
 * Registries live under product `registries/*.json` after the global layout migrate.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ArtifactgraphConfig } from '../types.js'
import type { IndexStore } from '../db/index-store.js'

export interface LoadedRegistries {
  /** basename → parsed JSON */
  byFile: Record<string, unknown>
  /** Flattened design shells / common ids for matching. */
  designShells: string[]
  commonIds: string[]
  unitPatterns: string[]
  e2eBundles: string[]
  aliasToCanonical: Record<string, string>
}

/** Read all configured registry files from a product repo. */
export function loadRegistries(repoRoot: string, cfg: ArtifactgraphConfig): LoadedRegistries {
  const byFile: Record<string, unknown> = {}
  const designShells: string[] = []
  const commonIds: string[] = []
  const unitPatterns: string[] = []
  const e2eBundles: string[] = []
  const aliasToCanonical: Record<string, string> = {}

  for (const rel of cfg.registries ?? []) {
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) continue
    const data = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>
    const base = path.basename(rel)
    byFile[base] = data

    if (base.includes('design')) {
      const shells = (data.shells ?? {}) as Record<string, { aliases?: { informal?: string[] } }>
      for (const [id, shell] of Object.entries(shells)) {
        designShells.push(id)
        aliasToCanonical[id.toLowerCase()] = id
        for (const a of shell.aliases?.informal ?? []) {
          aliasToCanonical[String(a).toLowerCase()] = id
        }
      }
      const aliasIndex = (data.aliasIndex ?? {}) as Record<string, string>
      for (const [k, v] of Object.entries(aliasIndex)) {
        aliasToCanonical[k.toLowerCase()] = v
      }
    }
    if (base.includes('common')) {
      const entries = (data.entries ?? {}) as Record<string, unknown>
      commonIds.push(...Object.keys(entries))
    }
    if (base.includes('unit-test')) {
      const patterns = (data.patterns ?? {}) as Record<string, unknown>
      unitPatterns.push(...Object.keys(patterns))
    }
    if (base.includes('e2e')) {
      const bundles = (data.bundles ?? {}) as Record<string, unknown>
      e2eBundles.push(...Object.keys(bundles))
    }
  }

  return { byFile, designShells, commonIds, unitPatterns, e2eBundles, aliasToCanonical }
}

/** Counts returned to MCP status / rebuild (DSL index summary). */
export function registryIndexSummary(loaded: LoadedRegistries): Record<string, number> {
  return {
    files: Object.keys(loaded.byFile).length,
    designShells: loaded.designShells.length,
    commonIds: loaded.commonIds.length,
    unitPatterns: loaded.unitPatterns.length,
    e2eBundles: loaded.e2eBundles.length,
    aliases: Object.keys(loaded.aliasToCanonical).length,
  }
}

/**
 * Push registry keys into SQLite for later retrieve.
 * Index only — product `registries/*.json` remain SSOT (never written by this MCP).
 */
export function indexRegistries(store: IndexStore, loaded: LoadedRegistries): void {
  for (const [file, data] of Object.entries(loaded.byFile)) {
    store.clearRegistry(file)
    store.upsertRegistryEntry(file, '_root', data)
  }
  store.clearRegistry('design.shells')
  for (const id of loaded.designShells) {
    store.upsertRegistryEntry('design.shells', id, { id })
  }
  store.clearRegistry('common.entries')
  for (const id of loaded.commonIds) {
    store.upsertRegistryEntry('common.entries', id, { id })
  }
  store.clearRegistry('unit.patterns')
  for (const id of loaded.unitPatterns) {
    store.upsertRegistryEntry('unit.patterns', id, { id })
  }
  store.clearRegistry('e2e.bundles')
  for (const id of loaded.e2eBundles) {
    store.upsertRegistryEntry('e2e.bundles', id, { id })
  }
  store.clearRegistry('alias')
  for (const [alias, canonical] of Object.entries(loaded.aliasToCanonical)) {
    store.upsertRegistryEntry('alias', alias, { canonical })
  }
  store.setMeta('rebuiltAt', new Date().toISOString())
  store.setMeta('indexSummary', JSON.stringify(registryIndexSummary(loaded)))
}
