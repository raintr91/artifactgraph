/**
 * Package barrel — re-exports for library use / future MCP plugins.
 * Prefer importing from specific modules when copying patterns into a new MCP.
 */

export { createServer, main as startMcpServer } from './mcp/server.js'
export { loadPlatformReposMap, resolveProject, resolveHarnessProfile } from './config/platform-repos.js'
export { analyzeSpecFile } from './analyze/analyze-spec.js'
export { analyzeBullets } from './analyze/analyze-bullets.js'
export {
  parityCheck,
  parityCloudSchemaBlock,
  recordParityDecision,
} from './analyze/parity-check.js'
export {
  contextOrphanSchemaBlock,
  parseContextOrphansDoc,
  scanModuleContextOrphans,
} from './analyze/context-orphan.js'
export { IndexStore } from './db/index-store.js'

export { resolveConfigPath, resolveSpecPath, pathResolutionSummary } from './config/resolve-paths.js'
export { suggestTags, loadRegistryTagsLexicon, loadTestTaxonomyLexicon } from './lexicon/load-lexicon.js'
export { inferSuggestLane, isFeStack, isBeStack } from './lexicon/infer-lane.js'
export {
  assertProjectManifestCompatible,
  INSTALL_MANIFEST_HARNESS_API,
  INSTALL_MANIFEST_PACKAGE,
  INSTALL_MANIFEST_SCHEMA_VERSION,
  INSTALL_MANIFEST_TOOL_API,
  installProjectAssets,
  normalizeInstallTypes,
  parseInstallTypes,
  pruneProjectAssets,
  projectInstallStatus,
} from './install/project.js'
export type {
  InstallManifest,
  InstallManifestCompatibility,
  InstallType,
  LegacyInstallManifest,
  ManagedFile,
  ProjectInstallResult,
  ProjectInstallStatus,
  ProjectPruneResult,
} from './install/project.js'
