#!/usr/bin/env node
/** MCP stdio launcher for Cursor mcp.json */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await import(pathToFileURL(path.join(root, 'dist', 'mcp', 'server.js')).href)
