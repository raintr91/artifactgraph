/**
 * Package barrel — re-exports for library use / future MCP plugins.
 * Prefer importing from specific modules when copying patterns into a new MCP.
 */

export { createServer, main as startMcpServer } from './mcp/server.js'
export { loadPlatformReposMap, resolveProject } from './config/platform-repos.js'
export { analyzeSpecFile } from './analyze/analyze-spec.js'
export { analyzeBullets } from './analyze/analyze-bullets.js'
export { IndexStore } from './db/index-store.js'
