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
    "confirmed_entity_id": 7,
    "status": "confirmed",
    "positions": [
      { "start": 1042, "end": 1059 }
    ]
  },
  {
    "label_value": "David Lyn",
    "surface_form": "David Lyn",
    "entity_ids": [12, 34],
    "confirmed_entity_id": null,
    "status": "ambiguous",
    "positions": [
      { "start": 2301, "end": 2309 }
    ]
  }
]
```

`status` is one of:
- `confirmed` — a Mention row exists for this entity+source, `confirmed=true`
- `suggested` — one candidate entity, no confirmed Mention yet
- `ambiguous` — multiple candidate entities, requires resolution

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
    "wikidata_qid": "Q7326008",
    "wikidata_confirmed": true,
    "created_at": "2026-05-16T10:00:00Z"
  }
]
```

### `GET /api/entities/:id`
Returns full entity detail: labels, external IDs, all claims with provenance, all mentions with source titles.

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

### `DELETE /api/claims/:id`
Removes a claim.

---

## Reconciliation

### `GET /api/reconcile/wikidata`
Searches Wikidata for candidates matching a local entity.

Query params:
- `entity_id` — local entity ID (uses primary label + type for search)
- `q` — free text search (alternative to entity_id)
- `type` — entity type hint for search

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
