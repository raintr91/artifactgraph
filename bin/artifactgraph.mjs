#!/usr/bin/env node
/**
 * Launcher on PATH after install.sh / npm link.
 * Resolves package root next to this file (…/artifactgraph/bin → …/artifactgraph).
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await import(pathToFileURL(path.join(root, 'dist', 'cli.js')).href)
