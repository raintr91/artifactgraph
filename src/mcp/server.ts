/**
 * MCP server entry — stdio transport for Cursor.
 *
 * Pattern to copy for future MCPs:
 * 1. Create McpServer
 * 2. Register tools with zod schemas
 * 3. connect(StdioServerTransport)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { registerTools } from './tools.js'
import { packageRoot } from '../config/platform-repos.js'

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(packageRoot(), 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Build the MCP server instance (also usable in tests without connecting). */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'artifactgraph',
    version: packageVersion(),
  })
  registerTools(server)
  return server
}

/** Process entry when run as `node dist/mcp/server.js` or `tsx src/mcp/server.ts`. */
export async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// Auto-start when this file is the process entrypoint OR when bin/*-mcp.mjs imports us.
// Prefer bin launcher calling main() explicitly; this is a safety net.
const entry = process.argv[1] ?? ''
const isDirect = entry.includes('mcp/server') || entry.includes('artifactgraph-mcp')
if (isDirect) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
