/**
 * Local index store (SQLite via node:sqlite — Node 22+).
 *
 * Purpose:
 * - Cache registry entries + last analyze gaps for fast MCP tool responses
 * - Store "confirm memory" (member chose mark B for entity X) so next bullet
 *   analyze can raise confidence WITHOUT sending chat history to the cloud
 *
 * NOT a SSOT — registries/*.json and specs in git remain source of truth.
 * Rebuild anytime from disk.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { INDEX_DIR } from '../config/load-config.js'
import type { Gap } from '../types.js'

export class IndexStore {
  private db: DatabaseSync

  /**
   * @param repoRoot Absolute path to the product repo that owns .artifactgraph/
   */
  constructor(repoRoot: string) {
    const dir = path.join(repoRoot, INDEX_DIR)
    mkdirSync(dir, { recursive: true })
    this.db = new DatabaseSync(path.join(dir, 'index.db'))
    this.migrate()
  }

  /** Create tables if missing — keep schema tiny for v0.1. */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registry_entry (
        registry TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (registry, entry_id)
      );
      CREATE TABLE IF NOT EXISTS decision (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gap_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spec_path TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
  }

  /** Upsert one registry row (e.g. design shell DataListPage). */
  upsertRegistryEntry(registry: string, entryId: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT INTO registry_entry(registry, entry_id, payload)
         VALUES (?, ?, ?)
         ON CONFLICT(registry, entry_id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(registry, entryId, JSON.stringify(payload))
  }

  /** Clear one registry namespace before full rebuild. */
  clearRegistry(registry: string): void {
    this.db.prepare(`DELETE FROM registry_entry WHERE registry = ?`).run(registry)
  }

  /** Run a rebuild atomically so parse/index failures cannot leave partial state. */
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listRegistryEntries(registry: string): Array<{ entryId: string; payload: unknown }> {
    const rows = this.db
      .prepare(`SELECT entry_id, payload FROM registry_entry WHERE registry = ?`)
      .all(registry) as Array<{ entry_id: string; payload: string }>
    return rows.map((r) => ({ entryId: r.entry_id, payload: JSON.parse(r.payload) }))
  }

  /**
   * Remember a grill confirm so later bullet-analyze can reuse it.
   * Example subject: "entity:hotel|column:status" → needs-component MoStatusChip
   */
  rememberDecision(kind: string, subject: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT INTO decision(kind, subject, payload, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(kind, subject, JSON.stringify(payload), new Date().toISOString())
  }

  findDecisions(subjectPrefix: string): Array<{ kind: string; subject: string; payload: unknown }> {
    const rows = this.db
      .prepare(`SELECT kind, subject, payload FROM decision WHERE subject LIKE ? ORDER BY id DESC LIMIT 50`)
      .all(`${subjectPrefix}%`) as Array<{ kind: string; subject: string; payload: string }>
    return rows.map((r) => ({ kind: r.kind, subject: r.subject, payload: JSON.parse(r.payload) }))
  }

  findDecisionsByKind(kind: string): Array<{ kind: string; subject: string; payload: unknown }> {
    const rows = this.db
      .prepare(
        `SELECT kind, subject, payload FROM decision WHERE kind = ? ORDER BY id DESC LIMIT 200`,
      )
      .all(kind) as Array<{ kind: string; subject: string; payload: string }>
    return rows.map((r) => ({ kind: r.kind, subject: r.subject, payload: JSON.parse(r.payload) }))
  }

  saveGapSnapshot(specPath: string | undefined, gaps: Gap[]): void {
    this.db
      .prepare(`INSERT INTO gap_snapshot(spec_path, payload, created_at) VALUES (?, ?, ?)`)
      .run(specPath ?? null, JSON.stringify(gaps), new Date().toISOString())
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value)
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    return row?.value
  }

  close(): void {
    this.db.close()
  }
}
