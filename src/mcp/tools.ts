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
import { loadRegistries, indexRegistries, registryIndexSummary } from '../registry/load-registries.js'
import { analyzeSpecFile } from '../analyze/analyze-spec.js'
import { analyzeBullets } from '../analyze/analyze-bullets.js'
import { grillCheck, recordGrillDecision } from '../analyze/grill-check.js'
import { parityCheck, recordParityDecision } from '../analyze/parity-check.js'
import { runAllowlistedCommand } from '../gen/run-command.js'
import { loadPlatformReposMap, resolveHarnessProfile } from '../config/platform-repos.js'
import {
  pathResolutionSummary,
  resolveGapSourceFiles,
  resolveSpecPath,
} from '../config/resolve-paths.js'
import { indexLexicons, suggestTags } from '../lexicon/load-lexicon.js'

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
    'List platform-bases projects (id, stack, root, role, harnessProfile) from artifactgraph/platform-repos.json',
    {},
    async () => {
      const map = loadPlatformReposMap()
      return text({
        defaultGroup: map.defaultGroup,
        harness: map.harness,
        projects: Object.entries(map.projects).map(([id, p]) => ({
          id,
          ...p,
          harnessProfile: resolveHarnessProfile(id, map),
        })),
      })
    },
  )

  /** Brownfield: write artifactgraph.json into a product repo (CLI: init-project). */
  server.tool(
    'artifactgraph_init',
    'Wire brownfield artifactgraph.json into a platform project (CLI: artifactgraph init-project; agents use CLI init)',
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

  /** Rebuild SQLite index from registries on disk (SSOT = product git; MCP = index only). */
  server.tool(
    'artifactgraph_rebuild',
    'Rebuild .artifactgraph/index.db from product registries/*.json (git remains SSOT; MCP never owns registry files)',
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const store = new IndexStore(project.root)
      const loaded = loadRegistries(project.root, cfg)
      indexRegistries(store, loaded)
      const lexicon = indexLexicons(store, project.root, cfg)
      const summary = { ...registryIndexSummary(loaded), ...lexicon }
      store.setMeta('indexSummary', JSON.stringify(summary))
      store.setMeta('rebuiltAt', new Date().toISOString())
      store.close()
      return text({
        ok: true,
        ssot: 'product-repo',
        registries: Object.keys(loaded.byFile),
        index: summary,
        paths: pathResolutionSummary(project.root, cfg),
        dsl: cfg.dsl ?? null,
        commandKeys: Object.keys(cfg.commands),
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
      if (specPath) {
        const resolved = resolveSpecPath(project.root, cfg, specPath)
        result = analyzeSpecFile(project.root, cfg, resolved, store)
      } else if (bullets) result = analyzeBullets(project.root, cfg, bullets, store)
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
      const resolvedSpec = specPath ? resolveSpecPath(project.root, cfg, specPath) : undefined
      const result = grillCheck({
        repoRoot: project.root,
        cfg,
        specPath: resolvedSpec,
        bullets,
        store,
      })
      store.close()
      return text(result)
    },
  )

  /**
   * Cross-surface parity (create≠edit validate, null vs '', FE≠BE).
   * Prefer after /legacy-spec archaeology — before grill rounds.
   */
  server.tool(
    'artifactgraph_parity_check',
    'Local parity: scan module legacy.fields and/or ingest parityFindings → parity-drift + askUser',
    {
      projectId: z.string(),
      moduleDir: z
        .string()
        .optional()
        .describe('Module path with bundles / _legacy.trace.yaml (relative to repo)'),
      findingsPath: z.string().optional().describe('YAML/JSON with parityFindings[] from cloud'),
      findingsJson: z.string().optional().describe('Inline JSON: { parityFindings: [...] }'),
    },
    async ({ projectId, moduleDir, findingsPath, findingsJson }) => {
      if (!moduleDir && !findingsPath && !findingsJson) {
        throw new Error('Provide moduleDir and/or findingsPath / findingsJson')
      }
      const project = resolveProject(projectId)
      const store = new IndexStore(project.root)
      const result = parityCheck({
        repoRoot: project.root,
        projectId,
        moduleDir,
        findingsPath,
        findingsJson,
        store,
      })
      store.close()
      return text(result)
    },
  )

  /** Persist grill or parity confirm into SQLite. */
  server.tool(
    'artifactgraph_remember',
    'Store grill or parity confirm in SQLite so later analyze can skip cloud / re-ask',
    {
      projectId: z.string(),
      subject: z.string().describe('e.g. column:status or password.min (parity id)'),
      choice: z.enum(['A', 'B', 'C']),
      kind: z
        .enum(['grill', 'parity'])
        .optional()
        .describe('Default grill; use parity for parity-drift confirms'),
      payloadJson: z.string().optional().describe('Extra JSON object as string'),
    },
    async ({ projectId, subject, choice, kind, payloadJson }) => {
      const project = resolveProject(projectId)
      const store = new IndexStore(project.root)
      const payload = payloadJson ? JSON.parse(payloadJson) : {}
      if (kind === 'parity') recordParityDecision(store, subject, choice, payload)
      else recordGrillDecision(store, subject, choice, payload)
      store.close()
      return text({ ok: true, subject, choice, kind: kind ?? 'grill' })
    },
  )

  /** Run allowlisted gen/registry command only. */
  server.tool(
    'artifactgraph_gen',
    'Run allowlisted DSL gen from artifactgraph.json (docsRender, specSplit, gen, unitGen, testcaseGen, …). Registry promote stays in product repo.',
    {
      projectId: z.string(),
      commandKey: z.string().describe('Key in artifactgraph.json commands'),
      spec: z.string().optional().describe('Substituted for {spec} (bundle path, ir/spec, or testcase path)'),
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
        ? analyzeSpecFile(project.root, cfg, resolveSpecPath(project.root, cfg, specPath), store)
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

  /**
   * Local lexicon suggest — R2.1 (fe/docs/be) draftTags or R3.1 (plans) taxonomy enums.
   * Never dumps full vocabulary into cloudPromptSlice.
   */
  server.tool(
    'artifactgraph_suggest_tags',
    'Suggest draftTags / taxonomy enums from hub lexicons (lane=fe|docs|be|plans). Local-first.',
    {
      projectId: z.string(),
      lane: z.enum(['fe', 'docs', 'plans', 'be']).describe('fe/docs → registry-tags (UI); be → API tags; plans → testcase-taxonomy'),
      bullets: z.string().optional().describe('Free-text for keyword match'),
      limit: z.number().optional().describe('Max draft tags / matches (default 12)'),
    },
    async ({ projectId, lane, bullets, limit }) => {
      const project = resolveProject(projectId)
      const cfg = requireRepoConfig(project.root)
      const result = suggestTags({
        repoRoot: project.root,
        cfg,
        lane,
        bullets: bullets ?? '',
        limit,
      })
      return text(result)
    },
  )

  /** Show config + DSL lanes + whether product is wired. */
  server.tool(
    'artifactgraph_status',
    'Show project root, stack, dsl lanes, command keys; registries SSOT = product repo paths',
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = resolveProject(projectId)
      const cfg = loadRepoConfig(project.root)
      let index: Record<string, number> | null = null
      let rebuiltAt: string | null = null
      if (cfg) {
        try {
          const store = new IndexStore(project.root)
          rebuiltAt = store.getMeta('rebuiltAt') ?? null
          const raw = store.getMeta('indexSummary')
          index = raw ? (JSON.parse(raw) as Record<string, number>) : null
          store.close()
        } catch {
          /* index optional */
        }
      }
      const paths = cfg ? pathResolutionSummary(project.root, cfg) : null
      const gapFiles = cfg ? resolveGapSourceFiles(project.root, cfg).slice(0, 30) : []
      return text({
        project,
        wired: Boolean(cfg),
        ssot: {
          registries: cfg?.registries ?? [],
          templates: cfg?.templates ?? null,
          note: 'Registries + hbs live in product repo; lexicons on hubs; MCP only indexes + runs allowlisted gen',
        },
        paths,
        gapSourceSample: gapFiles,
        vocabularies: cfg?.vocabularies ?? null,
        dsl: cfg?.dsl ?? null,
        commandKeys: cfg ? Object.keys(cfg.commands) : [],
        index,
        rebuiltAt,
      })
    },
  )
}
