# API Reference

All routes are prefixed `/api`. All requests and responses are JSON unless noted. Errors return `{ error: string }` with an appropriate HTTP status code.

---

## Sources

### `GET /api/sources`
Returns all sources, ordered by `created_at` descending.

Query params:
- `status` — filter by status: `queued`, `active`, `done`, `irrelevant`
- `type` — filter by type: `url`, `note`

Response:
```json
[
  {
    "id": 1,
    "type": "url",
    "url": "https://en.wikipedia.org/wiki/Hinterland_(TV_series)",
    "title": "Hinterland (TV series) - Wikipedia",
    "status": "active",
    "fetched_at": "2026-05-16T10:00:00Z",
    "subject_entity_id": 42,
    "subject_confirmed": true,
    "subject_description": null,
    "created_at": "2026-05-16T10:00:00Z"
  }
]
```

### `GET /api/sources/:id`
Returns a single source including `content` (full HTML or markdown).

### `POST /api/sources/fetch`
Fetches a URL, stores the HTML snapshot, extracts all links as SourceLink candidates, and creates a Source row with `status='queued'`.

If the URL already exists in Source, returns the existing row without re-fetching.

If the URL is a Wikipedia article (`*.wikipedia.org/wiki/*`), automatically:
- Sets `title` from the page `<title>`
- Attempts to match the article subject to an existing entity or creates a new one
- Populates `subject_entity_id` if matched (unconfirmed)

Request:
```json
{ "url": "https://en.wikipedia.org/wiki/Hinterland_(TV_series)" }
```

Response: the created or existing Source row (without `content`).

### `PATCH /api/sources/:id`
Updates editable source fields: `status`, `title`, `subject_entity_id`, `subject_confirmed`, `subject_description`.

### `GET /api/sources/:id/matches`
Runs the string matching engine against the source content. Returns all label matches with confirmation status.

Response:
```json
[
  {
    "label_value": "Richard Harrington",
    "surface_form": "Richard Harrington",
    "entity_ids": [7],
    "confirmed_entity_ids": [7],
    "status": "confirmed",
    "positions": [{ "start": 1042, "end": 1059 }]
  },
  {
    "label_value": "Megan Harries",
    "surface_form": "Megan Harries",
    "entity_ids": [12, 34],
    "confirmed_entity_ids": [12, 34],
    "status": "confirmed",
    "positions": [{ "start": 2301, "end": 2314 }]
  },
  {
    "label_value": "David Lyn",
    "surface_form": "David Lyn",
    "entity_ids": [5, 8],
    "confirmed_entity_ids": [],
    "status": "ambiguous",
    "positions": [{ "start": 3100, "end": 3109 }]
  }
]
```

`status` is one of:
- `confirmed` — at least one of the candidate entities has a confirmed Mention for this source. `confirmed_entity_ids` lists them all; one surface form may legitimately map to two or more entities simultaneously (e.g. a Character and a FictionalPerson sharing a label).
- `suggested` — one candidate entity, no confirmed Mention yet
- `ambiguous` — multiple candidate entities, none confirmed yet

`confirmed_entity_ids` is always present (possibly empty).

### `GET /api/sources/by-url`
Looks up a source by exact URL. Returns the Source row or `null`. Used by the link popover in the source viewer to show queue/status info for a clicked external link before deciding whether to add it to the queue.

Query params:
- `url` (required) — the URL to look up

### `GET /api/sources/:id/links`
Returns all SourceLink candidates harvested from this source.

Response:
```json
[
  {
    "id": 1,
    "url": "https://en.wikipedia.org/wiki/S4C",
    "title": "S4C",
    "already_in_queue": false,
    "already_irrelevant": false
  }
]
```

### `POST /api/sources/:id/links/queue`
Promotes one or more candidate links to queued Sources. Ignores URLs already in Source table.

Request:
```json
{ "urls": ["https://en.wikipedia.org/wiki/S4C"] }
```

### `GET /api/sources/candidates`
Returns all SourceLink URLs not yet in the Source table and not previously marked irrelevant, grouped by frequency (how many sources link to them).

---

## Entities

### `GET /api/entities`
Returns all entities with their primary label and type.

Query params:
- `type` — filter by entity type
- `q` — search by label (case-insensitive substring)
- `unreconciled` — if `true`, return only entities with no confirmed Wikidata ExternalID

Response:
```json
[
  {
    "id": 7,
    "type": "Person",
    "primary_label": "Richard Harrington",
    "mention_count": 4,
    "claim_count": 8,
    "created_at": "2026-05-16T10:00:00Z"
  }
]
```

### `GET /api/entities/:id`
Returns full entity detail: labels, external IDs, all claims with provenance, all mentions with source titles, and `search_logs` — one row per external system the entity has been searched against (e.g. Wikidata), used by the UI to surface "already searched, no result selected" hints.

Response (abridged):
```json
{
  "id": 7,
  "type": "Person",
  "primary_label": "Richard Harrington",
  "labels": [...],
  "external_ids": [...],
  "claims": [...],
  "mentions": [...],
  "search_logs": [
    { "system": "wikidata", "last_searched_at": "2026-05-16T11:04:00Z", "result_count": 0 }
  ]
}
```

### `POST /api/entities`
Creates a new entity.

Request:
```json
{
  "type": "Person",
  "primary_label": "Richard Harrington",
  "language": "en"
}
```

Response: the created entity with its generated ID.

### `PATCH /api/entities/:id`
Updates entity `type`.

### `DELETE /api/entities/:id`
Deletes entity and all associated labels, mentions, claims, and external IDs.

---

## Labels

### `POST /api/entities/:id/labels`
Adds a label (alias, translation, alternate spelling) to an entity.

Request:
```json
{
  "value": "Harrington",
  "language": "en",
  "is_primary": false,
  "is_alias": true
}
```

### `DELETE /api/labels/:id`
Removes a label. Cannot remove the last primary label of an entity.

---

## External IDs

### `GET /api/entities/:id/external-ids`
Returns all external IDs for an entity.

### `POST /api/entities/:id/external-ids`
Adds an external ID.

Request:
```json
{
  "system": "imdb",
  "value": "nm0364813",
  "url": "https://www.imdb.com/name/nm0364813/",
  "confirmed": true
}
```

### `PATCH /api/external-ids/:id`
Updates `confirmed` status or `url`.

### `DELETE /api/external-ids/:id`
Removes an external ID.

---

## Mentions

### `POST /api/mentions`
Creates a confirmed mention — records that an entity appears in a source.

Request:
```json
{
  "entity_id": 7,
  "source_id": 1,
  "surface_form": "Richard Harrington"
}
```

If a Mention already exists for this (entity, source) pair, returns the existing row.

### `POST /api/sources/:id/mentions/confirm-all`
Confirms all unambiguous suggestions for this source — creates Mention rows for all pattern matches that have exactly one candidate entity and no existing confirmed Mention. Ambiguous matches (multiple candidates) are skipped and returned in the response for manual resolution.

Response:
```json
{
  "confirmed": 12,
  "skipped_ambiguous": [
    { "label_value": "David Lyn", "entity_ids": [12, 34], "positions": [...] }
  ]
}
```

### `DELETE /api/mentions/:id`
Removes a mention (unconfirms the entity-source link). Does not delete associated claims.

---

## Claims

### `POST /api/claims`
Creates a claim.

Request (text value):
```json
{
  "subject_entity_id": 7,
  "property": "date_of_birth",
  "value": "1975-07-27",
  "source_id": 1,
  "mention_id": 23
}
```

Request (entity value):
```json
{
  "subject_entity_id": 42,
  "property": "director",
  "object_entity_id": 7,
  "source_id": 1
}
```

### `PATCH /api/claims/:id`
Updates a claim's `property`, `value`, or `object_entity_id`. Any field omitted is unchanged; pass `null` explicitly to clear `value` or `object_entity_id`.

Common edits:
- **Edit the property** of an existing claim: `{ "property": "performer" }`
- **Edit a text value**: `{ "value": "1975-07-27" }`
- **Promote a text value to an entity reference**: `{ "value": null, "object_entity_id": 42 }`
- **Unlink an entity-valued claim back to a text label**: `{ "object_entity_id": null, "value": "Richard Harrington" }`
- **Replace the linked entity** with a different one: `{ "object_entity_id": 99, "value": null }`

The server does not enforce the "exactly one of value/object_entity_id" rule; callers should set the other to `null` when switching kinds.

### `DELETE /api/claims/:id`
Removes a claim.

---

## Relationships

### `GET /api/relationships`
Returns claim paths connecting two entities, up to two hops, in either direction. Used by the source viewer to surface the relationship between the page topic and the active topic.

Query params:
- `from` (required) — first entity id
- `to` (required) — second entity id

Response:
```json
{
  "paths": [
    {
      "hops": [
        { "claim_id": 17, "subject_id": 42, "property": "cast_member", "object_id": 7 }
      ]
    },
    {
      "hops": [
        { "claim_id": 18, "subject_id": 42, "property": "character", "object_id": 91 },
        { "claim_id": 23, "subject_id": 91, "property": "performer",  "object_id": 7 }
      ],
      "intermediate_id": 91
    }
  ],
  "entities": {
    "7":  { "id": 7,  "type": "Person",    "primary_label": "Richard Harrington" },
    "42": { "id": 42, "type": "Series",    "primary_label": "Hinterland" },
    "91": { "id": 91, "type": "Character", "primary_label": "Tom Mathias" }
  }
}
```

Each hop records subject_id, property, object_id verbatim from the underlying Claim — the direction is encoded by which side of the hop is the user's `from` versus `to`. 2-hop paths include `intermediate_id`. Paths in both directions are returned (e.g. `from → prop → to` and `to → prop → from` are separate paths). `entities` resolves all involved ids to a display label and type.

---

## Properties

### `GET /api/properties/used`
Returns distinct property keys already used in claims, with usage counts, ordered most-used first. Used by the property picker to suggest property names that are already in the DB alongside the curated list from `docs/domain.md`.

Query params:
- `subject_type` (optional) — restrict the count to claims whose subject entity has this type. Used to surface type-appropriate suggestions (e.g. when adding a property to a Series, only show properties already used on Series subjects).

Response:
```json
[
  { "property": "cast_member", "count": 142 },
  { "property": "director",    "count": 38 },
  { "property": "publication_date", "count": 24 }
]
```

---

## Reconciliation

### `GET /api/reconcile/wikidata`
Searches Wikidata for candidates matching a local entity.

Query params:
- `entity_id` — local entity ID (uses primary label + type for search)
- `q` — free text search (alternative to entity_id)
- `type` — entity type hint for search

When `entity_id` is supplied, the server **records the search attempt** in `EntitySearchLog` (system=`wikidata`) with the current timestamp and result count. This is what powers the "already searched X ago · N results, none selected" hint shown in the UI on subsequent loads. The log is updated each time the search runs; confirming a candidate creates an `ExternalID` row which takes precedence over the log in the UI.

Response:
```json
[
  {
    "qid": "Q7326008",
    "label": "Richard Harrington",
    "description": "Welsh actor",
    "url": "https://www.wikidata.org/wiki/Q7326008",
    "wikipedia_en": "https://en.wikipedia.org/wiki/Richard_Harrington_(actor)",
    "wikipedia_cy": null
  }
]
```

### `POST /api/reconcile/wikidata/confirm`
Records the chosen QID for a local entity. Creates ExternalID rows for `wikidata` and any Wikipedia URLs returned.

Request:
```json
{
  "entity_id": 7,
  "qid": "Q7326008",
  "wikipedia_en": "https://en.wikipedia.org/wiki/Richard_Harrington_(actor)",
  "wikipedia_cy": null
}
```

---

## Export

### `GET /api/export/turtle`
Returns the full database as a Turtle document. `Content-Type: text/turtle`.

Query params:
- `entity_ids` — comma-separated list to export a subset

### `GET /api/export/csv`
Returns a zip archive containing one CSV file per entity type. `Content-Type: application/zip`.
