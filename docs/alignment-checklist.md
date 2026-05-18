# Alignment verification checklist

Companion to `docs/alignment-plan.md`. Each step in the plan has a
verification recipe; this file lifts those recipes into a flat checklist
so an agent or reviewer can run through them as steps land.

## How to use

- Tick boxes as verifications pass.
- If a verification fails, fix it before moving on to the next step in
  the same phase. Phase-to-phase ordering is described in
  `docs/alignment-plan.md` § Suggested ordering.
- Prerequisites that apply to most steps:
  - Server is running locally (`bun run dev`). Default base URL
    `http://localhost:3000`.
  - `sqlite3 data/nodi.db` opens an interactive shell against the live
    database.
  - At least one entity, source, and claim exist for the UI checks.

---

## Phase 0 — preparation

### Step 0.1 — call-site snapshot

- [ ] `docs/alignment-call-sites.md` exists.
- [ ] It contains at least one section per contract: Mention uniqueness,
  Claim subject, hardcoded entity types, property source.
- [ ] Each section lists the files that read or write that contract.

---

## Phase 1 — schema foundations

### Step 1.1 — drop `wikidata_qid` / `wikidata_confirmed` from `Entity`

- [ ] `grep -rn "wikidata_qid\|wikidata_confirmed" src/` returns no
  application-code matches.
- [ ] `GET /api/entities/:id` response no longer contains those keys.
- [ ] In the UI, reconciled entities still show their Wikidata badge
  (now rendered from the `external_ids` array).

### Step 1.2 — `Mention.surface_form` in uniqueness

- [ ] `sqlite3 data/nodi.db "PRAGMA index_list(Mention);"` shows a
  unique index covering `(entity_id, source_id, surface_form)`.
- [ ] Inserting two rows with the same `(entity_id, source_id)` and
  different `surface_form` values both succeed.
- [ ] Inserting a duplicate of the same `(entity_id, source_id,
  surface_form)` fails with a UNIQUE constraint error.

### Step 1.3 — `createMention` honours the new uniqueness

- [ ] `POST /api/mentions` with the same entity_id and source_id but
  different surface_form values produces two distinct rows.
- [ ] `POST /api/mentions` with the *exact same* triple returns the
  existing row (not a new insert).

### Step 1.4 — nullable claim subject + `subject_label`

- [ ] `sqlite3 data/nodi.db "PRAGMA table_info(Claim);"` lists
  `subject_label` and shows `subject_entity_id` is nullable.
- [ ] Insert a claim with `subject_label` set and `subject_entity_id
  NULL` — succeeds.
- [ ] Insert a claim with both fields NULL — fails the CHECK
  constraint.
- [ ] Existing claims still load via `GET /api/entities/:id` without
  errors.

### Step 1.5 — `notable` flag on Claim

- [ ] `sqlite3 data/nodi.db "PRAGMA table_info(Claim);"` lists
  `notable INTEGER NOT NULL DEFAULT 0`.
- [ ] Existing claims load with `notable = 0`.

### Step 1.6 — drop hardcoded entity-type CHECK

- [ ] `sqlite3 data/nodi.db ".schema Entity"` does NOT include a CHECK
  constraint on `type`.
- [ ] `POST /api/entities` with `{ "type": "Tune", "primary_label":
  "Tro Llaw" }` returns a 201 (no longer rejected).
- [ ] Existing entities still load.

---

## Phase 2 — server contracts

### Step 2.1 — label-first claim creation

- [ ] `POST /api/claims` with `{ "subject_label": "Megan Harries",
  "property": "occupation", "value": "actor" }` returns 201.
- [ ] `GET /api/entities/:id` on the claim's entity surface (or a new
  label-first listing endpoint) shows the claim with `subject_label`
  set and `subject_entity_id NULL`.
- [ ] `POST /api/claims` with neither subject field returns 400.

### Step 2.2 — claim subject promotion

- [ ] Create a label-first claim from Step 2.1.
- [ ] `PATCH /api/claims/:id` with `{ "subject_entity_id": <id>,
  "subject_label": null }` returns 200.
- [ ] Re-fetching the claim shows `subject_entity_id = <id>` and
  `subject_label = null`.

### Step 2.3 — notability PATCH

- [ ] `PATCH /api/claims/:id` with `{ "notable": true }` returns 200.
- [ ] `GET /api/entities/:id` shows the claim with `notable: true`.
- [ ] `PATCH /api/claims/:id` with `{ "notable": false }` reverses it.

### Step 2.4 — claim responses include `subject_label` and `notable`

- [ ] `GET /api/entities/:id` claim entries include both fields for
  every claim.
- [ ] `GET /api/relationships?from=A&to=B` hops include both fields.
- [ ] Export queries surface both fields where claims are emitted.

### Step 2.5 — cleanup of Wikidata convenience fields

- [ ] `grep -rn "wikidata_qid\|wikidata_confirmed" src/` returns no
  application-code matches.
- [ ] `grep -rn "wikidata_qid\|wikidata_confirmed" docs/` returns only
  historical references (PRD, plan, etc.), not API examples.

---

## Phase 3 — ontology evolution

### Step 3.1 — class templates in the loader

- [ ] A new script (e.g. `scripts/dump-ontology.ts`) prints the
  compiled `templates` list when run with `bun run
  scripts/dump-ontology.ts`.
- [ ] Every `rdfs:Class` in `data/ontology/welsh-film-tv.ttl` appears
  as a degenerate template (target class only, empty `seed_claims`).
- [ ] `CompiledOntology.templates` is exported from
  `src/server/ontology/loader.ts`.

### Step 3.2 — explicit class templates in TTL

- [ ] The dump script lists `Actor`, `Director`, `Screenwriter`,
  `Producer`, `Composer`, `FilmEditor`, `VoiceActor` as templates with
  `target_class = Person` and a `seed_claims` entry of the form
  `{ property: "occupation", value: "<role>" }`.

### Step 3.3 — templates exposed by the API

- [ ] `curl http://localhost:3000/api/ontology | jq '.templates'`
  returns a non-empty array.
- [ ] Each entry has `name`, `target_class`, and `seed_claims` fields.
- [ ] `src/client/data/ontology.ts` types include `templates`.

### Step 3.4 — `NODI_ONTOLOGY` accepts a list

- [ ] Create an empty TTL at `data/ontology/test-empty.ttl` (a single
  comment line is enough).
- [ ] `NODI_ONTOLOGY=data/ontology/welsh-film-tv.ttl,data/ontology/test-empty.ttl
  bun run dev` starts without error.
- [ ] `GET /api/ontology` returns the union of properties and classes
  from both files.
- [ ] With `NODI_ONTOLOGY` unset, server falls back to the default
  single file.

---

## Phase 4 — server matching and mentions

### Step 4.1 — matching keyed on surface form

- [ ] Setup: create one entity with labels "Megan Harries" and
  "Megan H". Create a source containing both. Confirm a mention with
  surface_form "Megan Harries" and another with surface_form
  "Megan H" (both pointing at the same entity).
- [ ] `GET /api/sources/:id/matches` returns both matches with
  `status: "confirmed"` (not one confirmed and one suggested).

### Step 4.2 — confirm-all is surface-form aware

- [ ] Setup as in 4.1, but without manually confirming.
- [ ] `POST /api/sources/:id/mentions/confirm-all` returns
  `{ confirmed: 2, … }`.
- [ ] `sqlite3 data/nodi.db "SELECT COUNT(*) FROM Mention WHERE
  source_id = <id>;"` reports 2 rows.

---

## Phase 5 — client (foundational)

### Step 5.1 — PropertyPicker reads from `/api/ontology`

- [ ] Open the source viewer in a browser. Open a claim popover and
  click into the Property field.
- [ ] Browser DevTools → Network shows exactly one
  `GET /api/ontology` call per page load (response cached client-side).
- [ ] The picker still shows `cast_member`, `director`, etc. on a
  Series subject.
- [ ] `grep -rn "src/client/data/properties" src/` returns no
  matches; `src/client/data/properties.ts` is deleted.

### Step 5.2 — class-template picker

- [ ] In the claim popover, the `+ new from template` strip shows
  buttons including plain classes (`Person`, `Film`) and role
  templates (`Actor`, `Director`).
- [ ] Hovering a template button surfaces the source ontology basename
  in the tooltip (`title` attribute).
- [ ] Picking `Actor` creates a `Person` entity AND a `occupation =
  actor` claim in a single user gesture.
- [ ] The new entity is visible in `GET /api/entities` immediately
  after.

### Step 5.3 — label-first claim entry in the UI

- [ ] Open a source viewer with no active topic set.
- [ ] Type a free-text predicate label and value in the claim popover
  and save.
- [ ] `GET /api/entities/:id` (or the new label-first listing) shows
  the new claim with `subject_label` set and `subject_entity_id NULL`.
- [ ] The label-first claim renders correctly in the entity detail
  page once a subject has been promoted.
- [ ] A "promote to entity" affordance appears on the label-first
  claim row.

### Step 5.4 — drop the legacy `roleLabel` fallback

- [ ] `grep -rn "role_label\|roleLabel" src/client/` returns no
  application-code matches.
- [ ] Promoting a text value in a `cast_member` claim opens the
  template picker with `Actor` preselected.
- [ ] The seeded `occupation = actor` claim still ends up on the new
  entity.

---

## Phase 6 — client (features)

### Step 6.1 — notability toggle on claim rows

- [ ] Each claim row displays a star toggle (☆ outline / ★ filled).
- [ ] Clicking the toggle flips `notable` and persists across a page
  reload.
- [ ] The toggle appears in both the entity detail and the source
  viewer's claim lists.

### Step 6.2 — three-tier readiness in the export form

- [ ] Open `/export`. The form shows three readiness radios:
  *Everything captured*, *Ontology-mapped*, *Ready for external
  publication*.
- [ ] A domain-scope multi-select lists every loaded ontology by
  basename.
- [ ] Downloading at *Everything captured* produces a strictly larger
  file than *Ontology-mapped* (provided the database contains
  label-first or off-ontology claims).
- [ ] *Ready for external publication* contains only claims that are
  ontology-mapped AND (`notable = 1` OR subject reconciled to
  Wikidata).

### Step 6.3 — domain selector

- [ ] Sidebar shows a Domains section with a checkbox per loaded
  ontology.
- [ ] Toggling a domain off persists across page reloads
  (`localStorage`).
- [ ] With one domain deselected, the property picker no longer offers
  properties exclusive to that domain.

---

## Phase 7 — server export and readiness

### Step 7.1 — readiness filters in claim queries

- [ ] Each of these produces a different claim count (assuming the
  database has mixed data):
  - `curl 'http://localhost:3000/api/export/turtle?readiness=everything' | wc -l`
  - `curl 'http://localhost:3000/api/export/turtle?readiness=mapped' | wc -l`
  - `curl 'http://localhost:3000/api/export/turtle?readiness=publication' | wc -l`

### Step 7.2 — named graphs in RDF export

- [ ] `curl 'http://localhost:3000/api/export/turtle?format=nquads&readiness=everything' > out.nq`
  produces an N-Quads file.
- [ ] `head out.nq` shows lines with four IRI/literal slots (subject,
  predicate, object, graph).
- [ ] The graph slot resolves to a source or mention IRI.
- [ ] At *Everything captured*, the output includes a triple for at
  least one label-first claim (subject blank-node + `rdfs:label`); at
  *Ontology-mapped*, that triple is absent.

### Step 7.3 — CSVW export

- [ ] `curl 'http://localhost:3000/api/export/csvw' -o out.zip`
  succeeds and `unzip -l out.zip` lists `metadata.json` plus one CSV
  per entity type.
- [ ] `jq '.tables' metadata.json` lists each CSV and its column
  schema.
- [ ] Columns whose property has a Wikidata PID include a
  `propertyUrl` referencing `http://www.wikidata.org/prop/direct/P…`.

### Step 7.4 — QuickStatements export

- [ ] Setup: an entity reconciled to Wikidata with at least one
  ontology-mapped claim pointing at another reconciled entity.
- [ ] `curl 'http://localhost:3000/api/export/quickstatements'`
  produces tab-separated lines of the form `Q123\tP161\tQ456`.
- [ ] Claims whose subject or object is not reconciled either appear
  as `# warning:` comment lines or are omitted (consistent across the
  output).
- [ ] The UI export form lists QuickStatements as an available
  format.

---

## Phase 8 — cosmetic and doc cleanup

### Step 8.1 — `subject` terminology in ARCHITECTURE.md

- [ ] Heading "Sources and subjects" renamed to "Sources and page
  topics".
- [ ] `grep -n "subject" docs/ARCHITECTURE.md` — remaining hits are
  schema column names or claim-subject context, never the source's
  page topic.

### Step 8.2 — Mentions section consistent with the new uniqueness

- [ ] `docs/ARCHITECTURE.md` line ~72 now reads "One mention row per
  (entity, source, surface form) triple" or equivalent.

### Step 8.3 — Source content framing

- [ ] `docs/ARCHITECTURE.md` line ~51 no longer claims the snapshot
  is the durable annotation anchor; phrasing matches
  `docs/matching.md`.

### Step 8.4 — `issues.md` cross-references

- [ ] Each item in `docs/issues.md` references either a `docs/PRD.md`
  § Known Product Risks bullet or a phase in
  `docs/alignment-plan.md`.

---

## Phase 9 — tightening (deferred)

### Step 9.1 — API request validation

- [ ] Malformed POSTs to `/api/entities`, `/api/claims`, `/api/mentions`
  return HTTP 400 with a structured error body (e.g.
  `{ "error": "...", "issues": [...] }`).
- [ ] `grep -rn "as any" src/server/routes/` returns no matches.

### Step 9.2 — replace `window.prompt` and broad shortcuts

- [ ] `grep -rn "window.prompt" src/client/` returns no matches.
- [ ] The "confirm all suggestions" action requires explicit user
  confirmation (button click), not a bare keyboard shortcut.

### Step 9.3 — sandbox source content rendering

- [ ] Fetched HTML renders inside a sandboxed iframe (or via DOMPurify
  with a strict allowlist) — not `innerHTML` of trusted markup.
- [ ] A test page with `<script>`, `<iframe>`, `onclick=`, and
  external `<img>` tags renders inertly with no network requests to
  third-party domains.
