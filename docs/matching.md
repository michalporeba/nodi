# String Matching Engine

## Purpose

The matching engine scans the source text exposed at review time (typically stored HTML or rendered markdown) for occurrences of known entity labels and returns a structured list of matches with their positions and confirmation status. It runs server-side on demand — triggered when a source is opened in the viewer.

The source text passed to the engine is the cached or rendered representation available at scan time. Positions are rendering hints only; durable annotations do not depend on them, so the cached source can change or be refreshed without invalidating mentions or claims.

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

For each match group, look up the entity IDs for that label value and intersect with the set of entities that have a confirmed Mention for this source **with this exact surface form** (case-insensitive):

- **At least one candidate entity has a confirmed Mention for this surface form** → status: `confirmed`. `confirmed_entity_ids` is the full intersection (may contain more than one — see "Multi-entity per surface form" below).
- **No confirmed Mention for this surface form, single candidate entity** → status: `suggested`
- **No confirmed Mention for this surface form, multiple candidate entities** → status: `ambiguous`

This means a label like "Megan Harries" that the user has confirmed against both a `Character` and a `FictionalPerson` entity is reported as a single `confirmed` match with `confirmed_entity_ids: [characterId, fictionalPersonId]`, not as `ambiguous`. The UI surfaces the multi-entity case with a switcher.

### 4. Group by label value

Group matches by label value and entity candidates. Return one result object per unique (label_value, entity_ids[]) combination, with all positions listed.

### 5. Word boundary semantics

The boundary check is **lenient on both sides**: a match is accepted if the characters immediately before and after the matched range are non-word characters (or string edges). This is *not* equivalent to JavaScript's `\b`, which requires a transition between a word character and a non-word character.

Plain `\b` fails when the surface form starts or ends with a non-word character — e.g. `"Megan Harries (née Owen)"` ends with `)`, and the following space is also a non-word character, so `\b` would not match. The lenient check accepts this.

The client-side highlight renderer uses server-supplied `positions` (character offsets in the server's plaintext) to identify which occurrence of a surface form to highlight. To resolve a position to a DOM location, the client builds a plaintext→DOM map (`buildDomMap` in `SourceContent.tsx`) that mirrors `extractPlainText`: each element open/close contributes one space, then whitespace is collapsed. This ensures that `positions[i].start` maps to the same visible character in the DOM as it does in the server's plaintext.

The regex boundary semantics (`\W|^` / `\W|$` lookbehind/lookahead) are retained only for the pending-text highlight (all occurrences of a not-yet-confirmed selection). Server-matched highlights use exact positions and do not depend on boundary regex.

---

## Output shape

```typescript
type MatchStatus = 'confirmed' | 'suggested' | 'ambiguous'

type Match = {
  label_value: string             // the label as stored in the database
  surface_form: string            // exact text from the source (may differ in case)
  entity_ids: number[]            // all candidate entity IDs for this label
  confirmed_entity_ids: number[]  // subset of entity_ids with a confirmed Mention in this source
  status: MatchStatus
  positions: Array<{ start: number, end: number }>  // character offsets in content
}
```

`confirmed_entity_ids` is always present (possibly empty). When `status === 'confirmed'` it contains at least one id; when more than one, the surface form maps to multiple entities simultaneously.

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
