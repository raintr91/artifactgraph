#!/usr/bin/env node
/** MCP stdio launcher for Cursor mcp.json — must call main() (import alone is not enough). */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mod = await import(pathToFileURL(path.join(root, 'dist', 'mcp', 'server.js')).href)
await mod.main()
