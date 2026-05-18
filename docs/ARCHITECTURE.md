# Architecture

## Overview

nodi is a local web application. A Hono backend serves a React SPA and exposes a JSON API. All data is stored in a local SQLite database. The frontend never talks to external services directly — all Wikidata and Wikipedia API calls are proxied through the backend.

```
Browser (React SPA)
      |
      | HTTP/JSON
      |
Hono backend (Bun)
      |
      |-- SQLite (data/nodi.db)
      |-- Wikidata API (proxied)
      |-- Wikipedia API (proxied)
      |-- Page fetch + proxy
```

---

## Data model

### Core principle

The unit of annotation is a **string pattern**, not a position in a document. Highlights are derived at render time by scanning stored HTML against known entity labels. Positions are never stored. This means:

- Adding a new entity label immediately causes it to be highlighted in all future page loads
- Confirming a match records a `Mention` row — a durable link between an entity and a source
- Unconfirmed suggestions are ephemeral rendering state, not database rows

### Entities and labels

An `Entity` represents a real or fictional thing: a person, film, character, organisation, location. Every entity has one or more `Label` rows — the strings that refer to it. Labels include primary names, aliases, alternate spellings, translations, and stage names. String matching runs against all labels case-insensitively.

When two entities share a label (e.g. two different people named "David Lyn"), both are candidates for any occurrence of that string. The user must resolve the ambiguity per source.

### Sources and page topics

A `Source` is a fetched web page or a written note. Every source has a `status`:

- `queued` — in the queue, not yet reviewed
- `active` — currently being annotated
- `done` — annotation complete
- `irrelevant` — marked as not useful, will not be re-queued

A source optionally has a **page topic**: either a single entity (`subject_entity_id`) or a free-text description (`subject_description`) for pages covering multiple topics. A page-topic source (e.g. a Wikipedia biography) is considered a primary source for that entity. A subject-description source is a reference. Both nullable — a queued page has no declared page topic yet. (The column is named `subject_entity_id` for historical reasons; the conceptual term is *page topic*.)

**One topic per source.** A source either has a single entity-typed page topic or it does not. If a page is about more than one entity it is treated as a reference document — the user supplies a free-text description and no `subject_entity_id` is set. The whole claim-attachment model depends on this: every claim is attributed to a single subject entity, and that subject is normally the page topic.

A source stores the full fetched HTML in `content`. This cached representation is for inspection and rendering; durable annotations (Mentions and Claims) do not depend on it. If the live page changes, reopening the source produces fresh matches from the current label database without invalidating existing annotations.

### Page topic vs. active topic

The source viewer exposes two related concepts:

- **Page topic** — the source's `subject_entity_id` (or `subject_description`). Persisted. Set once per source.
- **Active topic** — transient, per-session state in the viewer. Defaults to the page topic when that is an entity. Switches when the user clicks a confirmed entity highlight in the content (or one of the alternatives in the linked-entity switcher). Claims added from within the source viewer are attributed to whichever entity is currently active.

Selecting raw text and adding a claim attributes the claim to the **active topic**, with the selected text as the claim's value. The text is *not* promoted to an entity by default — `Megan Harries` in the value field of a `cast_member` claim about `Pobol y Cwm` remains a literal string until the user explicitly promotes it. This separates "the value of this claim" from "this is itself an entity".

### Surface forms mapping to multiple entities

A `Mention` is keyed on `(entity_id, source_id, surface_form)`. A single surface form occurrence in a source can therefore record multiple Mentions — one per entity it stands for. The matching engine collapses these into one match per `(label, candidate_entity_ids[])` group, and its `confirmed_entity_ids` array may contain more than one id.

This is needed for cases like `Megan Harries` referring at the same time to a Character (the role in the show) and a FictionalPerson (the in-universe person). The UI surfaces a small switcher on confirmed highlights so the user can flip the active topic between linked entities and make claims about each.

The author of a multi-entity link adds the new entity from the switcher's `+` affordance: the surface form becomes an alias on that entity if it isn't already, and a Mention row is created for the new (entity, source, surface_form) triple.

### Mentions

A `Mention` is a confirmed link between an entity and a source — "this entity is referred to in this document." Mentions record the `surface_form` (the exact string that appeared) to handle spelling variants. One mention row per (entity, source, surface_form) triple. The `confirmed` flag distinguishes manually confirmed mentions from those accepted via "confirm all."

Unconfirmed pattern matches (suggestions) are not stored — they are computed by the matching engine on each page load and rendered as amber highlights. They become Mention rows only when confirmed.

### Claims

A `Claim` is a structured assertion: *subject entity → property → value*. The value is either a text string (`value` column) or another entity (`object_entity_id`). Claims carry optional provenance: a `mention_id` pointing to the Mention that supports the claim, and/or a `source_id` pointing to the source.

Properties are stored as local string keys (e.g. `director`, `cast_member`, `performer`). The mapping to Wikidata PIDs is in `docs/domain.md`.

**Qualifiers are not modelled.** The cast member relationship between a Film and a Person does not carry the character they played as a qualifier. Instead, the Character entity carries `performer` (pointing to the Person) and `present_in_work` (pointing to the Film). The full triangle is reconstructable by query. This keeps the Claim table flat and consistent.

### External IDs

External IDs are stored separately from claims. Each row records a `system` key (e.g. `wikidata`, `imdb`, `wikipedia_en`), a `value`, and the full `url`. The `confirmed` flag distinguishes IDs that have been manually verified from those suggested by the reconciliation search.

Wikidata QIDs are stored here as `system='wikidata'`. There is no special `wikidata_qid` column on Entity.

### External search log

`EntitySearchLog` records reconciliation search attempts against external systems. One row per `(entity_id, system)` pair, holding the most recent `last_searched_at` and `result_count`. The Wikidata search route writes to this table on every successful search.

This is not provenance — it's UI memory. When a user has searched Wikidata for an entity and didn't confirm a candidate (either because the search returned nothing, or because they dismissed the candidates), the next visit shows "Wikidata: searched X ago · no results / N results, none selected" instead of re-offering a `Search Wikidata` button. A confirmed `ExternalID(system='wikidata')` row supersedes the log in the UI.

### Notes

A note is a Source with `type='note'` and no URL. Its content is editable markdown stored in `content`. Notes are annotated identically to web pages — the same string matching runs against the markdown text.

---

## String matching engine

The matching engine runs server-side. When the client loads a source, it calls `GET /api/sources/:id/matches`. The engine:

1. Loads all Label rows from the database
2. Scans the source content for each label value, case-insensitively
3. For each match, looks up existing confirmed Mentions for this source
4. Returns a list of match objects: `{ label_value, entity_ids[], confirmed_entity_ids[], surface_form, positions[], status }`

`positions` are character offsets in the stored HTML/markdown — used only for rendering highlights, never persisted.

Status resolution intersects candidate entities with confirmed mentions:

- `confirmed` — at least one candidate entity has a confirmed Mention for this source. `confirmed_entity_ids` lists every confirmed one; a length > 1 represents a surface form that maps to multiple entities simultaneously (e.g. a `Character` and a `FictionalPerson` sharing the label).
- `suggested` — one candidate entity, no confirmed Mention yet
- `ambiguous` — multiple candidate entities, none confirmed yet

The boundary check is lenient — "the outer characters must be non-word (or string edges)" — not the strict `\b` transition. The client-side highlight renderer mirrors this with `(?<=^|\W)...(?=\W|$)` lookarounds rather than `\b`, so that labels ending or starting with punctuation (e.g. `"Megan Harries (née Owen)"`) match in the rendered DOM the same way they match server-side. See `docs/matching.md` for full details.

## Relationship paths

`GET /api/relationships?from=A&to=B` returns claim paths connecting two entities, walking the entity-valued claims graph up to two hops. Both directions count: a claim with subject=A and object=B is reported the same way as one with subject=B and object=A, with hop direction recoverable from the `subject_id`/`object_id` fields.

The viewer uses this between the page-topic block and the active-topic block to make the user's "why is this the active topic?" question visible: when the active topic differs from the page topic, the relationship panel shows the property linking them, or a 2-hop chain through an intermediate (e.g. `Series → cast_member → Person → played → Character`). Clicking the intermediate makes it the active topic; clicking the `×` next to a property deletes that hop's claim.

When no relationship exists, the panel offers an inline quick-add: a property picker plus a save button that creates a `page_topic → property → active_entity` claim with `source_id` set to the current source.

Paths up to two hops are sufficient for the modelled domain (the cast member triangle is at most one intermediate deep). Deeper walks are not implemented; users can navigate one hop at a time by switching the active topic to the intermediate.

---

## Source queue and link harvesting

When a page is fetched, all `<a href>` links pointing to external URLs are extracted and stored as candidate links in `SourceLink`. These are not automatically added to the Source queue. The user can review candidates and promote them to queued sources.

If a URL already exists in the Source table (at any status including `irrelevant`), it is not added as a candidate. Irrelevant decisions are permanent — a URL marked irrelevant will never re-appear in the candidate list.

---

## Reconciliation

Wikidata reconciliation is triggered manually per entity. The backend calls the Wikidata search API (`wbsearchentities`) with the entity's primary label and type hint, and returns a ranked list of candidates with labels, descriptions, and QIDs. The user selects a match or marks it as "not in Wikidata." The selected QID is stored as an ExternalID row with `system='wikidata'` and `confirmed=true`.

Wikipedia URL reconciliation follows from the QID — once a QID is known, the backend can retrieve the associated Wikipedia page URLs (English, Welsh, others) from the Wikidata API and offer them as ExternalID rows.

Every Wikidata search writes an `EntitySearchLog` row (or updates the existing one for that entity+system). The UI uses this to avoid re-prompting the user to "Search Wikidata" for an entity they've already searched. See "External search log" above.

---

## Export

Two export formats:

**Turtle** — entities become subjects with their claims as predicate-object pairs, using Wikidata PIDs where available. Labels become `rdfs:label` triples with language tags. ExternalIDs become `owl:sameAs` triples. Mentions become named graphs providing provenance.

**CSV** — one file per entity type, columns derived from the property set for that type. Entity-valued properties are represented as Wikidata QIDs where reconciled, or local IDs otherwise.

---

## Design decisions

**Why SQLite and not RDF as the working store?**
Mentions, queue state, processing status, and confirmation flags are relational data. SQL queries and updates are simpler and faster than SPARQL updates on a local triplestore. RDF is the right output format, not the working format.

**Why server-side matching?**
Keeps the client simple. The client renders what the server tells it. Matching logic, label loading, and confirmed-mention lookup all happen in one place. The client does not need to know anything about the entity database.

**Why no qualifier support on Claims?**
Qualifiers would require a nested data structure or a separate Qualifier table, complicating every query and every UI interaction. The character-performer-work triangle is fully representable without qualifiers by placing the relevant claims on the Character entity. This generalises cleanly to other relationship types.

**Why local property keys instead of Wikidata PIDs in the Claim table?**
Property keys like `director` are readable, stable local identifiers. PIDs are opaque. The mapping is in `docs/domain.md`. When the domain expands (e.g. to folk music), new property keys are added to the domain config without touching the schema.
