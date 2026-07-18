import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { packageRoot } from '../config/platform-repos.js'
import {
  CONFIG_NAME,
  defaultRepoConfig,
  loadRepoConfig,
  loadStackPreset,
} from '../config/load-config.js'
import type { ArtifactgraphConfig } from '../types.js'

export type InstallType = 'common' | 'docs' | 'fe' | 'be' | 'test' | 'all'
type LaneType = Exclude<InstallType, 'common' | 'all'>

const LANE_TYPES: LaneType[] = ['docs', 'fe', 'be', 'test']
export const INSTALL_MANIFEST_SCHEMA_VERSION = 1
export const INSTALL_MANIFEST_PACKAGE = '@platform/artifactgraph'
export const INSTALL_MANIFEST_TOOL_API = 1
export const INSTALL_MANIFEST_HARNESS_API = 1
const LEGACY_MANIFEST_PACKAGE_VERSION = '2.0.0'

export interface ManagedFile {
  source: string
  hash: string
  stale?: boolean
}

export interface InstallManifest {
  schemaVersion: 1
  package: '@platform/artifactgraph'
  toolApi: 1
  harnessApi: 1
  packageVersion: string
  types: InstallType[]
  files: Record<string, ManagedFile>
}

export type InstallManifestCompatibility =
  | 'not-installed'
  | 'supported'
  | 'legacy'
  | 'incompatible'

export interface ProjectInstallResult {
  root: string
  types: InstallType[]
  configPath: string
  created: string[]
  updated: string[]
  skipped: string[]
  conflicts: string[]
  manifestPath: string
}

export interface ProjectInstallStatus {
  installed: boolean
  manifestPath: string
  compatibility: InstallManifestCompatibility
  compatible: boolean
  legacy: boolean
  warnings: string[]
  compatibilityError?: string
  schemaVersion?: number
  package?: string
  toolApi?: number
  harnessApi?: number
  packageVersion?: string
  types: InstallType[]
  healthy: string[]
  missing: string[]
  modified: string[]
  stale: {
    healthy: string[]
    missing: string[]
    modified: string[]
  }
}

export interface ProjectPruneResult {
  root: string
  manifestPath: string
  dryRun: boolean
  wouldDelete: string[]
  deleted: string[]
  missing: string[]
  preservedModified: string[]
  preservedUnsafe: string[]
}

const COMMON_ASSETS: Array<[string, string]> = [
  [
    'harness/common/skills/artifactgraph/SKILL.md',
    '.cursor/skills/artifactgraph/SKILL.md',
  ],
  [
    'harness/common/skills/docs-mark/SKILL.md',
    '.cursor/skills/docs-mark/SKILL.md',
  ],
  [
    'harness/common/skills/platform-mark/SKILL.md',
    '.cursor/skills/platform-mark/SKILL.md',
  ],
  ['harness/common/rules/artifactgraph.mdc', '.cursor/rules/artifactgraph.mdc'],
  [
    'harness/common/extracts/artifactgraph-hooks-core.md',
    '.cursor/extracts/artifactgraph-hooks-core.md',
  ],
  [
    'harness/common/extracts/docs-mark.md',
    '.cursor/extracts/docs-mark.md',
  ],
  [
    'harness/common/extracts/docs-mark-detect.md',
    '.cursor/extracts/docs-mark-detect.md',
  ],
  ['lexicon/registry-tags.en.txt', 'artifactgraph/lexicon/registry-tags.en.txt'],
]

const TYPE_ASSETS: Record<LaneType, Array<[string, string]>> = {
  docs: [
    [
      'harness/docs/extracts/artifactgraph-hooks-docs.md',
      '.cursor/extracts/artifactgraph-hooks-docs.md',
    ],
    [
      'harness/docs/extracts/artifactgraph-parity.md',
      '.cursor/extracts/artifactgraph-parity.md',
    ],
  ],
  fe: [
    [
      'harness/fe/extracts/artifactgraph-hooks-fe.md',
      '.cursor/extracts/artifactgraph-hooks-fe.md',
    ],
  ],
  be: [
    [
      'harness/be/extracts/artifactgraph-hooks-be.md',
      '.cursor/extracts/artifactgraph-hooks-be.md',
    ],
  ],
  test: [
    [
      'harness/test/extracts/artifactgraph-hooks-test.md',
      '.cursor/extracts/artifactgraph-hooks-test.md',
    ],
    ['lexicon/testcase-taxonomy.en.txt', 'artifactgraph/lexicon/testcase-taxonomy.en.txt'],
  ],
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function writeAtomic(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.artifactgraph-tmp-${process.pid}`
  writeFileSync(temp, content, 'utf8')
  renameSync(temp, file)
}

function packageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(packageRoot(), 'package.json'), 'utf8'),
  ) as { version?: string }
  return pkg.version ?? '0.0.0'
}

export function normalizeInstallTypes(types: InstallType[]): InstallType[] {
  const requested = new Set<InstallType>(types.length ? types : ['common'])
  if (requested.has('all')) {
    return ['common', ...LANE_TYPES]
  }
  requested.add('common')
  return ['common', ...LANE_TYPES.filter((type) => requested.has(type))]
}

export function parseInstallTypes(raw?: string): InstallType[] {
  if (!raw) return []
  const known = new Set<InstallType>(['common', 'docs', 'fe', 'be', 'test', 'all'])
  const parsed = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  for (const type of parsed) {
    if (!known.has(type as InstallType)) {
      throw new Error(
        `Unknown init type "${type}". Known: common, docs, fe, be, test, all`,
      )
    }
  }
  return normalizeInstallTypes(parsed as InstallType[])
}

export interface LegacyInstallManifest {
  version: 1
  packageVersion: '2.0.0'
  types: InstallType[]
  files: Record<string, ManagedFile>
}

interface ManifestInspection {
  exists: boolean
  compatibility: InstallManifestCompatibility
  manifest: InstallManifest | LegacyInstallManifest | null
  raw: Record<string, unknown> | null
  warnings: string[]
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isInstallType(value: unknown): value is InstallType {
  return ['common', 'docs', 'fe', 'be', 'test', 'all'].includes(String(value))
}

function hasValidManifestPayload(value: Record<string, unknown>): boolean {
  if (
    typeof value.packageVersion !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      value.packageVersion,
    ) ||
    !Array.isArray(value.types) ||
    !value.types.every(isInstallType) ||
    !isRecord(value.files)
  ) {
    return false
  }
  return Object.values(value.files).every(
    (file) =>
      isManagedFile(file) &&
      (!('stale' in file) || file.stale === undefined || typeof file.stale === 'boolean'),
  )
}

function recoveryGuidance(manifestPath: string): string {
  return `Upgrade ArtifactGraph to a compatible version, or back up and remove ${manifestPath}, then run artifactgraph init to re-initialize it.`
}

function inspectManifest(file: string): ManifestInspection {
  if (!existsSync(file)) {
    return {
      exists: false,
      compatibility: 'not-installed',
      manifest: null,
      raw: null,
      warnings: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {
      exists: true,
      compatibility: 'incompatible',
      manifest: null,
      raw: null,
      warnings: [],
      error: `ArtifactGraph install manifest is not valid JSON. ${recoveryGuidance(file)}`,
    }
  }
  if (!isRecord(parsed)) {
    return {
      exists: true,
      compatibility: 'incompatible',
      manifest: null,
      raw: null,
      warnings: [],
      error: `ArtifactGraph install manifest must be a JSON object. ${recoveryGuidance(file)}`,
    }
  }

  const fail = (reason: string): ManifestInspection => ({
    exists: true,
    compatibility: 'incompatible',
    manifest: null,
    raw: parsed,
    warnings: [],
    error: `${reason} ${recoveryGuidance(file)}`,
  })

  const hasContractFields = ['schemaVersion', 'package', 'toolApi', 'harnessApi'].some(
    (key) => key in parsed,
  )
  if (hasContractFields) {
    if (parsed.schemaVersion !== INSTALL_MANIFEST_SCHEMA_VERSION) {
      return fail(
        `Unsupported install-manifest schemaVersion ${String(parsed.schemaVersion)}; this ArtifactGraph supports schemaVersion ${INSTALL_MANIFEST_SCHEMA_VERSION}.`,
      )
    }
    if (parsed.package !== INSTALL_MANIFEST_PACKAGE) {
      return fail(
        `Install manifest belongs to ${String(parsed.package)}, not ${INSTALL_MANIFEST_PACKAGE}.`,
      )
    }
    if (parsed.toolApi !== INSTALL_MANIFEST_TOOL_API) {
      return fail(
        `Unsupported install-manifest toolApi ${String(parsed.toolApi)}; this ArtifactGraph supports toolApi ${INSTALL_MANIFEST_TOOL_API}.`,
      )
    }
    if (parsed.harnessApi !== INSTALL_MANIFEST_HARNESS_API) {
      return fail(
        `Unsupported install-manifest harnessApi ${String(parsed.harnessApi)}; this ArtifactGraph supports harnessApi ${INSTALL_MANIFEST_HARNESS_API}.`,
      )
    }
    if (!hasValidManifestPayload(parsed)) {
      return fail('Install manifest has an invalid packageVersion, types, or files payload.')
    }
    return {
      exists: true,
      compatibility: 'supported',
      manifest: parsed as unknown as InstallManifest,
      raw: parsed,
      warnings: [],
    }
  }

  if (
    parsed.version === 1 &&
    parsed.packageVersion === LEGACY_MANIFEST_PACKAGE_VERSION &&
    hasValidManifestPayload(parsed)
  ) {
    return {
      exists: true,
      compatibility: 'legacy',
      manifest: parsed as unknown as LegacyInstallManifest,
      raw: parsed,
      warnings: [
        `Legacy ArtifactGraph ${LEGACY_MANIFEST_PACKAGE_VERSION} install manifest; run artifactgraph init to migrate it to the package contract.`,
      ],
    }
  }

  return fail(
    `Unsupported legacy install manifest; only ArtifactGraph ${LEGACY_MANIFEST_PACKAGE_VERSION} version:1 manifests can be migrated safely.`,
  )
}

export function assertProjectManifestCompatible(
  repoRoot: string,
): InstallManifest | LegacyInstallManifest | null {
  const manifestPath = path.join(
    path.resolve(repoRoot),
    '.artifactgraph',
    'install-manifest.json',
  )
  const inspection = inspectManifest(manifestPath)
  if (inspection.compatibility === 'incompatible') {
    throw new Error(inspection.error)
  }
  return inspection.manifest
}

export function projectInstallStatus(repoRoot: string): ProjectInstallStatus {
  const root = path.resolve(repoRoot)
  const manifestPath = path.join(root, '.artifactgraph', 'install-manifest.json')
  const inspection = inspectManifest(manifestPath)
  const manifest = inspection.manifest
  const raw = inspection.raw
  const status: ProjectInstallStatus = {
    installed: inspection.exists,
    manifestPath,
    compatibility: inspection.compatibility,
    compatible: inspection.compatibility !== 'incompatible',
    legacy: inspection.compatibility === 'legacy',
    warnings: inspection.warnings,
    compatibilityError: inspection.error,
    schemaVersion:
      typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : undefined,
    package: typeof raw?.package === 'string' ? raw.package : undefined,
    toolApi: typeof raw?.toolApi === 'number' ? raw.toolApi : undefined,
    harnessApi: typeof raw?.harnessApi === 'number' ? raw.harnessApi : undefined,
    packageVersion:
      manifest?.packageVersion ??
      (typeof raw?.packageVersion === 'string' ? raw.packageVersion : undefined),
    types: manifest?.types ?? [],
    healthy: [],
    missing: [],
    modified: [],
    stale: {
      healthy: [],
      missing: [],
      modified: [],
    },
  }
  for (const [destRel, managed] of Object.entries(manifest?.files ?? {})) {
    if (!isManagedFile(managed)) continue
    const dest = path.join(root, destRel)
    const bucket = managed.stale ? status.stale : status
    if (!existsSync(dest)) {
      bucket.missing.push(destRel)
    } else if (sha256(readFileSync(dest, 'utf8')) === managed.hash) {
      bucket.healthy.push(destRel)
    } else {
      bucket.modified.push(destRel)
    }
  }
  return status
}

function isManagedFile(value: unknown): value is ManagedFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Partial<ManagedFile>
  return (
    typeof file.source === 'string' &&
    typeof file.hash === 'string' &&
    /^[a-f0-9]{64}$/.test(file.hash)
  )
}

function compatibleManagedPath(source: string, destRel: string): boolean {
  const harness = /^harness\/(?:common|docs|fe|be|test)\/(skills|rules|extracts)\/(.+)$/.exec(
    source,
  )
  if (harness) return destRel === `.cursor/${harness[1]}/${harness[2]}`
  const lexicon = /^lexicon\/([^/]+)$/.exec(source)
  return Boolean(lexicon && destRel === `artifactgraph/lexicon/${lexicon[1]}`)
}

function containedRelativePath(root: string, destRel: string): string | null {
  const parts = destRel.split(/[\\/]/)
  if (
    !destRel ||
    path.isAbsolute(destRel) ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    return null
  }
  const dest = path.resolve(root, destRel)
  const relative = path.relative(root, dest)
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null
  }
  return dest
}

function safeExistingManagedPath(root: string, destRel: string): string | null {
  const dest = containedRelativePath(root, destRel)
  if (!dest) return null
  const stat = lstatSync(dest)
  if (stat.isSymbolicLink() || !stat.isFile()) return null
  const realRoot = realpathSync(root)
  const realParent = realpathSync(path.dirname(dest))
  const relative = path.relative(realRoot, realParent)
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
  return dest
}

export function pruneProjectAssets(opts: {
  repoRoot: string
  yes?: boolean
}): ProjectPruneResult {
  const root = path.resolve(opts.repoRoot)
  const manifestPath = path.join(root, '.artifactgraph', 'install-manifest.json')
  const manifest = assertProjectManifestCompatible(root)
  const result: ProjectPruneResult = {
    root,
    manifestPath,
    dryRun: !opts.yes,
    wouldDelete: [],
    deleted: [],
    missing: [],
    preservedModified: [],
    preservedUnsafe: [],
  }
  if (!manifest) return result

  const removeFromManifest = new Set<string>()
  for (const [destRel, managed] of Object.entries(manifest.files)) {
    if (!isManagedFile(managed) || !managed.stale) continue
    if (!compatibleManagedPath(managed.source, destRel)) {
      result.preservedUnsafe.push(destRel)
      continue
    }
    const dest = containedRelativePath(root, destRel)
    if (!dest) {
      result.preservedUnsafe.push(destRel)
      continue
    }
    if (!existsSync(dest)) {
      result.missing.push(destRel)
      if (opts.yes) removeFromManifest.add(destRel)
      continue
    }
    const safeDest = safeExistingManagedPath(root, destRel)
    if (!safeDest) {
      result.preservedUnsafe.push(destRel)
      continue
    }
    if (sha256(readFileSync(safeDest, 'utf8')) !== managed.hash) {
      result.preservedModified.push(destRel)
      continue
    }
    result.wouldDelete.push(destRel)
    if (opts.yes) {
      unlinkSync(safeDest)
      result.deleted.push(destRel)
      removeFromManifest.add(destRel)
    }
  }

  if (opts.yes && removeFromManifest.size) {
    for (const destRel of removeFromManifest) delete manifest.files[destRel]
    writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  return result
}

function isExplicitNonHubPath(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('@')
}

function filterLocalCommands(
  commands: Record<string, string[]> | undefined,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(commands ?? {}).filter(
      ([, argv]) => !argv.some((part) => part.startsWith('@')),
    ),
  )
}

function localRegistriesFromStack(repoRoot: string, stack: string): string[] {
  try {
    const preset = loadStackPreset(stack)
    return (preset.registries ?? []).filter((rel) =>
      existsSync(path.join(repoRoot, rel)),
    )
  } catch {
    return []
  }
}

function localTemplatesFromStack(
  repoRoot: string,
  stack: string,
): ArtifactgraphConfig['templates'] | undefined {
  try {
    const preset = loadStackPreset(stack)
    if (!preset.templates?.root) return undefined
    return existsSync(path.join(repoRoot, preset.templates.root))
      ? preset.templates
      : undefined
  } catch {
    return undefined
  }
}

function defaultVocabularies(
  types: InstallType[],
  existing?: ArtifactgraphConfig['vocabularies'],
): ArtifactgraphConfig['vocabularies'] {
  const hasTest = types.includes('test')
  const next: NonNullable<ArtifactgraphConfig['vocabularies']> = {
    registryTags: isExplicitNonHubPath(existing?.registryTags)
      ? existing.registryTags
      : 'artifactgraph/lexicon/registry-tags.en.txt',
  }
  if (hasTest) {
    next.testTaxonomy = isExplicitNonHubPath(existing?.testTaxonomy)
      ? existing.testTaxonomy
      : 'artifactgraph/lexicon/testcase-taxonomy.en.txt'
  } else if (isExplicitNonHubPath(existing?.testTaxonomy)) {
    next.testTaxonomy = existing.testTaxonomy
  }
  return next
}

/**
 * Fresh installs stay generic: never copy product-owned allowlists from stack
 * presets into unrelated repos. Existing configs are migrated in place.
 */
function sanitizeConfig(
  repoRoot: string,
  stack: string,
  types: InstallType[],
): ArtifactgraphConfig {
  const existing = loadRepoConfig(repoRoot)
  if (existing) {
    return {
      ...existing,
      version: 2,
      projectId: existing.projectId ?? path.basename(repoRoot),
      stack: existing.stack || stack || 'generic',
      mode: existing.mode ?? 'brownfield',
      commands: filterLocalCommands(existing.commands),
      gapSources: (existing.gapSources ?? []).filter((item) => !item.startsWith('@')),
      specRoots: (existing.specRoots ?? []).filter((item) => !item.startsWith('@')),
      hubs: undefined,
      vocabularies: defaultVocabularies(types, existing.vocabularies),
    }
  }

  const base = defaultRepoConfig(path.basename(repoRoot))
  return {
    ...base,
    version: 2,
    stack: stack || 'generic',
    commands: {},
    registries: localRegistriesFromStack(repoRoot, stack),
    gapSources: [],
    specRoots: [],
    hubs: undefined,
    templates: localTemplatesFromStack(repoRoot, stack),
    vocabularies: defaultVocabularies(types),
  }
}

export function installProjectAssets(opts: {
  repoRoot: string
  stack: string
  types: InstallType[]
  force?: boolean
}): ProjectInstallResult {
  const root = path.resolve(opts.repoRoot)
  const types = normalizeInstallTypes(opts.types)
  const manifestPath = path.join(root, '.artifactgraph', 'install-manifest.json')
  const previous = assertProjectManifestCompatible(root)
  const nextFiles: Record<string, ManagedFile> = {}
  const result: ProjectInstallResult = {
    root,
    types,
    configPath: path.join(root, CONFIG_NAME),
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
    manifestPath,
  }

  const assets = [...COMMON_ASSETS]
  for (const type of LANE_TYPES) {
    if (types.includes(type)) assets.push(...TYPE_ASSETS[type])
  }

  for (const [sourceRel, destRel] of assets) {
    const source = path.join(packageRoot(), sourceRel)
    const dest = path.join(root, destRel)
    const content = readFileSync(source, 'utf8')
    const nextHash = sha256(content)
    const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null
    const currentHash = current === null ? null : sha256(current)
    const priorHash = previous?.files[destRel]?.hash

    if (current === null) {
      writeAtomic(dest, content)
      result.created.push(destRel)
    } else if (currentHash === nextHash) {
      result.skipped.push(destRel)
    } else if (opts.force || (priorHash && currentHash === priorHash)) {
      writeAtomic(dest, content)
      result.updated.push(destRel)
    } else {
      result.conflicts.push(destRel)
      const prior = previous?.files[destRel]
      if (isManagedFile(prior)) nextFiles[destRel] = { ...prior, stale: undefined }
      continue
    }
    nextFiles[destRel] = { source: sourceRel, hash: nextHash }
  }

  for (const [destRel, managed] of Object.entries(previous?.files ?? {})) {
    if (!(destRel in nextFiles) && isManagedFile(managed)) {
      nextFiles[destRel] = { ...managed, stale: true }
    }
  }

  const config = sanitizeConfig(root, opts.stack, types)
  const configContent = `${JSON.stringify(config, null, 2)}\n`
  const priorConfig = existsSync(result.configPath)
    ? readFileSync(result.configPath, 'utf8')
    : null
  if (priorConfig === null) {
    writeAtomic(result.configPath, configContent)
    result.created.push(CONFIG_NAME)
  } else if (priorConfig === configContent) {
    result.skipped.push(CONFIG_NAME)
  } else {
    writeAtomic(result.configPath, configContent)
    result.updated.push(CONFIG_NAME)
  }

  const manifest: InstallManifest = {
    schemaVersion: INSTALL_MANIFEST_SCHEMA_VERSION,
    package: INSTALL_MANIFEST_PACKAGE,
    toolApi: INSTALL_MANIFEST_TOOL_API,
    harnessApi: INSTALL_MANIFEST_HARNESS_API,
    packageVersion: packageVersion(),
    types,
    files: nextFiles,
  }
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const ignorePath = path.join(root, '.artifactgraph', '.gitignore')
  const requiredRules = ['*', '!.gitignore', '!install-manifest.json']
  const existingRules = existsSync(ignorePath)
    ? readFileSync(ignorePath, 'utf8').split(/\r?\n/).filter(Boolean)
    : []
  const mergedRules = [...new Set([...existingRules, ...requiredRules])]
  writeAtomic(ignorePath, `${mergedRules.join('\n')}\n`)
  return result
}
