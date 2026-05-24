-- nodi database schema
-- Applied by migration runner on first start
-- See docs/ARCHITECTURE.md for design rationale

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── Sources ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS Source (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  type                TEXT NOT NULL CHECK(type IN ('url', 'note')),
  url                 TEXT UNIQUE,                  -- null for notes
  title               TEXT,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK(status IN ('queued', 'active', 'done', 'irrelevant')),
  origin              TEXT NOT NULL DEFAULT 'manual'
                        CHECK(origin IN ('manual', 'discovery')),
  fetched_at          TEXT,                         -- ISO8601 datetime
  content             TEXT,                         -- full HTML or markdown
  subject_entity_id   INTEGER REFERENCES Entity(id),
  subject_confirmed   INTEGER NOT NULL DEFAULT 0,   -- bool
  subject_description TEXT,                         -- free text when multi-subject
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Harvested links from fetched pages, candidates for the queue
CREATE TABLE IF NOT EXISTS SourceLink (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  from_source_id  INTEGER NOT NULL REFERENCES Source(id),
  url             TEXT NOT NULL,
  title           TEXT,                             -- from anchor text
  UNIQUE(from_source_id, url)
);

-- ─── Entities ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS Entity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  -- class membership is recorded via instance_of Claim rows (property = 'instance_of', value = class name)
);

-- All names, titles, aliases, translations for an entity
-- String matching runs against this table (case-insensitive)
CREATE TABLE IF NOT EXISTS Label (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id   INTEGER NOT NULL REFERENCES Entity(id) ON DELETE CASCADE,
  value       TEXT NOT NULL,
  language    TEXT,                                 -- BCP47 tag e.g. 'en', 'cy'
  is_primary  INTEGER NOT NULL DEFAULT 0,           -- bool: the canonical display label
  is_alias    INTEGER NOT NULL DEFAULT 0            -- bool: alternate name or spelling
);

CREATE INDEX IF NOT EXISTS idx_label_value ON Label(value COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_label_entity ON Label(entity_id);

-- ─── External IDs ───────────────────────────────────────────────────────────

-- system values: wikidata, wikipedia_en, wikipedia_cy, imdb, bbc_programme,
--                bfi, tmdb_movie, tmdb_tv, musicbrainz, roud, session_org
CREATE TABLE IF NOT EXISTS ExternalID (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id   INTEGER NOT NULL REFERENCES Entity(id) ON DELETE CASCADE,
  system      TEXT NOT NULL,
  value       TEXT NOT NULL,
  url         TEXT,
  confirmed   INTEGER NOT NULL DEFAULT 0,           -- bool: manually verified
  UNIQUE(entity_id, system)
);

CREATE INDEX IF NOT EXISTS idx_externalid_entity ON ExternalID(entity_id);
CREATE INDEX IF NOT EXISTS idx_externalid_system_value ON ExternalID(system, value);

-- ─── Mentions ───────────────────────────────────────────────────────────────

-- One row per (entity, source, surface_form) triple once confirmed
-- Unconfirmed suggestions are ephemeral — computed at render time, not stored
CREATE TABLE IF NOT EXISTS Mention (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id     INTEGER NOT NULL REFERENCES Entity(id) ON DELETE CASCADE,
  source_id     INTEGER NOT NULL REFERENCES Source(id) ON DELETE CASCADE,
  surface_form  TEXT NOT NULL,                      -- exact string that appeared
  confirmed     INTEGER NOT NULL DEFAULT 0,         -- bool
  confirmed_at  TEXT,                               -- ISO8601 datetime
  UNIQUE(entity_id, source_id, surface_form)
);

CREATE INDEX IF NOT EXISTS idx_mention_source ON Mention(source_id);
CREATE INDEX IF NOT EXISTS idx_mention_entity ON Mention(entity_id);

-- ─── Claims ─────────────────────────────────────────────────────────────────

-- property values: see docs/domain.md for full list and Wikidata PID mappings
-- value: text for literal values (dates, free text, language codes)
-- object_entity_id: for entity-valued properties
-- exactly one of value or object_entity_id should be set, but not enforced at db level
CREATE TABLE IF NOT EXISTS Claim (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_entity_id   INTEGER REFERENCES Entity(id) ON DELETE CASCADE,
  subject_label       TEXT,
  property            TEXT NOT NULL,
  value               TEXT,
  object_entity_id    INTEGER REFERENCES Entity(id),
  mention_id          INTEGER REFERENCES Mention(id),
  source_id           INTEGER REFERENCES Source(id),
  notable             INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (subject_entity_id IS NOT NULL OR subject_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_claim_subject ON Claim(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_claim_property ON Claim(property);
CREATE INDEX IF NOT EXISTS idx_claim_object ON Claim(object_entity_id);

-- ─── External search log ────────────────────────────────────────────────────

-- Tracks reconciliation searches against external systems (Wikidata, etc.)
-- so the UI can remember a search was already attempted without confirmation
-- and avoid re-searching unnecessarily.
CREATE TABLE IF NOT EXISTS EntitySearchLog (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id         INTEGER NOT NULL REFERENCES Entity(id) ON DELETE CASCADE,
  system            TEXT NOT NULL,
  last_searched_at  TEXT NOT NULL,
  result_count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(entity_id, system)
);

CREATE INDEX IF NOT EXISTS idx_searchlog_entity ON EntitySearchLog(entity_id);
