/**
 * MCP tool registrations.
 *
 * Tool naming: artifactgraph_<verb> — mirrors CodeGraph style.
 * Each handler: resolve project → load config → local work → JSON text result.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../config/platform-repos.js'
import { loadRepoConfig, requireRepoConfig, writeBrownfieldConfig } from '../config/load-config.js'
import { IndexStore } from '../db/index-store.js'
import { loadRegistries, indexRegistries } from '../registry/load-registries.js'
import { analyzeSpecFile } from '../analyze/analyze-spec.js'
import { analyzeBullets } from '../analyze/analyze-bullets.js'
import { grillCheck, recordGrillDecision } from '../analyze/grill-check.js'
import { runAllowlistedCommand } from '../gen/run-command.js'
import { loadPlatformReposMap } from '../config/platform-repos.js'

function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

/** Register all tools on the server. */
export function registerTools(server: McpServer): void {
  /** List platform-bases projects from this package's platform-repos.json. */
  server.tool(
    'artifactgraph_projects',
    'List platform-bases projects (id, stack, root, role) from artifactgraph/platform-repos.json',
    {},
    async () => {
      const map = loadPlatformReposMap()
      return text({
        defaultGroup: map.defaultGroup,
        projects: Object.entries(map.projects).map(([id, p]) => ({
          id,
          ...p,
        })),
      })
    },
  )

  /** Brownfield init: write artifactgraph.json into a product repo. */
  server.tool(
    'artifactgraph_init',
    'Wire brownfield artifactgraph.json into a platform project (does not copy templates)',
    {
      projectId: z.string().describe('e.g. portal, nextjs, fast-api-base'),
      force: z.boolean().optional().describe('Overwrite existing artifactgraph.json'),
    },
    async ({ projectId, force }) => {
      const project = resolveProject(projectId)
      const dest = writeBrownfieldConfig(project.root, {
        stack: project.stack,
        projectId,
        force: force ?? false,
      })
      return text({ ok: true, configPath: dest, root: project.root, stack: project.stack })
    },
  )

  /** Rebuild SQLite index from registries on disk. */
  server.tool(
    'artifactgraph_rebuild',
    'Rebuild .artifactgraph/index.db from product registries (git remains SSOT)',
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const store = new IndexStore(project.root)
      const loaded = loadRegistries(project.root, cfg)
      indexRegistries(store, loaded)
      store.close()
      return text({
        ok: true,
        registries: Object.keys(loaded.byFile),
        designShells: loaded.designShells.length,
        commonIds: loaded.commonIds.length,
      })
    },
  )

  /**
   * Preflight analyze — call BEFORE gen / before loading heavy prototype skill context.
   * Prefer this to dumping registries into the cloud prompt.
   */
  server.tool(
    'artifactgraph_analyze',
    'Local preflight: analyze ir/spec.yaml and/or bullets → gaps, draft tags, cloudPromptSlice',
    {
      projectId: z.string(),
      specPath: z.string().optional().describe('Path to ir/spec.yaml (relative to repo or absolute)'),
      bullets: z.string().optional().describe('Free-text bullets when IR does not exist yet'),
    },
    async ({ projectId, specPath, bullets }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const store = new IndexStore(project.root)
      let result
      if (specPath) result = analyzeSpecFile(project.root, cfg, specPath, store)
      else if (bullets) result = analyzeBullets(project.root, cfg, bullets, store)
      else {
        store.close()
        throw new Error('Provide specPath and/or bullets')
      }
      store.close()
      return text(result)
    },
  )

  /** Alias-style tool for grill phase confirm prompts. */
  server.tool(
    'artifactgraph_grill_check',
    'Grill helper: missing hashtags / needs-* candidates + A/B/C askUser prompts',
    {
      projectId: z.string(),
      specPath: z.string().optional(),
      bullets: z.string().optional(),
    },
    async ({ projectId, specPath, bullets }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const store = new IndexStore(project.root)
      const result = grillCheck({
        repoRoot: project.root,
        cfg,
        specPath,
        bullets,
        store,
      })
      store.close()
      return text(result)
    },
  )

  /** Persist grill confirm into SQLite (local memory with schema). */
  server.tool(
    'artifactgraph_remember',
    'Store a grill confirm decision in SQLite so later bullet analyze can skip cloud',
    {
      projectId: z.string(),
      subject: z.string().describe('e.g. column:status or entity:hotel'),
      choice: z.enum(['A', 'B', 'C']),
      payloadJson: z.string().optional().describe('Extra JSON object as string'),
    },
    async ({ projectId, subject, choice, payloadJson }) => {
      const project = resolveProject(projectId)
      const store = new IndexStore(project.root)
      const payload = payloadJson ? JSON.parse(payloadJson) : {}
      recordGrillDecision(store, subject, choice, payload)
      store.close()
      return text({ ok: true, subject, choice })
    },
  )

  /** Run allowlisted gen/registry command only. */
  server.tool(
    'artifactgraph_gen',
    'Run an allowlisted command from artifactgraph.json (genDry, gen, registryValidate, …)',
    {
      projectId: z.string(),
      commandKey: z.string().describe('Key in artifactgraph.json commands'),
      spec: z.string().optional().describe('Substituted for {spec}'),
    },
    async ({ projectId, commandKey, spec }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const result = runAllowlistedCommand(project.root, cfg, commandKey, {
        spec: spec ?? '',
      })
      return text(result)
    },
  )

  /** Convenience: gaps-only view from analyze. */
  server.tool(
    'artifactgraph_gaps',
    'Same as analyze but returns only gaps[] + cloudPromptSlice (token-friendly)',
    {
      projectId: z.string(),
      specPath: z.string().optional(),
      bullets: z.string().optional(),
    },
    async ({ projectId, specPath, bullets }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const store = new IndexStore(project.root)
      const full = specPath
        ? analyzeSpecFile(project.root, cfg, specPath, store)
        : analyzeBullets(project.root, cfg, bullets ?? '', store)
      store.close()
      return text({
        gaps: full.gaps,
        askUser: full.askUser,
        draftTags: full.draftTags,
        cloudPromptSlice: full.cloudPromptSlice,
      })
    },
  )

  /** Show config + whether product is wired. */
  server.tool(
    'artifactgraph_status',
    'Show project root, stack, whether artifactgraph.json exists, command keys',
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = resolveProject(projectId)
      const cfg = loadRepoConfig(project.root)
      return text({
        project,
        wired: Boolean(cfg),
        config: cfg,
      })
    },
  )
}
