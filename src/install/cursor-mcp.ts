/**
 * @deprecated Prefer `./agents.js`. Re-exports for older imports.
 */
export {
  buildArtifactgraphMcpEntry,
  buildMcpEntry,
  defaultCursorMcpPath,
  installCursorMcp,
  installAgents,
} from './agents.js'

export type { InstallOptions as CursorInstallOptions } from './agents.js'
