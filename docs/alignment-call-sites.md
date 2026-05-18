# Alignment call-site snapshot

Produced for Phase 0, Step 0.1 of `docs/alignment-plan.md`.
Lists every file that consumes the four contracts about to change.

---

## Mention uniqueness (`entity_id, source_id` → `entity_id, source_id, surface_form`)

### Server
- **`src/server/db/queries.ts:522`** — `createMention`: existence check uses
  `WHERE entity_id = ? AND source_id = ?` (two-column, must change to three).
- **`src/server/routes/mentions.ts:11`** — calls `createMention(body)` passing
  `entity_id`, `source_id`, `surface_form`; body validation already requires
  all three fields.
- **`src/server/routes/sources.ts:125-145`** — `confirm-all` handler calls
  `createMention` per match, using `match.surface_form`. Iterates matches
  without surface-form grouping; may collapse different surface forms onto
  the same row under the old uniqueness rule.
- **`src/server/matching/engine.ts`** — determines `confirmed` status per
  match; lookup is on `(source_id, entity_id)` rather than
  `(source_id, surface_form)` (Phase 4.1 target).

### Client
- **`src/client/components/SourceViewer/EntityPanel.tsx:339,352`** —
  calls `api.mentions.create({ entity_id, source_id, surface_form })`.
  No change required here; it already passes all three fields.

---

## Claim subject (`subject_entity_id` non-null → nullable + `subject_label`)

### Server
- **`src/server/db/queries.ts:94-103`** — `Claim` interface:
  `subject_entity_id: number` (NOT NULL, must become nullable).
- **`src/server/db/queries.ts:193-204`** — `mapClaim`: reads
  `subject_entity_id` with no null handling.
- **`src/server/db/queries.ts:541-560`** — `createClaim`: writes
  `subject_entity_id` only; no `subject_label` column.
- **`src/server/db/queries.ts:567-582`** — `updateClaim`: does not handle
  `subject_label` or `subject_entity_id` promotion.
- **`src/server/db/queries.ts:363-378`** — `getEntityDetail` claim query:
  selects `c.*` so new columns will appear automatically once schema changes.
- **`src/server/routes/claims.ts:27-46`** — POST handler requires
  `subject_entity_id`; no `subject_label` support.
- **`src/server/routes/claims.ts:48-56`** — PATCH handler: doesn't accept
  `subject_entity_id` or `subject_label`.

### Client
- **`src/client/api/types.ts:77-89`** — `Claim` interface:
  `subject_entity_id: number` (must become `number | null`); no
  `subject_label` field.
- **`src/client/components/SourceViewer/EntityPanel.tsx:38,51`** — claim
  creation calls always supply `subject_entity_id: entity.id`.
- **`src/client/components/Entities/EntityDetail.tsx:188`** — add-claim
  handler passes `subject_entity_id: entity.id`.

---

## Hardcoded entity types (`EntityType` union → `string`)

### Server
- **`src/server/db/queries.ts:10-19`** — `EntityType` union with 9 literals.
- **`src/server/db/queries.ts:350-353`** — `getEntityById` returns
  `{ id: number; type: EntityType }`.
- **`src/server/db/queries.ts:416`** — `createEntity` parameter typed
  `type: EntityType`.
- **`src/server/db/queries.ts:426`** — `updateEntity` parameter typed
  `type?: EntityType`.
- **`docs/schema.sql:41-51`** — CHECK constraint on `Entity.type` listing
  the 9 literals (must be dropped; schema migration required).

### Client
- **`src/client/api/types.ts:5-14`** — `EntityType` union and `ENTITY_TYPES`
  constant array with 9 literals.
- **`src/client/api/client.ts:53,62,64,120`** — API methods typed against
  `EntityType`.
- **`src/client/components/PropertyPicker.tsx:9`** — `subjectType?: EntityType`.
- **`src/client/components/ClaimRow.tsx:10,123,175`** — `subjectType?: EntityType`,
  `default_entity_type` cast to `EntityType`.
- **`src/client/components/SourceViewer/SourceViewer.tsx:172,197,237,432`** —
  `EntityType` used as action discriminant; `ENTITY_TYPES.map` drives the
  static type-button strip.
- **`src/client/components/Entities/EntityDetail.tsx:135,225,229`** —
  type-change handler and dropdown driven by `ENTITY_TYPES`.
- **`src/client/data/ontology.ts:2,56`** — `getCuratedProperties` parameter
  typed `EntityType`.

---

## Property source (hardcoded list → `/api/ontology`)

### Server
- **`src/server/ontology/loader.ts`** — compiles `CompiledOntology`; exposes
  `by_key` and `classes` but not a `templates` list (Phase 3 target).
- **`src/server/routes/ontology.ts`** — serves `GET /api/ontology`; does not
  yet include `templates` in the response.

### Client
- **`src/client/data/ontology.ts:56-60`** — `getCuratedProperties` already
  reads from the ontology cache; no hardcoded list here.
- **`src/client/components/PropertyPicker.tsx:4,50`** — imports and calls
  `getCuratedProperties` from the ontology module (already ontology-driven;
  no `properties.ts` import).
- **`src/client/components/ClaimRow.tsx:4`** — imports `ENTITY_TYPES` from
  `types.ts` (for new-entity type buttons); property shapes come from
  ontology.
- **`src/client/components/SourceViewer/SourceViewer.tsx:432`** —
  `ENTITY_TYPES.map` renders the static entity-creation button strip
  (Phase 5.2 replacement target).

### Note
`src/client/data/properties.ts` was **not found** — the step that deletes it
(Step 5.1) may already be partially done, or the file was never created.
`getCuratedProperties` is already sourced from the ontology cache.

---

## `wikidata_qid` / `wikidata_confirmed` convenience fields (Phase 1.1 / 2.5)

### Server
- **`src/server/db/queries.ts:42-43`** — `Entity` interface fields.
- **`src/server/db/queries.ts:154-155`** — `mapEntity` reads them.
- **`src/server/db/queries.ts:214-215`** — `ENTITY_AGGREGATE_SQL` computes
  them via correlated sub-selects from `ExternalID`.
- **`src/server/routes/export.ts:89`** — CSV export header includes
  `wikidata_qid`.

### Client
- **`src/client/api/types.ts:39-40`** — `Entity` interface fields.
- **`src/client/components/SourceViewer/EntityPanel.tsx:101,211`** —
  renders `entity.wikidata_qid` inline.
- **`src/client/components/Entities/EntityList.tsx:147-150`** — renders
  Wikidata badge from `entity.wikidata_qid`.
