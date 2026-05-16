# String Matching Engine

## Purpose

The matching engine scans source content (stored HTML or markdown) for occurrences of known entity labels and returns a structured list of matches with their positions and confirmation status. It runs server-side on demand — triggered when a source is opened in the viewer.

No positions are persisted. Positions are character offsets computed at scan time and used only to render highlights in the client. If labels change or new entities are added, reopening the source produces fresh matches.

---

## Input

- Source content: full stored HTML or markdown string
- All Label rows from the database (value + entity_id + language)
- All confirmed Mention rows for this source (entity_id + surface_form)

---

## Algorithm

### 1. Build a label index

Load all Label rows. For each unique label value (case-insensitive), build a map:

```
lowercase(label_value) → [entity_id, ...]
```

Multiple entity IDs under one key means an ambiguous label. Single entity ID means unambiguous.

### 2. Scan content

For HTML sources: extract text content from the stored HTML before scanning (strip tags, preserve whitespace structure). Scan the plain text, then map text offsets back to HTML character offsets for highlight rendering.

For markdown sources: scan the raw markdown string directly.

Use a single-pass multi-string search (Aho-Corasick or equivalent). Match on word boundaries — do not match label values that are substrings of longer words. Matching is case-insensitive.

Collect all matches as `{ label_value, start, end, surface_form }` where `surface_form` is the exact characters from the content at that position.

### 3. Resolve confirmation status

For each match, look up the entity IDs for that label value:

- **Zero entity IDs** — should not occur (label index only contains known labels); skip
- **One entity ID, confirmed Mention exists for this source** → status: `confirmed`
- **One entity ID, no confirmed Mention** → status: `suggested`
- **Multiple entity IDs** → status: `ambiguous`, regardless of whether any Mention exists

### 4. Group by label value

Group matches by label value and entity candidates. Return one result object per unique (label_value, entity_ids[]) combination, with all positions listed.

---

## Output shape

```typescript
type MatchStatus = 'confirmed' | 'suggested' | 'ambiguous'

type Match = {
  label_value: string           // the label as stored in the database
  surface_form: string          // exact text from the source (may differ in case)
  entity_ids: number[]          // candidate entity IDs
  confirmed_entity_id: number | null  // set if status is 'confirmed'
  status: MatchStatus
  positions: Array<{ start: number, end: number }>  // character offsets in content
}
```

---

## Edge cases

**Overlapping matches** — if two labels overlap in the text (e.g. "Richard" and "Richard Harrington"), prefer the longer match. Remove shorter matches whose ranges are fully contained within a longer match.

**Same entity, multiple labels** — an entity may have both "Richard Harrington" and "Harrington" as labels. Both may match on the same page. Return both as separate match objects; the client can display them independently or merge them.

**Label added after page was fetched** — no problem. Matches are recomputed on each page load from the current label database. New labels are immediately effective.

**Confirmed mention with different surface form** — a Mention row records the surface form at confirmation time. If the same entity is matched elsewhere on the page with a different surface form (different alias), it is returned as a separate `suggested` match — the user should confirm whether this other occurrence refers to the same entity.

---

## Performance

For typical Wikipedia-length pages (50–100kb HTML, 500–2000 labels), a naive scan is fast enough. If the label set grows large (10,000+), replace the inner loop with an Aho-Corasick implementation. The interface does not change.

The matching endpoint should respond in under 200ms for typical inputs on a local machine.
