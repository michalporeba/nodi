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

  // Drop hardcoded CHECK constraint on Entity.type (types now come from ontology)
  const entitySchema = (_db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='Entity'").get() as { sql: string } | null)?.sql ?? ''
  if (entitySchema.includes('CHECK')) {
    _db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE Entity_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO Entity_new SELECT id, type, created_at FROM Entity;
      DROP TABLE Entity;
      ALTER TABLE Entity_new RENAME TO Entity;
      PRAGMA foreign_keys=ON;
    `)
  }

  // Migrate Claim: make subject_entity_id nullable, add subject_label, add CHECK
  const claimCols = (_db.prepare("PRAGMA table_info(Claim)").all() as Array<{ name: string }>).map(c => c.name)
  if (!claimCols.includes('subject_label')) {
    _db.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE Claim_new (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_entity_id   INTEGER REFERENCES Entity(id) ON DELETE CASCADE,
        subject_label       TEXT,
        property            TEXT NOT NULL,
        value               TEXT,
        object_entity_id    INTEGER REFERENCES Entity(id),
        mention_id          INTEGER REFERENCES Mention(id),
        source_id           INTEGER REFERENCES Source(id),
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (subject_entity_id IS NOT NULL OR subject_label IS NOT NULL)
      );
      INSERT INTO Claim_new (id, subject_entity_id, property, value, object_entity_id, mention_id, source_id, created_at)
        SELECT id, subject_entity_id, property, value, object_entity_id, mention_id, source_id, created_at FROM Claim;
      DROP TABLE Claim;
      ALTER TABLE Claim_new RENAME TO Claim;
      CREATE INDEX IF NOT EXISTS idx_claim_subject ON Claim(subject_entity_id);
      CREATE INDEX IF NOT EXISTS idx_claim_property ON Claim(property);
      CREATE INDEX IF NOT EXISTS idx_claim_object ON Claim(object_entity_id);
      PRAGMA foreign_keys=ON;
    `)
  }

  // Add notable flag to Claim
  try { _db.exec('ALTER TABLE Claim ADD COLUMN notable INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }

  // Migrate class membership to instance_of claims (Item 12 Phase A).
  // For every Entity whose type is set and has no instance_of claim yet, create one.
  // Idempotent: guarded by the NOT EXISTS check.
  // Must run BEFORE the Phase F column drop below so the type value is still readable.
  const entityColsBefore = (_db.prepare("PRAGMA table_info(Entity)").all() as Array<{ name: string }>).map(c => c.name)
  if (entityColsBefore.includes('type')) {
    _db.exec(`
      INSERT INTO Claim (subject_entity_id, property, value, notable)
      SELECT e.id, 'instance_of', e.type, 0
      FROM Entity e
      WHERE e.type IS NOT NULL AND e.type != ''
        AND NOT EXISTS (
          SELECT 1 FROM Claim c
          WHERE c.subject_entity_id = e.id AND c.property = 'instance_of'
        )
    `)

    // Phase F: drop Entity.type column (class membership now lives in instance_of claims).
    // PRAGMA foreign_keys must be outside the transaction (SQLite requirement).
    _db.exec('PRAGMA foreign_keys=OFF')
    _db.transaction(() => {
      _db!.exec(`CREATE TABLE Entity_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`)
      _db!.exec('INSERT INTO Entity_new SELECT id, created_at FROM Entity')
      _db!.exec('DROP TABLE Entity')
      _db!.exec('ALTER TABLE Entity_new RENAME TO Entity')
    })()
    _db.exec('PRAGMA foreign_keys=ON')
  }

  // Migrate Mention uniqueness from (entity_id, source_id) to (entity_id, source_id, surface_form)
  const mentionIndices = _db.prepare("PRAGMA index_list(Mention)").all() as Array<{ name: string; unique: number }>
  const hasThreeColUniq = mentionIndices.some(idx => {
    if (!idx.unique) return false
    const cols = (_db!.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{ name: string }>).map(c => c.name)
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
