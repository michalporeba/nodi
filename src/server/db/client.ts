import { Database } from 'bun:sqlite'
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db

  const dataDir = join(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })

  _db = new Database(join(dataDir, 'nodi.db'), { create: true })
  _db.exec('PRAGMA journal_mode=WAL;')
  _db.exec('PRAGMA foreign_keys=ON;')

  // Apply schema on every startup — all statements use IF NOT EXISTS
  const schema = readFileSync(join(process.cwd(), 'docs', 'schema.sql'), 'utf-8')
  _db.exec(schema)

  // Additive migrations for existing databases
  try { _db.exec("ALTER TABLE Source ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'") } catch { /* already exists */ }

  return _db
}

export function initializeSchema(): void {
  getDb()
}
