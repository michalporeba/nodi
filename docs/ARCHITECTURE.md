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

### Sources and subjects

A `Source` is a fetched web page or a written note. Every source has a `status`:

- `queued` — in the queue, not yet reviewed
- `active` — currently being annotated
- `done` — annotation complete
- `irrelevant` — marked as not useful, will not be re-queued

A source optionally has a **subject**: either a single entity (`subject_entity_id`) or a free-text description (`subject_description`) for pages covering multiple topics. A subject-entity source (e.g. a Wikipedia biography) is considered a primary source for that entity. A subject-description source is a reference. Both nullable — a queued page has no declared subject yet.

A source stores the full fetched HTML in `content`. This snapshot is what the annotation layer works against, ensuring annotations remain valid even if the live page changes.

### Mentions

A `Mention` is a confirmed link between an entity and a source — "this entity is referred to in this document." Mentions record the `surface_form` (the exact string that appeared) to handle spelling variants. One mention row per (entity, source) pair. The `confirmed` flag distinguishes manually confirmed mentions from those accepted via "confirm all."

Unconfirmed pattern matches (suggestions) are not stored — they are computed by the matching engine on each page load and rendered as amber highlights. They become Mention rows only when confirmed.

### Claims

A `Claim` is a structured assertion: *subject entity → property → value*. The value is either a text string (`value` column) or another entity (`object_entity_id`). Claims carry optional provenance: a `mention_id` pointing to the Mention that supports the claim, and/or a `source_id` pointing to the source.

Properties are stored as local string keys (e.g. `director`, `cast_member`, `performer`). The mapping to Wikidata PIDs is in `docs/domain.md`.

**Qualifiers are not modelled.** The cast member relationship between a Film and a Person does not carry the character they played as a qualifier. Instead, the Character entity carries `performer` (pointing to the Person) and `present_in_work` (pointing to the Film). The full triangle is reconstructable by query. This keeps the Claim table flat and consistent.

### External IDs

External IDs are stored separately from claims. Each row records a `system` key (e.g. `wikidata`, `imdb`, `wikipedia_en`), a `value`, and the full `url`. The `confirmed` flag distinguishes IDs that have been manually verified from those suggested by the reconciliation search.

Wikidata QIDs are stored here as `system='wikidata'`. There is no special `wikidata_qid` column on Entity.

### Notes

A note is a Source with `type='note'` and no URL. Its content is editable markdown stored in `content`. Notes are annotated identically to web pages — the same string matching runs against the markdown text.

---

## String matching engine

The matching engine runs server-side. When the client loads a source, it calls `GET /api/sources/:id/matches`. The engine:

1. Loads all Label rows from the database
2. Scans the source content for each label value, case-insensitively
3. For each match, looks up existing confirmed Mentions for this source
4. Returns a list of match objects: `{ label_value, entity_ids[], confirmed_entity_id?, surface_form, positions[] }`

`positions` are character offsets in the stored HTML/markdown — used only for rendering highlights, never persisted.

If a label matches exactly one entity and there is a confirmed Mention for that entity in this source, it is returned as `confirmed` (green highlight).

If a label matches exactly one entity but has no confirmed Mention, it is returned as `suggested` (amber highlight).

If a label matches multiple entities, it is returned as `ambiguous` (amber highlight with disambiguation required).

---

## Source queue and link harvesting

When a page is fetched, all `<a href>` links pointing to external URLs are extracted and stored as candidate links in `SourceLink`. These are not automatically added to the Source queue. The user can review candidates and promote them to queued sources.

If a URL already exists in the Source table (at any status including `irrelevant`), it is not added as a candidate. Irrelevant decisions are permanent — a URL marked irrelevant will never re-appear in the candidate list.

---

## Reconciliation

Wikidata reconciliation is triggered manually per entity. The backend calls the Wikidata search API (`wbsearchentities`) with the entity's primary label and type hint, and returns a ranked list of candidates with labels, descriptions, and QIDs. The user selects a match or marks it as "not in Wikidata." The selected QID is stored as an ExternalID row with `system='wikidata'` and `confirmed=true`.

Wikipedia URL reconciliation follows from the QID — once a QID is known, the backend can retrieve the associated Wikipedia page URLs (English, Welsh, others) from the Wikidata API and offer them as ExternalID rows.

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
