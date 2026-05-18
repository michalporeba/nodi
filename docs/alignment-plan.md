# Implementation alignment plan

Goal: bring the current implementation in line with `docs/PRD.md` and the
supporting design docs (`docs/terms.md`, `docs/ARCHITECTURE.md`,
`docs/api.md`, `docs/ui.md`, `docs/matching.md`, `docs/ontology-plan.md`).

This plan is written for an agent to execute one step at a time. Each step
should produce a self-contained commit with explicit verification.

## Conventions for every step

- **Scope**: do only what the step describes. Resist refactor scope creep.
- **Backwards compatibility**: where the PRD direction is incompatible with
  the current contract (e.g. claim subject becoming nullable), keep older
  call sites working by treating the missing data as a default until the
  client is updated, then remove the fallback in the cleanup step at the
  end of the phase.
- **Migrations**: SQLite cannot drop or alter constraints in place. To
  change a constraint, create a new table, copy data, drop old, rename.
  Follow the additive pattern already in `src/server/db/client.ts` lines
  21-23 — wrap migration SQL in `try {} catch {}` so it is idempotent.
- **Verification**: each step lists how to confirm it worked. Where the
  codebase has no automated tests, that is a manual recipe (run the dev
  server, hit endpoint, inspect output). Add a one-off script under
  `scripts/` only if the step explicitly says so.
- **Schema vs `docs/schema.sql`**: `docs/schema.sql` is loaded on every
  startup (see `src/server/db/client.ts:18`), so changes there apply to
  fresh databases. Existing databases need an additive migration in the
  same file or in `client.ts`.

---

## Phase 0 — preparation

### Step 0.1: snapshot the current call sites for the affected contracts

Goal: produce a short note listing every file that consumes the contracts
about to change, so later steps know what to update.

- Read `src/server/routes/mentions.ts`, `src/server/routes/claims.ts`,
  `src/server/db/queries.ts`, and every client file under
  `src/client/components/` that references `mention`, `claim`,
  `subject_entity_id`, or `surface_form`.
- Write the findings to `docs/alignment-call-sites.md` (one short section
  per contract: Mention uniqueness, Claim subject, hardcoded entity types,
  property source).

Verification: `docs/alignment-call-sites.md` exists and lists at least the
files this plan references in Phases 1–5.

---

## Phase 1 — schema foundations

### Step 1.1: drop `wikidata_qid` and `wikidata_confirmed` from the typed Entity row

Goal: align the typed `Entity` interface with `docs/ARCHITECTURE.md:88`
("There is no special `wikidata_qid` column on Entity"). These are computed
columns from `ENTITY_AGGREGATE_SQL` in `src/server/db/queries.ts:208-217`,
not actual columns, but they are surfaced into the API response (see
`docs/api.md` line 151).

- Remove `wikidata_qid` and `wikidata_confirmed` from the `Entity`
  interface in `src/server/db/queries.ts:36-45`.
- Remove the two `wikidata_*` SELECTs from `ENTITY_AGGREGATE_SQL`.
- Update `mapEntity` accordingly.
- Update `src/client/api/types.ts` (mirror).
- Update any client component that read those fields. Replace with the
  existing `external_ids` array (filter for `system === 'wikidata' &&
  confirmed`).
- Update `docs/api.md` example responses to drop the two fields.

Verification: `bun run dev`, open an entity in the UI. Reconciled entities
still show the Wikidata badge (rendered from `external_ids`).

### Step 1.2: add a `Mention.surface_form` to the uniqueness constraint

Goal: allow distinct mentions for different surface forms referring to
the same entity in the same source (PRD line 320,
`docs/terms.md` Mention section).

- In `docs/schema.sql`, change the `UNIQUE(entity_id, source_id)` on
  `Mention` (line 97) to `UNIQUE(entity_id, source_id, surface_form)`.
- Add an idempotent migration in `src/server/db/client.ts` (after the
  existing `origin` migration) using the SQLite table-swap pattern:
  1. `CREATE TABLE Mention_new (... UNIQUE(entity_id, source_id, surface_form))`
  2. `INSERT INTO Mention_new SELECT * FROM Mention`
  3. `DROP TABLE Mention`
  4. `ALTER TABLE Mention_new RENAME TO Mention`
  5. Recreate the indices.
  Wrap the whole thing in a guard that checks the current constraint via
  `PRAGMA index_list(Mention)` and skips if already migrated.

Verification: open a SQLite shell, run `PRAGMA index_list(Mention)`. The
unique index should now cover three columns. Insert two rows with the
same `(entity_id, source_id)` but different `surface_form` values — both
should succeed.

### Step 1.3: update `createMention` to honour the new uniqueness

Goal: stop collapsing different surface forms onto the same row.

- In `src/server/db/queries.ts:520-532`, change the existence check to
  match on `(entity_id, source_id, surface_form)`. Update the inline
  comment.
- Update `docs/api.md` for `POST /api/mentions` (line 259): "If a Mention
  already exists for this (entity, source, surface_form) tuple, returns
  the existing row."
- Update `docs/ARCHITECTURE.md` line 72 to match.

Verification: `POST /api/mentions` twice with the same entity_id and
source_id but different surface_form — second call returns a new row,
not the first.

### Step 1.4: make `Claim.subject_entity_id` nullable and add `subject_label`

Goal: support label-first claim capture (PRD Claims section, line 414
"Current implementation note"). A claim's subject may begin as a plain
text label and be promoted to an entity later.

- In `docs/schema.sql`, change `subject_entity_id INTEGER NOT NULL` to
  `subject_entity_id INTEGER` (nullable). Add a new column
  `subject_label TEXT`.
- Add a CHECK constraint: at least one of `subject_entity_id` or
  `subject_label` must be non-null.
- Add the additive migration to `src/server/db/client.ts` using the
  table-swap pattern (CHECK constraints cannot be added in place).
- Update the `Claim` interface in `src/server/db/queries.ts:94-103` and
  in `src/client/api/types.ts`.
- Update `mapClaim`, `createClaim`, `updateClaim`, and the row builders
  in `getEntityDetail` to read/write `subject_label`.

Verification: insert a claim with `subject_label` set and
`subject_entity_id NULL`. Insert another with neither — should fail the
CHECK constraint. Existing claims continue to load.

### Step 1.5: add a `notable` flag to Claim

Goal: support the notability marker (PRD Notability and Export Readiness
section, `docs/terms.md` Notability Marker).

- In `docs/schema.sql`, add `notable INTEGER NOT NULL DEFAULT 0` to
  `Claim`.
- Add an idempotent migration:
  `try { db.exec("ALTER TABLE Claim ADD COLUMN notable INTEGER NOT NULL DEFAULT 0") } catch {}`
- Update the `Claim` interface and `mapClaim` in
  `src/server/db/queries.ts`. Update `src/client/api/types.ts`.

Verification: `PRAGMA table_info(Claim)` lists the `notable` column.
Existing claims load with `notable = 0`.

### Step 1.6: drop the hardcoded entity-type CHECK constraint

Goal: entity types must come from the active ontology, not the schema
(PRD Entities and Labels section). The CHECK constraint at
`docs/schema.sql:41-51` hardcodes the 9 current types.

- In `docs/schema.sql`, drop the CHECK on `Entity.type` — keep the column
  as `TEXT NOT NULL`.
- Add a table-swap migration to remove the CHECK from existing databases.
- Remove the hardcoded `EntityType` union in `src/server/db/queries.ts:10-19`
  and replace with `export type EntityType = string`.
- Same in `src/client/api/types.ts`.

Verification: create an entity with a type not in the previous union
(e.g. `Tune`) via `POST /api/entities`. It succeeds.

---

## Phase 2 — server contracts

### Step 2.1: claim creation accepts a label-first subject

Goal: align `POST /api/claims` with the schema change in 1.4.

- In `src/server/routes/claims.ts:27-46`, accept `subject_label` as an
  alternative to `subject_entity_id`. Reject the request if both are
  missing.
- Update `createClaim` in `src/server/db/queries.ts:541-560` to write
  both columns.
- Update `docs/api.md` `POST /api/claims` section to document the new
  field and acceptance rules.

Verification: `POST /api/claims` with `{ "subject_label": "Megan
Harries", "property": "occupation", "value": "actor" }` (no
`subject_entity_id`) succeeds. The claim is retrievable.

### Step 2.2: add claim promotion endpoints

Goal: promote a `subject_label`-only claim to an `subject_entity_id`
claim (`docs/terms.md` Promotion section).

- Add `PATCH /api/claims/:id` support for setting `subject_entity_id`
  while clearing `subject_label`. The current handler in
  `src/server/routes/claims.ts:48-56` covers `value`,
  `object_entity_id`, and `property` — extend it.
- Document the new patch shape in `docs/api.md` "Common edits".

Verification: create a label-first claim from Step 2.1, then PATCH with
`{ "subject_entity_id": 123, "subject_label": null }`. Re-fetch — the
claim now points at entity 123 and `subject_label` is null.

### Step 2.3: notability PATCH on a claim

Goal: surface the notability flag through the API.

- Extend `PATCH /api/claims/:id` to accept `notable: boolean`.
- Update `updateClaim` in `src/server/db/queries.ts:567-582` to handle
  the field.
- Document in `docs/api.md`.

Verification: PATCH `notable: true` on an existing claim. GET the
entity detail — the claim's `notable` field is `true`.

### Step 2.4: claim list / detail responses include `subject_label` and `notable`

Goal: every place the API returns a claim must surface the new fields.

- Audit `getEntityDetail` in `src/server/db/queries.ts:355-402`, the
  relationship paths response, and the export query.
- Update the response shapes so claims always carry both new fields.
- Update `docs/api.md` example responses.

Verification: hit `GET /api/entities/:id` for an entity with at least
one label-first claim. The response includes the new fields.

### Step 2.5: align the `Entity` API response with Step 1.1

Goal: cleanup follow-up — if Step 1.1 left any callers reading
`wikidata_qid` from `GET /api/entities`, finish them off.

- `grep -rn "wikidata_qid\|wikidata_confirmed" src/`.
- Replace each with the `external_ids` array filter pattern.

Verification: `grep` returns no application-code matches outside
historical migration code.

---

## Phase 3 — ontology evolution

### Step 3.1: add class templates to the ontology loader

Goal: support the class-template concept (PRD Ontology section, `docs/terms.md`
Class Template).

- Extend `src/server/ontology/loader.ts`:
  - Read a new shape per class: `nodi:Template` predicate (or
    `rdfs:subClassOf` chains marked with a `nodi:template` flag —
    decide and document).
  - Compile a `templates: TemplateShape[]` field on `CompiledOntology`.
  - A `TemplateShape` carries: name (label), target class (the
    `type` of the entity it creates), and a list of seed claims
    (property + value, where value can reference another class).
- Add unit-style coverage via a small script under `scripts/` that
  loads the TTL and dumps the compiled `templates` list — used as the
  manual verification step.

Verification: run the dump script. The compiled output lists every
`rdfs:Class` from the TTL as a degenerate template (target class only,
no seed claims) and any explicit role-template (once 3.2 adds them) as
a template with seed claims.

### Step 3.2: add explicit class templates to `welsh-film-tv.ttl`

Goal: move role recipes from per-property `nodi:roleLabel` /
`nodi:seedClaim` to dedicated class templates (PRD
Ontology section requirements).

- In `data/ontology/welsh-film-tv.ttl`, add `nodi:Actor`, `nodi:Director`,
  `nodi:Screenwriter`, `nodi:Producer`, `nodi:Composer`,
  `nodi:FilmEditor`, `nodi:VoiceActor` as templates that produce a
  `nodi:Person` with `occupation = <role>` seed.
- Keep the existing per-property `nodi:roleLabel` / `nodi:seedClaim`
  triples in place for now — they remain a fallback until the UI fully
  switches to template-based promotion (Step 5.4).

Verification: the dump script from 3.1 lists the new templates with
their target class and seed claims.

### Step 3.3: `GET /api/ontology` returns templates

Goal: surface the new templates to the client.

- Extend `src/server/routes/ontology.ts` to include the
  `templates` field in the JSON response.
- Update the client-side cache in `src/client/data/ontology.ts` and
  the types in `src/client/api/types.ts`.

Verification: `curl /api/ontology` includes a non-empty `templates`
array; each entry has `name`, `target_class`, and `seed_claims`.

### Step 3.4: `NODI_ONTOLOGY` accepts a list

Goal: support an active set of one or more domain ontologies (PRD
Ontology section, "active set").

- In `src/server/ontology/loader.ts:39-45`, change `ontologyPath()` to
  return a list (split `NODI_ONTOLOGY` on `,`). Default to a single
  path when the env var is unset.
- Change `loadOntology` to load and *union* across paths. Properties
  with the same `iri` from multiple files de-duplicate by IRI. Templates
  retain a `source: <ontology file basename>` field for provenance.
- Update `docs/ontology-plan.md` Phase 4 status notes (mark "list of
  paths" as done; in-app selector still outstanding).
- Update `docs/PRD.md` Ontology section line 446 *only* if needed to
  reflect implementation status — the PRD itself does not need
  changing; this is just the env-var direction.

Verification: set `NODI_ONTOLOGY=data/ontology/welsh-film-tv.ttl,data/ontology/test-empty.ttl`
(create the second file as an empty TTL). Server starts; ontology
endpoint returns the union.

---

## Phase 4 — server matching and mentions

### Step 4.1: matching engine reports per-surface-form mentions

Goal: align matching with the new mention uniqueness (Step 1.2). A
`confirmed` match should reflect *the surface form's* confirmed
mentions, not all of the entity's mentions in the source.

- In `src/server/matching/engine.ts`, change the confirmed-mention
  lookup to key on `(source_id, surface_form)` instead of
  `(source_id, entity_id)`.
- Update `docs/matching.md` § 3 ("Resolve confirmation status") to
  match.

Verification: with two confirmed mentions of the same entity at
different surface forms ("Megan Harries" and "Megan H"), both render as
`confirmed` rather than the second being `suggested`.

### Step 4.2: `POST /api/sources/:id/mentions/confirm-all` honours
surface-form-aware uniqueness

Goal: same alignment for bulk confirmation.

- In `src/server/routes/sources.ts` (confirm-all handler), iterate
  matches grouped by `(label_value, surface_form)` and create one
  mention per group.
- Update `docs/api.md` for the endpoint.

Verification: a source with the same entity appearing under two surface
forms — confirm-all creates two mention rows, not one.

---

## Phase 5 — client (foundational)

### Step 5.1: PropertyPicker sources from `GET /api/ontology`

Goal: remove the hardcoded property list (PRD Ontology section,
`docs/ontology-plan.md` Phase 1 outstanding work).

- In `src/client/components/PropertyPicker.tsx`, replace the
  `getCuratedProperties` import / usage with the ontology cache from
  `src/client/data/ontology.ts`.
- Apply the same change in `src/client/components/ClaimRow.tsx`
  (`TextClaimEditor`, `EntityClaimEditor`).
- Delete `src/client/data/properties.ts` once `grep` shows no
  remaining imports.

Verification: render the property picker on a Series entity. It still
shows `cast_member`, `director`, etc., now sourced from the API.
Network panel shows a single `GET /api/ontology`.

### Step 5.2: entity-creation buttons become a class-template picker

Goal: replace the hardcoded `[Person] [Character] [FictionalPerson]
[Film] …` strip in the claim popover and entity-creation flows with a
template picker (`docs/ui.md` updated section).

- In `src/client/components/SourceViewer/EntityPanel.tsx`, replace the
  static per-type buttons with a list rendered from
  `ontology.templates`. Each button uses the template `name`; the
  `title` attribute shows the source ontology basename.
- When the user picks a template, the create call POSTs an entity of
  the template's `target_class` and then POSTs each `seed_claim` as a
  Claim. Show a loading state until both complete.

Verification: pick "Actor" from the template strip. A `Person` entity
is created with an `occupation = actor` claim attached, in a single
user gesture.

### Step 5.3: claim entry supports a label-first subject

Goal: surface the schema/API change from Steps 1.4 and 2.1 in the UI.

- In `src/client/components/SourceViewer/EntityPanel.tsx` claim
  popover, allow the subject field to remain a plain text label when
  the user has not selected an active topic.
- Show a small "promote to entity" affordance on label-first claim
  rows in the entity detail and source viewer claim lists.

Verification: with no active topic, type a free-text predicate label
and value, hit save. A claim is created with `subject_label` set and
`subject_entity_id NULL`. The claim renders correctly in the entity
detail.

### Step 5.4: drop the per-property `roleLabel` fallback in UI promotion

Goal: now that templates are the canonical mechanism (Step 5.2),
remove the legacy fallback path.

- Find the call sites that read `property.role_label` or per-property
  `seed_claims` (start with `EntityPanel.tsx` and `ClaimRow.tsx`).
- Replace with template lookup keyed on the property's
  `class_range` / `default_entity_type`.
- Once UI no longer references them, optionally trim the per-property
  triples from `welsh-film-tv.ttl` in a follow-up commit.

Verification: promoting a text value in a `cast_member` claim opens
the template picker with `Actor` preselected (since `class_range =
Person` and template metadata maps roles back to properties).

---

## Phase 6 — client (features)

### Step 6.1: notability toggle on every claim row

Goal: ship the notability marker UI (`docs/ui.md` Notability Marker
paragraph).

- In `src/client/components/ClaimRow.tsx`, add a ☆/★ toggle next to
  the value. State backed by `claim.notable` from the API.
- Toggle issues `PATCH /api/claims/:id { notable: !current }`.
- Add the marker to entity detail and source viewer claim lists.

Verification: toggle on/off; reload; state persists.

### Step 6.2: export form gets the three-tier readiness control

Goal: implement the three-tier export readiness selector
(`docs/ui.md` updated Export section).

- In `src/client/components/Export/ExportView.tsx`, replace the
  current scope radios with three readiness options: *Everything
  captured*, *Ontology-mapped*, *Ready for external publication*.
- Add a domain-scope selector (multi-select over the templates list
  grouped by source ontology basename).
- The download URL adds `readiness=<level>&domains=<comma-list>` query
  params.

Verification: choosing *Ready for external publication* and
downloading produces a smaller file than *Everything captured* (since
unresolved labels are dropped).

### Step 6.3: domain selector (active set) in the sidebar

Goal: let the user pick which loaded ontologies are active (PRD
Ontology section, Step 3.4 server-side).

- Add a small "Domains" section to `src/client/components/Sidebar.tsx`
  with a checkbox per loaded ontology file.
- Persist the user's selection in `localStorage` (and surface to the
  matching engine via a `domains` query param in
  `GET /api/sources/:id/matches`).
- Server-side: filter the label index by entities whose claims point
  to types defined in the selected ontologies, OR by an explicit
  per-entity domain tag if added in a future step. For now, accept the
  param and ignore-with-warning if multi-domain loading is not yet
  wired through queries.

Verification: load two ontologies; deselect one in the sidebar;
suggestions in the property picker shrink to the still-selected
ontology's properties.

---

## Phase 7 — server export and readiness

### Step 7.1: claim queries support readiness filters

Goal: server-side filtering for the three readiness levels.

- Add `getClaimsByReadiness(level, domainScope?)` to
  `src/server/db/queries.ts`. Levels:
  - *Everything*: all claims (including `subject_label` only).
  - *Ontology-mapped*: claims where `property` exists in `pid_map` OR
    in `by_key` for the active set.
  - *Ready for external publication*: ontology-mapped AND
    (`notable = 1` OR subject entity has a confirmed `wikidata`
    external ID).
- Adjust `getAllEntitiesForExport` to accept these parameters.

Verification: a small dump script (or curl with `?readiness=*`) shows
the three levels produce different claim counts.

### Step 7.2: Turtle export honours readiness + adds named graphs

Goal: implement the named-graphs option (`docs/ui.md` Export section)
and respect readiness filters.

- In `src/server/routes/export.ts`, accept `?readiness=<level>` and
  `?domains=<list>` and `?format=turtle|nquads` query params.
- For `format=nquads`, emit each claim into a named graph derived from
  its `mention_id` or `source_id`, using `n3.Writer` with `format:
  'application/n-quads'`.
- For unresolved label-only subjects/objects, emit a `rdfs:label`
  triple with no IRI ("blank node + label only") so the *Everything
  captured* level doesn't silently drop data.

Verification: download Turtle and N-Quads from the new UI. The
N-Quads file contains `<...> <...> <...> <source-graph>` lines.
*Everything captured* contains weakly structured claims that
*Ontology-mapped* drops.

### Step 7.3: add CSVW export

Goal: tabular export with schema metadata (`docs/ui.md` Export section).

- Add `GET /api/export/csvw` returning a zip containing one CSV per
  entity type AND a `metadata.json` file conforming to the CSVW spec
  (https://www.w3.org/TR/tabular-metadata/).
- Drive column choice and datatype hints from the ontology.

Verification: download the zip. Open `metadata.json`; it references
each CSV file and lists its columns with `propertyUrl` mappings to
Wikidata PIDs where defined.

### Step 7.4: add QuickStatements export

Goal: Wikidata-oriented batch export (`docs/ui.md` Export section).

- Add `GET /api/export/quickstatements` returning a text/plain
  QuickStatements v2 batch (https://www.wikidata.org/wiki/Help:QuickStatements).
- Only emit claims that are: ontology-mapped AND have a Wikidata PID
  AND the subject entity has a confirmed `wikidata` external ID.
- Skip claims whose object is an entity without a Wikidata external ID
  (or fall back to label-only with a `# warning` comment).

Verification: an entity reconciled to Wikidata with a `cast_member`
claim pointing at another reconciled entity produces a line like
`Q123\tP161\tQ456`. Add the new format option to the UI.

---

## Phase 8 — cosmetic and doc cleanup

### Step 8.1: rename `subject` terminology where appropriate

Goal: `docs/ARCHITECTURE.md` "Sources and subjects" section uses
"subject" both for the source's page topic and for a claim's subject
entity. The PRD/terms vocabulary uses "page topic" for the first.

- Rename the heading and prose in `docs/ARCHITECTURE.md` from
  "Sources and subjects" to "Sources and page topics".
- Leave the schema column name `subject_entity_id` on `Source` alone
  (renaming is a separate, larger migration).
- Add a one-line note: "The column is named `subject_entity_id` for
  historical reasons; the conceptual term is *page topic*."

Verification: search `docs/ARCHITECTURE.md` for the word "subject" —
remaining occurrences are either schema column names or a claim's
subject entity, not a source's page topic.

### Step 8.2: re-frame `docs/ARCHITECTURE.md` "Mentions" section

Goal: align Mention prose with the new uniqueness (Step 1.2-1.3).

- In `docs/ARCHITECTURE.md:71-74`, replace "One mention row per (entity,
  source) pair" with "One mention row per (entity, source, surface
  form) triple." Adjust surrounding text.

Verification: docs read consistently with the schema and the
matching engine.

### Step 8.3: re-frame `docs/ARCHITECTURE.md` "Source content" sentence

Goal: align with PRD non-goal about immutable snapshots (PRD non-goals).

- In `docs/ARCHITECTURE.md:51`, change "This snapshot is what the
  annotation layer works against, ensuring annotations remain valid
  even if the live page changes" to language consistent with
  `docs/matching.md` (the cache is for inspection; durable annotations
  do not depend on it).

Verification: the phrasing matches the matching.md framing.

### Step 8.4: cross-reference `docs/issues.md` items to PRD risks

Goal: link each item in `docs/issues.md` to the corresponding
`docs/PRD.md` § Known Product Risks bullet for easier triage.

Verification: each issue references either a PRD risk line or a step
in this plan.

---

## Phase 9 — tightening (deferred until earlier phases are stable)

### Step 9.1: introduce request-body validation at API boundaries

Goal: address `docs/issues.md` item 4 ("API boundary is typed but not
validated enough"). Use a small validation library (e.g. `zod` or a
custom guard) rather than `as any` casts.

Verification: malformed POSTs to `/api/entities`, `/api/claims`,
`/api/mentions` return 400 with a structured error.

### Step 9.2: replace `window.prompt` and bulk-action keyboard shortcuts

Goal: address `docs/issues.md` item 5. Out of scope for the data-model
alignment but listed for completeness.

### Step 9.3: tighten the source content rendering (HTML sandboxing)

Goal: address `docs/issues.md` item 1.

---

## Suggested ordering

The phases can run sequentially, but within each phase several steps are
independent and parallelisable:

- **Phase 1** steps 1.1, 1.5, 1.6 are independent of 1.2-1.4.
- **Phase 2** depends on 1.2 (Step 2.4) and 1.4-1.5 (Steps 2.1-2.3).
- **Phase 3** is independent of Phases 1-2 except where the client
  later consumes templates.
- **Phase 4** depends on Phase 1.
- **Phase 5** depends on Phases 1-3.
- **Phase 6** depends on Phase 5.
- **Phase 7** depends on Phases 1 and 3.
- **Phase 8** can run at any time after the corresponding earlier step.
- **Phase 9** is deferred.

## Out of scope

The following are out of scope for this plan, listed so they don't get
silently picked up:

- A formal test framework. Verification recipes remain manual.
- An in-app ontology editor (`docs/ontology-plan.md` § In-app editor).
- Adding domains beyond Welsh film and television. The structural work
  here makes adding `welsh-traditional-music.ttl` and
  `caves-and-caving.ttl` trivial; producing those ontologies is a
  separate content task.
- Reconciliation targets beyond Wikidata.
- LLM-assisted suggestions.
- A real-time multi-user sync layer.
