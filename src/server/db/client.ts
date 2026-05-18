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

  // Migrate Mention uniqueness from (entity_id, source_id) to (entity_id, source_id, surface_form)
  const mentionIndices = _db.prepare("PRAGMA index_list(Mention)").all() as Array<{ name: string; unique: number }>
  const hasThreeColUniq = mentionIndices.some(idx => {
    if (!idx.unique) return false
    const cols = (_db!.prepare(`PRAGMA index_info(${idx.name})`).all() as Array<{ name: string }>).map(c => c.name)
    return cols.length === 3 && cols.includes('entity_id') && cols.includes('source_id') && cols.includes('surface_form')
  })
  if (!hasThreeColUniq) {
    _db.exec(`
      CREATE TABLE Mention_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id     INTEGER NOT NULL REFERENCES Entity(id) ON DELETE CASCADE,
        source_id     INTEGER NOT NULL REFERENCES Source(id) ON DELETE CASCADE,
        surface_form  TEXT NOT NULL,
        confirmed     INTEGER NOT NULL DEFAULT 0,
        confirmed_at  TEXT,
        UNIQUE(entity_id, source_id, surface_form)
      );
      INSERT OR IGNORE INTO Mention_new (id, entity_id, source_id, surface_form, confirmed, confirmed_at)
        SELECT id, entity_id, source_id, surface_form, confirmed, confirmed_at FROM Mention;
      DROP TABLE Mention;
      ALTER TABLE Mention_new RENAME TO Mention;
      CREATE INDEX IF NOT EXISTS idx_mention_source ON Mention(source_id);
      CREATE INDEX IF NOT EXISTS idx_mention_entity ON Mention(entity_id);
    `)
  }

  return _db
}

export function initializeSchema(): void {
  getDb()
}
