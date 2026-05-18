import type { SQLQueryBindings } from 'bun:sqlite'
import { getDb } from './client'

type Params = SQLQueryBindings[]

// ─── Shared Types ──────────────────────────────────────────────────────────────

export type SourceStatus = 'queued' | 'active' | 'done' | 'irrelevant'
export type SourceType = 'url' | 'note'
export type EntityType =
  | 'Person'
  | 'FictionalPerson'
  | 'Character'
  | 'Film'
  | 'Series'
  | 'Episode'
  | 'Organisation'
  | 'Location'
  | 'Other'

export interface Source {
  id: number
  type: SourceType
  url: string | null
  title: string | null
  status: SourceStatus
  origin: 'manual' | 'discovery'
  fetched_at: string | null
  content?: string
  subject_entity_id: number | null
  subject_confirmed: boolean
  subject_description: string | null
  created_at: string
}

export interface Entity {
  id: number
  type: EntityType
  primary_label: string
  mention_count: number
  claim_count: number
  wikidata_qid: string | null
  wikidata_confirmed: boolean
  created_at: string
}

export interface EntitySearchLogEntry {
  system: string
  last_searched_at: string
  result_count: number
}

export interface EntityDetail extends Entity {
  labels: Label[]
  external_ids: ExternalID[]
  claims: ClaimWithDetail[]
  mentions: MentionWithSource[]
  search_logs: EntitySearchLogEntry[]
}

export interface Label {
  id: number
  entity_id: number
  value: string
  language: string | null
  is_primary: boolean
  is_alias: boolean
}

export interface ExternalID {
  id: number
  entity_id: number
  system: string
  value: string
  url: string | null
  confirmed: boolean
}

export interface Mention {
  id: number
  entity_id: number
  source_id: number
  surface_form: string
  confirmed: boolean
  confirmed_at: string | null
}

export interface MentionWithSource extends Mention {
  source_title: string | null
  source_url: string | null
  source_status: SourceStatus
}

export interface Claim {
  id: number
  subject_entity_id: number
  property: string
  value: string | null
  object_entity_id: number | null
  mention_id: number | null
  source_id: number | null
  created_at: string
}

export interface ClaimWithDetail extends Claim {
  object_label: string | null
  object_type: string | null
  source_title: string | null
}

export interface SourceLink {
  id: number
  from_source_id: number
  url: string
  title: string | null
  already_in_queue: boolean
  already_irrelevant: boolean
}

export interface LabelForMatching {
  id: number
  entity_id: number
  value: string
  language: string | null
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapSource(row: Record<string, unknown>, includeContent = false): Source {
  const s: Source = {
    id: row.id as number,
    type: row.type as SourceType,
    url: row.url as string | null,
    title: row.title as string | null,
    status: row.status as SourceStatus,
    origin: (row.origin as 'manual' | 'discovery') ?? 'manual',
    fetched_at: row.fetched_at as string | null,
    subject_entity_id: row.subject_entity_id as number | null,
    subject_confirmed: Boolean(row.subject_confirmed),
    subject_description: row.subject_description as string | null,
    created_at: row.created_at as string,
  }
  if (includeContent) s.content = row.content as string | undefined
  return s
}

function mapEntity(row: Record<string, unknown>): Entity {
  return {
    id: row.id as number,
    type: row.type as EntityType,
    primary_label: (row.primary_label as string) ?? '(no label)',
    mention_count: (row.mention_count as number) ?? 0,
    claim_count: (row.claim_count as number) ?? 0,
    wikidata_qid: row.wikidata_qid as string | null,
    wikidata_confirmed: Boolean(row.wikidata_confirmed),
    created_at: row.created_at as string,
  }
}

function mapLabel(row: Record<string, unknown>): Label {
  return {
    id: row.id as number,
    entity_id: row.entity_id as number,
    value: row.value as string,
    language: row.language as string | null,
    is_primary: Boolean(row.is_primary),
    is_alias: Boolean(row.is_alias),
  }
}

function mapExternalID(row: Record<string, unknown>): ExternalID {
  return {
    id: row.id as number,
    entity_id: row.entity_id as number,
    system: row.system as string,
    value: row.value as string,
    url: row.url as string | null,
    confirmed: Boolean(row.confirmed),
  }
}

function mapMention(row: Record<string, unknown>): Mention {
  return {
    id: row.id as number,
    entity_id: row.entity_id as number,
    source_id: row.source_id as number,
    surface_form: row.surface_form as string,
    confirmed: Boolean(row.confirmed),
    confirmed_at: row.confirmed_at as string | null,
  }
}

function mapClaim(row: Record<string, unknown>): Claim {
  return {
    id: row.id as number,
    subject_entity_id: row.subject_entity_id as number,
    property: row.property as string,
    value: row.value as string | null,
    object_entity_id: row.object_entity_id as number | null,
    mention_id: row.mention_id as number | null,
    source_id: row.source_id as number | null,
    created_at: row.created_at as string,
  }
}

// ─── Sources ──────────────────────────────────────────────────────────────────

const ENTITY_AGGREGATE_SQL = `
  SELECT
    e.id, e.type, e.created_at,
    COALESCE((SELECT l2.value FROM Label l2 WHERE l2.entity_id = e.id AND l2.is_primary = 1 LIMIT 1), '(no label)') as primary_label,
    (SELECT COUNT(*) FROM Mention m WHERE m.entity_id = e.id) as mention_count,
    (SELECT COUNT(*) FROM Claim c WHERE c.subject_entity_id = e.id) as claim_count,
    (SELECT eid2.value FROM ExternalID eid2 WHERE eid2.entity_id = e.id AND eid2.system = 'wikidata' AND eid2.confirmed = 1 LIMIT 1) as wikidata_qid,
    (SELECT eid3.confirmed FROM ExternalID eid3 WHERE eid3.entity_id = e.id AND eid3.system = 'wikidata' AND eid3.confirmed = 1 LIMIT 1) as wikidata_confirmed
  FROM Entity e
`

export function getSources(filters: { status?: string; type?: string; origin?: string } = {}): Source[] {
  const db = getDb()
  const parts: string[] = ['WHERE 1=1']
  const params: Params = []

  if (filters.status) { parts.push('AND s.status = ?'); params.push(filters.status) }
  if (filters.type) { parts.push('AND s.type = ?'); params.push(filters.type) }
  if (filters.origin) { parts.push('AND s.origin = ?'); params.push(filters.origin) }

  const sql = `SELECT s.id, s.type, s.url, s.title, s.status, s.origin, s.fetched_at, s.subject_entity_id, s.subject_confirmed, s.subject_description, s.created_at FROM Source s ${parts.join(' ')} ORDER BY CASE WHEN s.origin = 'manual' THEN 0 ELSE 1 END, s.created_at DESC`
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => mapSource(r))
}

export function getSource(id: number): Source | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM Source WHERE id = ?').get(id) as Record<string, unknown> | null
  return row ? mapSource(row, true) : null
}

export function createSource(data: {
  type: SourceType
  url?: string
  title?: string
  content?: string
  status?: SourceStatus
  origin?: 'manual' | 'discovery'
  fetched_at?: string
}): Source {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO Source (type, url, title, content, status, origin, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.type,
    data.url ?? null,
    data.title ?? null,
    data.content ?? null,
    data.status ?? 'queued',
    data.origin ?? 'manual',
    data.fetched_at ?? null,
  )
  return getSource(result.lastInsertRowid as number)!
}

export function updateSource(id: number, data: Partial<Pick<Source, 'status' | 'title' | 'subject_entity_id' | 'subject_confirmed' | 'subject_description'>>): Source | null {
  const db = getDb()
  const sets: string[] = []
  const params: Params = []

  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status) }
  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title ?? null) }
  if (data.subject_entity_id !== undefined) { sets.push('subject_entity_id = ?'); params.push(data.subject_entity_id) }
  if (data.subject_confirmed !== undefined) { sets.push('subject_confirmed = ?'); params.push(data.subject_confirmed ? 1 : 0) }
  if (data.subject_description !== undefined) { sets.push('subject_description = ?'); params.push(data.subject_description ?? null) }

  if (sets.length === 0) return getSource(id)

  params.push(id)
  db.prepare(`UPDATE Source SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getSource(id)
}

export function getSourceByUrl(url: string): Source | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM Source WHERE url = ?').get(url) as Record<string, unknown> | null
  return row ? mapSource(row) : null
}

// ─── Source Links ─────────────────────────────────────────────────────────────

export function addSourceLinks(sourceId: number, links: Array<{ url: string; title: string | null }>): void {
  const db = getDb()
  const insert = db.prepare('INSERT OR IGNORE INTO SourceLink (from_source_id, url, title) VALUES (?, ?, ?)')
  for (const link of links) {
    insert.run(sourceId, link.url, link.title)
  }
}

export function getSourceLinks(sourceId: number): SourceLink[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT sl.*,
      EXISTS(SELECT 1 FROM Source s WHERE s.url = sl.url AND s.status != 'irrelevant') as already_in_queue,
      EXISTS(SELECT 1 FROM Source s WHERE s.url = sl.url AND s.status = 'irrelevant') as already_irrelevant
    FROM SourceLink sl
    WHERE sl.from_source_id = ?
  `).all(sourceId) as Record<string, unknown>[]

  return rows.map(r => ({
    id: r.id as number,
    from_source_id: r.from_source_id as number,
    url: r.url as string,
    title: r.title as string | null,
    already_in_queue: Boolean(r.already_in_queue),
    already_irrelevant: Boolean(r.already_irrelevant),
  }))
}

export function getCandidateLinks(): Array<{ url: string; title: string | null; frequency: number }> {
  const db = getDb()
  const rows = db.prepare(`
    SELECT sl.url, sl.title, COUNT(*) as frequency
    FROM SourceLink sl
    WHERE NOT EXISTS (SELECT 1 FROM Source s WHERE s.url = sl.url)
    GROUP BY sl.url
    ORDER BY frequency DESC, sl.url
  `).all() as Record<string, unknown>[]

  return rows.map(r => ({
    url: r.url as string,
    title: r.title as string | null,
    frequency: r.frequency as number,
  }))
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export function getEntities(filters: { type?: string; q?: string; unreconciled?: boolean } = {}): Entity[] {
  const db = getDb()
  const parts: string[] = ['WHERE 1=1']
  const params: Params = []

  if (filters.type) { parts.push('AND e.type = ?'); params.push(filters.type) }
  if (filters.q) { parts.push('AND EXISTS (SELECT 1 FROM Label l WHERE l.entity_id = e.id AND l.value LIKE ? COLLATE NOCASE)'); params.push(`%${filters.q}%`) }
  if (filters.unreconciled) { parts.push('AND NOT EXISTS (SELECT 1 FROM ExternalID eid WHERE eid.entity_id = e.id AND eid.system = \'wikidata\' AND eid.confirmed = 1)') }

  const sql = `${ENTITY_AGGREGATE_SQL} ${parts.join(' ')} ORDER BY primary_label COLLATE NOCASE`
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapEntity)
}

export function getEntityById(id: number): { id: number; type: EntityType } | null {
  const db = getDb()
  return db.prepare('SELECT id, type FROM Entity WHERE id = ?').get(id) as { id: number; type: EntityType } | null
}

export function getEntityDetail(id: number): EntityDetail | null {
  const db = getDb()
  const entityRow = db.prepare(`${ENTITY_AGGREGATE_SQL} WHERE e.id = ?`).get(id) as Record<string, unknown> | null
  if (!entityRow) return null

  const labels = (db.prepare('SELECT * FROM Label WHERE entity_id = ? ORDER BY is_primary DESC, value').all(id) as Record<string, unknown>[]).map(mapLabel)
  const external_ids = (db.prepare('SELECT * FROM ExternalID WHERE entity_id = ? ORDER BY system').all(id) as Record<string, unknown>[]).map(mapExternalID)

  const claimRows = db.prepare(`
    SELECT c.*,
      (SELECT l.value FROM Label l WHERE l.entity_id = c.object_entity_id AND l.is_primary = 1 LIMIT 1) as object_label,
      (SELECT e.type FROM Entity e WHERE e.id = c.object_entity_id LIMIT 1) as object_type,
      (SELECT s.title FROM Source s WHERE s.id = c.source_id LIMIT 1) as source_title
    FROM Claim c
    WHERE c.subject_entity_id = ?
    ORDER BY c.property, c.created_at
  `).all(id) as Record<string, unknown>[]

  const claims: ClaimWithDetail[] = claimRows.map(r => ({
    ...mapClaim(r),
    object_label: r.object_label as string | null,
    object_type: r.object_type as string | null,
    source_title: r.source_title as string | null,
  }))

  const mentionRows = db.prepare(`
    SELECT m.*, s.title as source_title, s.url as source_url, s.status as source_status
    FROM Mention m
    JOIN Source s ON s.id = m.source_id
    WHERE m.entity_id = ?
    ORDER BY m.confirmed_at DESC
  `).all(id) as Record<string, unknown>[]

  const mentions: MentionWithSource[] = mentionRows.map(r => ({
    ...mapMention(r),
    source_title: r.source_title as string | null,
    source_url: r.source_url as string | null,
    source_status: r.source_status as SourceStatus,
  }))

  const search_logs = (db.prepare('SELECT system, last_searched_at, result_count FROM EntitySearchLog WHERE entity_id = ?').all(id) as Record<string, unknown>[]).map(r => ({
    system: r.system as string,
    last_searched_at: r.last_searched_at as string,
    result_count: r.result_count as number,
  }))

  return { ...mapEntity(entityRow), labels, external_ids, claims, mentions, search_logs }
}

export function recordEntitySearch(entityId: number, system: string, resultCount: number): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO EntitySearchLog (entity_id, system, last_searched_at, result_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(entity_id, system) DO UPDATE SET
      last_searched_at = excluded.last_searched_at,
      result_count = excluded.result_count
  `).run(entityId, system, now, resultCount)
}

export function createEntity(data: { type: EntityType; primary_label: string; language?: string }): Entity {
  const db = getDb()
  const entityResult = db.prepare('INSERT INTO Entity (type) VALUES (?)').run(data.type)
  const entityId = entityResult.lastInsertRowid as number
  db.prepare('INSERT INTO Label (entity_id, value, language, is_primary) VALUES (?, ?, ?, 1)').run(
    entityId, data.primary_label, data.language ?? 'en'
  )
  return getEntities({ q: data.primary_label }).find(e => e.id === entityId)!
}

export function updateEntity(id: number, data: { type?: EntityType }): void {
  const db = getDb()
  if (data.type) db.prepare('UPDATE Entity SET type = ? WHERE id = ?').run(data.type, id)
}

export function deleteEntity(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM Entity WHERE id = ?').run(id)
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function getLabels(entityId: number): Label[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM Label WHERE entity_id = ? ORDER BY is_primary DESC, value').all(entityId) as Record<string, unknown>[]).map(mapLabel)
}

export function addLabel(data: { entity_id: number; value: string; language?: string; is_primary?: boolean; is_alias?: boolean }): Label {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO Label (entity_id, value, language, is_primary, is_alias)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.entity_id, data.value, data.language ?? null,
    data.is_primary ? 1 : 0, data.is_alias ? 1 : 0
  )
  const row = db.prepare('SELECT * FROM Label WHERE id = ?').get(result.lastInsertRowid as number) as Record<string, unknown>
  return mapLabel(row)
}

export function deleteLabel(id: number): { ok: boolean; error?: string } {
  const db = getDb()
  const label = db.prepare('SELECT * FROM Label WHERE id = ?').get(id) as Record<string, unknown> | null
  if (!label) return { ok: false, error: 'Label not found' }
  if (label.is_primary) {
    const count = db.prepare('SELECT COUNT(*) as n FROM Label WHERE entity_id = ? AND is_primary = 1').get(label.entity_id as number) as { n: number }
    if (count.n <= 1) return { ok: false, error: 'Cannot remove the only primary label' }
  }
  db.prepare('DELETE FROM Label WHERE id = ?').run(id)
  return { ok: true }
}

export function getAllLabelsForMatching(): LabelForMatching[] {
  const db = getDb()
  return db.prepare('SELECT id, entity_id, value, language FROM Label').all() as LabelForMatching[]
}

// ─── External IDs ─────────────────────────────────────────────────────────────

export function getExternalIds(entityId: number): ExternalID[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM ExternalID WHERE entity_id = ? ORDER BY system').all(entityId) as Record<string, unknown>[]).map(mapExternalID)
}

export function addExternalId(data: { entity_id: number; system: string; value: string; url?: string; confirmed?: boolean }): ExternalID {
  const db = getDb()
  const result = db.prepare(`
    INSERT OR REPLACE INTO ExternalID (entity_id, system, value, url, confirmed)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.entity_id, data.system, data.value, data.url ?? null, data.confirmed ? 1 : 0)
  const row = db.prepare('SELECT * FROM ExternalID WHERE id = ?').get(result.lastInsertRowid as number) as Record<string, unknown>
  return mapExternalID(row)
}

export function updateExternalId(id: number, data: { confirmed?: boolean; url?: string }): ExternalID | null {
  const db = getDb()
  const sets: string[] = []
  const params: Params = []
  if (data.confirmed !== undefined) { sets.push('confirmed = ?'); params.push(data.confirmed ? 1 : 0) }
  if (data.url !== undefined) { sets.push('url = ?'); params.push(data.url) }
  if (sets.length === 0) return null
  params.push(id)
  db.prepare(`UPDATE ExternalID SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  const row = db.prepare('SELECT * FROM ExternalID WHERE id = ?').get(id) as Record<string, unknown> | null
  return row ? mapExternalID(row) : null
}

export function deleteExternalId(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM ExternalID WHERE id = ?').run(id)
}

// ─── Mentions ─────────────────────────────────────────────────────────────────

export function getMentionsBySource(sourceId: number): Mention[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM Mention WHERE source_id = ?').all(sourceId) as Record<string, unknown>[]).map(mapMention)
}

export function getConfirmedMentionsBySource(sourceId: number): Mention[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM Mention WHERE source_id = ? AND confirmed = 1').all(sourceId) as Record<string, unknown>[]).map(mapMention)
}

export function createMention(data: { entity_id: number; source_id: number; surface_form: string }): Mention {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM Mention WHERE entity_id = ? AND source_id = ?').get(data.entity_id, data.source_id) as Record<string, unknown> | null
  if (existing) return mapMention(existing)

  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO Mention (entity_id, source_id, surface_form, confirmed, confirmed_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(data.entity_id, data.source_id, data.surface_form, now)
  const row = db.prepare('SELECT * FROM Mention WHERE id = ?').get(result.lastInsertRowid as number) as Record<string, unknown>
  return mapMention(row)
}

export function deleteMention(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM Mention WHERE id = ?').run(id)
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export function createClaim(data: {
  subject_entity_id: number
  property: string
  value?: string
  object_entity_id?: number
  mention_id?: number
  source_id?: number
}): Claim {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO Claim (subject_entity_id, property, value, object_entity_id, mention_id, source_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.subject_entity_id, data.property,
    data.value ?? null, data.object_entity_id ?? null,
    data.mention_id ?? null, data.source_id ?? null
  )
  const row = db.prepare('SELECT * FROM Claim WHERE id = ?').get(result.lastInsertRowid as number) as Record<string, unknown>
  return mapClaim(row)
}

export function deleteClaim(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM Claim WHERE id = ?').run(id)
}

export function updateClaim(id: number, data: { value?: string | null; object_entity_id?: number | null; property?: string }): Claim | null {
  const db = getDb()
  const sets: string[] = []
  const params: unknown[] = []
  if (data.value !== undefined)            { sets.push('value = ?');            params.push(data.value) }
  if (data.object_entity_id !== undefined) { sets.push('object_entity_id = ?'); params.push(data.object_entity_id) }
  if (data.property !== undefined)         { sets.push('property = ?');         params.push(data.property) }
  if (sets.length === 0) {
    const row = db.prepare('SELECT * FROM Claim WHERE id = ?').get(id) as Record<string, unknown> | null
    return row ? mapClaim(row) : null
  }
  params.push(id)
  db.prepare(`UPDATE Claim SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  const row = db.prepare('SELECT * FROM Claim WHERE id = ?').get(id) as Record<string, unknown> | null
  return row ? mapClaim(row) : null
}

export function getUsedProperties(subjectType?: string): Array<{ property: string; count: number }> {
  const db = getDb()
  if (subjectType) {
    return db.prepare(`
      SELECT c.property, COUNT(*) as count
      FROM Claim c
      JOIN Entity e ON e.id = c.subject_entity_id
      WHERE e.type = ?
      GROUP BY c.property
      ORDER BY count DESC, c.property
    `).all(subjectType) as Array<{ property: string; count: number }>
  }
  return db.prepare(`
    SELECT property, COUNT(*) as count
    FROM Claim
    GROUP BY property
    ORDER BY count DESC, property
  `).all() as Array<{ property: string; count: number }>
}

// ─── Relationship paths ───────────────────────────────────────────────────────

export interface RelHop {
  claim_id: number
  subject_id: number
  property: string
  object_id: number
}

export interface RelPath {
  hops: RelHop[]
  intermediate_id?: number
}

export interface RelationshipResult {
  paths: RelPath[]
  entities: Record<number, { id: number; type: string; primary_label: string }>
}

export function findRelationshipPaths(a: number, b: number): RelationshipResult {
  if (a === b) return { paths: [], entities: {} }
  const db = getDb()

  // Entity-valued claims touching a
  const aEdges = db.prepare(`
    SELECT id, subject_entity_id as subj, property, object_entity_id as obj
    FROM Claim
    WHERE object_entity_id IS NOT NULL
      AND (subject_entity_id = ? OR object_entity_id = ?)
  `).all(a, a) as Array<{ id: number; subj: number; property: string; obj: number }>

  const paths: RelPath[] = []

  // Direct hops (1-hop): claims directly connecting a and b
  for (const e of aEdges) {
    if ((e.subj === a && e.obj === b) || (e.subj === b && e.obj === a)) {
      paths.push({ hops: [{ claim_id: e.id, subject_id: e.subj, property: e.property, object_id: e.obj }] })
    }
  }

  // Intermediate candidates: the other endpoint of a-edges (excluding b and a itself)
  const intermediates = new Set<number>()
  for (const e of aEdges) {
    const other = e.subj === a ? e.obj : e.subj
    if (other !== a && other !== b) intermediates.add(other)
  }

  for (const x of intermediates) {
    const xToBEdges = db.prepare(`
      SELECT id, subject_entity_id as subj, property, object_entity_id as obj
      FROM Claim
      WHERE object_entity_id IS NOT NULL
        AND ((subject_entity_id = ? AND object_entity_id = ?)
          OR (subject_entity_id = ? AND object_entity_id = ?))
    `).all(x, b, b, x) as Array<{ id: number; subj: number; property: string; obj: number }>

    if (xToBEdges.length === 0) continue

    const aToXEdges = aEdges.filter(e => (e.subj === a && e.obj === x) || (e.subj === x && e.obj === a))

    for (const first of aToXEdges) {
      for (const second of xToBEdges) {
        paths.push({
          hops: [
            { claim_id: first.id, subject_id: first.subj, property: first.property, object_id: first.obj },
            { claim_id: second.id, subject_id: second.subj, property: second.property, object_id: second.obj },
          ],
          intermediate_id: x,
        })
      }
    }
  }

  // Resolve display info for all involved entities
  const involved = new Set<number>([a, b])
  for (const p of paths) {
    if (p.intermediate_id) involved.add(p.intermediate_id)
  }
  const entities: RelationshipResult['entities'] = {}
  if (involved.size > 0) {
    const idList = [...involved]
    const placeholders = idList.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT e.id, e.type,
        COALESCE((SELECT l.value FROM Label l WHERE l.entity_id = e.id AND l.is_primary = 1 LIMIT 1), '(no label)') as primary_label
      FROM Entity e
      WHERE e.id IN (${placeholders})
    `).all(...idList) as Array<{ id: number; type: string; primary_label: string }>
    for (const r of rows) entities[r.id] = r
  }

  return { paths, entities }
}

// ─── Export queries ───────────────────────────────────────────────────────────

export function getAllEntitiesForExport(entityIds?: number[]): EntityDetail[] {
  const db = getDb()
  let ids: number[]

  if (entityIds && entityIds.length > 0) {
    ids = entityIds
  } else {
    const rows = db.prepare('SELECT id FROM Entity').all() as { id: number }[]
    ids = rows.map(r => r.id)
  }

  return ids.map(id => getEntityDetail(id)).filter((e): e is EntityDetail => e !== null)
}
