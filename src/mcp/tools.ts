/**
 * MCP tool registrations.
 *
 * Tool naming: artifactgraph_<verb> — mirrors CodeGraph style.
 * Each handler: resolve project → load config → local work → JSON text result.
 */

import { z } from 'zod'
import path from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  loadEffectiveRepoConfig,
  loadRepoConfig,
} from '../config/load-config.js'
import { IndexStore } from '../db/index-store.js'
import { loadRegistries, indexRegistries, registryIndexSummary } from '../registry/load-registries.js'
import { analyzeSpecFile } from '../analyze/analyze-spec.js'
import { analyzeBullets } from '../analyze/analyze-bullets.js'
import { grillCheck, recordGrillDecision } from '../analyze/grill-check.js'
import { parityCheck, recordParityDecision } from '../analyze/parity-check.js'
import {
  inspectAllowlistedCommand,
  runAllowlistedCommand,
} from '../gen/run-command.js'
import { detectStack } from '../config/platform-repos.js'
import {
  pathResolutionSummary,
  resolveGapSourceFiles,
  resolveSpecPath,
} from '../config/resolve-paths.js'
import { indexLexicons, suggestTags } from '../lexicon/load-lexicon.js'
import {
  installProjectAssets,
  projectInstallStatus,
  type InstallType,
} from '../install/project.js'

function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function currentProject() {
  const root = path.resolve(process.env.ARTIFACTGRAPH_PROJECT_ROOT ?? process.cwd())
  const config = loadRepoConfig(root)
  return {
    id: config?.projectId ?? path.basename(root),
    root,
    stack: config?.stack ?? detectStack(root),
    role: 'local',
    repo: path.basename(root),
  }
}

/** Register all tools on the server. */
export function registerTools(server: McpServer): void {
  /** Show the current repository used by this MCP process. */
  server.tool(
    'artifactgraph_projects',
    'Show the current repository (legacy compatibility; product tools use cwd directly)',
    {},
    async () => text({ projects: [currentProject()] }),
  )

  /** Initialize/update ArtifactGraph assets in the current repo. */
  server.tool(
    'artifactgraph_init',
    'Initialize/update config, lexicons, and MCP DNA in the current repository',
    {
      types: z
        .array(z.enum(['common', 'docs', 'fe', 'be', 'test', 'all']))
        .optional()
        .describe('MCP DNA types to install; default common'),
      force: z.boolean().optional().describe('Overwrite existing artifactgraph.json'),
    },
    async ({ types, force }) => {
      const project = currentProject()
      const result = installProjectAssets({
        repoRoot: project.root,
        stack: project.stack,
        types: (types ?? ['common']) as InstallType[],
        force: force ?? false,
      })
      return text({ ok: true, ...result, stack: project.stack })
    },
  )

  /** Rebuild SQLite index from registries on disk (SSOT = product git; MCP = index only). */
  server.tool(
    'artifactgraph_rebuild',
    'Rebuild .artifactgraph/index.db from product registries/*.json (git remains SSOT; MCP never owns registry files)',
    {},
    async () => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
      const store = new IndexStore(project.root)
      let loaded
      let summary
      try {
        const rebuilt = store.transaction(() => {
          const nextLoaded = loadRegistries(project.root, cfg)
          indexRegistries(store, nextLoaded)
          const lexicon = indexLexicons(store, project.root, cfg)
          const nextSummary = { ...registryIndexSummary(nextLoaded), ...lexicon }
          store.setMeta('indexSummary', JSON.stringify(nextSummary))
          store.setMeta('rebuiltAt', new Date().toISOString())
          return { loaded: nextLoaded, summary: nextSummary }
        })
        loaded = rebuilt.loaded
        summary = rebuilt.summary
      } finally {
        store.close()
      }
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
      specPath: z.string().optional().describe('Path to ir/spec.yaml (relative to repo or absolute)'),
      bullets: z.string().optional().describe('Free-text bullets when IR does not exist yet'),
    },
    async ({ specPath, bullets }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
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
      specPath: z.string().optional(),
      bullets: z.string().optional(),
    },
    async ({ specPath, bullets }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
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
      moduleDir: z
        .string()
        .optional()
        .describe('Module path with bundles / _legacy.trace.yaml (relative to repo)'),
      findingsPath: z.string().optional().describe('YAML/JSON with parityFindings[] from cloud'),
      findingsJson: z.string().optional().describe('Inline JSON: { parityFindings: [...] }'),
    },
    async ({ moduleDir, findingsPath, findingsJson }) => {
      if (!moduleDir && !findingsPath && !findingsJson) {
        throw new Error('Provide moduleDir and/or findingsPath / findingsJson')
      }
      const project = currentProject()
      const store = new IndexStore(project.root)
      const result = parityCheck({
        repoRoot: project.root,
        projectId: project.id,
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
      subject: z.string().describe('e.g. column:status or password.min (parity id)'),
      choice: z.enum(['A', 'B', 'C']),
      kind: z
        .enum(['grill', 'parity'])
        .optional()
        .describe('Default grill; use parity for parity-drift confirms'),
      payloadJson: z.string().optional().describe('Extra JSON object as string'),
    },
    async ({ subject, choice, kind, payloadJson }) => {
      const project = currentProject()
      const store = new IndexStore(project.root)
      const payload = payloadJson ? JSON.parse(payloadJson) : {}
      if (kind === 'parity') recordParityDecision(store, subject, choice, payload)
      else recordGrillDecision(store, subject, choice, payload)
      store.close()
      return text({ ok: true, subject, choice, kind: kind ?? 'grill' })
    },
  )

  /** Recommend/materialize an allowlisted command without executing it. */
  server.tool(
    'artifactgraph_recommend_command',
    'Inspect and materialize a product-owned allowlisted command without executing it. Use the owning kit (Docskit/Codegenkit/Testkit) to run.',
    {
      commandKey: z.string().describe('Key in artifactgraph.json commands'),
      spec: z.string().optional().describe('Substituted for {spec}'),
    },
    async ({ commandKey, spec }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
      return text(
        inspectAllowlistedCommand(project.root, cfg, commandKey, {
          spec: spec ?? '',
        }),
      )
    },
  )

  /** Token-light allowlist membership check; never executes. */
  server.tool(
    'artifactgraph_allowlist_check',
    'Check whether a command key is product-allowlisted and report its executable owner; never executes the command.',
    {
      commandKey: z.string(),
    },
    async ({ commandKey }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
      const inspected = inspectAllowlistedCommand(project.root, cfg, commandKey)
      return text({
        ok: inspected.ok,
        commandKey,
        allowlisted: inspected.allowlisted,
        knownKeys: inspected.knownKeys,
        executableOwner: inspected.executableOwner,
        recommendation: inspected.recommendation,
      })
    },
  )

  /**
   * Compatibility shim (2.x): executable command runner.
   * Deprecated; remove in the next major after kits own execution.
   */
  server.tool(
    'artifactgraph_gen',
    'DEPRECATED compatibility shim: executes an allowlisted product command. Prefer artifactgraph_recommend_command/allowlist_check, then run via Docskit/Codegenkit/Testkit.',
    {
      commandKey: z.string().describe('Key in artifactgraph.json commands'),
      spec: z.string().optional().describe('Substituted for {spec} (bundle path, ir/spec, or testcase path)'),
    },
    async ({ commandKey, spec }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
      const result = runAllowlistedCommand(project.root, cfg, commandKey, {
        spec: spec ?? '',
      })
      return text({
        ...result,
        deprecated: true,
        replacement: [
          'artifactgraph_recommend_command',
          'artifactgraph_allowlist_check',
          'owning kit executable',
        ],
      })
    },
  )

  /** Convenience: gaps-only view from analyze. */
  server.tool(
    'artifactgraph_gaps',
    'Same as analyze but returns only gaps[] + cloudPromptSlice (token-friendly)',
    {
      specPath: z.string().optional(),
      bullets: z.string().optional(),
    },
    async ({ specPath, bullets }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
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
    'Suggest draftTags / taxonomy enums from project/package lexicons (lane=fe|docs|be|plans).',
    {
      lane: z.enum(['fe', 'docs', 'plans', 'be']).describe('fe/docs → registry-tags (UI); be → API tags; plans → testcase-taxonomy'),
      bullets: z.string().optional().describe('Free-text for keyword match'),
      limit: z.number().optional().describe('Max draft tags / matches (default 12)'),
    },
    async ({ lane, bullets, limit }) => {
      const project = currentProject()
      const cfg = loadEffectiveRepoConfig(project.root)
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
    'artifactgraph_harness_status',
    'Show installed ArtifactGraph MCP DNA types and managed-file drift in the current repo',
    {},
    async () => text(projectInstallStatus(currentProject().root)),
  )

  server.tool(
    'artifactgraph_status',
    'Show project root, stack, dsl lanes, command keys; registries SSOT = product repo paths',
    {},
    async () => {
      const project = currentProject()
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
          note: 'Registries, templates, and installed lexicons live in the current product repo; MCP indexes and runs allowlisted gen',
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
