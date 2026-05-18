# UI Reference

## Application structure

nodi is a single-page application with four main views, accessible from a persistent left sidebar:

```
┌─────────┬────────────────────────────────────┐
│         │                                    │
│ Sidebar │  Main content area                 │
│         │                                    │
│ Sources │                                    │
│ Queue   │                                    │
│ Entities│                                    │
│ Export  │                                    │
│         │                                    │
└─────────┴────────────────────────────────────┘
```

---

## Views

### 1. Source Viewer (`/sources/:id`)

The primary annotation workspace. Split into two panels — content on the left, a stacked control panel (~480px wide) on the right:

```
┌───────────────────────────────┬───────────────────────┐
│                               │  TOPIC                │
│                               ├───────────────────────┤
│  Source content               │  RELATIONSHIP         │
│  (rendered HTML or markdown)  │  (only when active ≠  │
│  with highlight overlay       │   page topic)         │
│                               ├───────────────────────┤
│                               │  ACTIVE TOPIC         │
│                               │  (claims, labels,     │
│                               │   external IDs, etc.) │
│                               ├───────────────────────┤
│                               │  ACTIONS              │
└───────────────────────────────┴───────────────────────┘
```

**Left panel — source content**

Displays the stored HTML rendered in a sandboxed container (no scripts, no external requests).

Highlights are rendered as inline `<mark>` elements injected over the rendered content:
- **Green** (`--highlight-confirmed`) — confirmed mention; one or more entities
- **Amber** (`--highlight-suggested`) — suggested match, one candidate entity, awaiting confirmation
- **Amber dashed** (`--highlight-ambiguous`) — ambiguous match, multiple candidate entities, none confirmed yet
- **Purple** (`--highlight-selected`) — user has selected this text, claim flow in progress

The highlighter mirrors the server's lenient word boundary semantics: `(?<=^|\W) … (?=\W|$)` rather than `\b`. Without this, surface forms ending in punctuation (e.g. `"Megan Harries (née Owen)"` followed by a space) would silently fail to render.

The highlight injection is rerun in-place on every matches update. The container's `scrollTop` is captured and restored across the `innerHTML` reset so the user does not get bounced back to the top of the page after a popover save.

On page load:
1. Fetch source content from `GET /api/sources/:id`
2. Fetch matches from `GET /api/sources/:id/matches`
3. Inject highlights into rendered HTML
4. If status was `queued`, PATCH to `active`

**Selection behaviours**

Text selection always normalises to whole words.

- **Single click on a word** — selects the whole word under the cursor and opens the claim popover.
- **Shift+click** — extends from the previous anchor word to the clicked word, in either direction. Range is computed by merging the two word ranges (min start, max end).
- **Drag selection** — on mouseup the range is trimmed of leading/trailing whitespace, then snapped outward to word boundaries on each end. Dragging through "gan Har" therefore yields "Megan Harris"; a drag that already ends on whitespace does not bleed into the next word.
- A click within 3px of mousedown counts as a click (word select); past 3px it counts as a drag.

Word characters use Unicode letter/number classes (`/[\p{L}\p{N}_]/u`), so accents like `é` and `ñ` are treated as word characters.

**Link behaviour**

`<a>` tags inside the rendered content keep their visual styling but are non-navigable. The container blocks default action on `click` and `auxclick` (middle-click and Cmd/Ctrl+click), preventing both same-window and new-tab navigation.

Clicking a link selects the anchor's full text content as the working selection and opens the claim popover with a URL block at the top showing the link's status:

```
External link
https://en.wikipedia.org/wiki/...
[ In queue · queued ]                or
[ Not in queue ]  [ + Add to queue ]
```

`+ Add to queue` calls `POST /api/sources/fetch` and updates the badge.

**Highlight clicks**

*Confirmed highlight (green):*
- Sets the active topic to the highlight's first confirmed entity.
- If the surface form maps to >1 entity, the active-topic block shows a switcher (see below) so the user can flip between linked entities.

*Suggested highlight (amber):*
- Opens a small popover showing the candidate entity with `Confirm` / `Not this`.

*Ambiguous highlight (amber dashed):*
- Opens a multi-select popover listing all candidate entities with checkboxes plus `Confirm` and `Cancel`. Confirming multiple boxes creates a Mention per checked entity — used when a surface form really does refer to several entities at once.

**Claim popover (unified flow)**

Opens on text-selection mouseup (or link click). One form does both claim creation and entity creation:

```
About <Active Topic>
─────────────────────────
Property  [ cast_member       ▾ ]
Value     [ Megan Harries        ]

Add entities, or leave empty to save the value as a string.

Linked entities (one claim per entity will be saved):
[ Megan Harries (Character) × ]  [ + new (FictionalPerson) × ]

+ new from template: [Person] [Actor] [Character] [Film] …

[ ✓ Save claim · 2 entities ]  [ Cancel ]
```

The `+ new from template` strip lists **class templates** loaded from the union of the active set of ontologies. Each button represents a template: plain classes such as `Person` are degenerate templates that just set the label and type; richer templates such as `Actor` seed additional claims (`occupation = Actor` on a `Person`). See `docs/terms.md` § Class Template. Template provenance — which ontology defined the template — is shown in the button's `title` attribute so the user can disambiguate name collisions between active ontologies.

Save semantics depend on what's filled:

| Property set? | Linked entities? | Result                                                                                                  |
|---------------|------------------|---------------------------------------------------------------------------------------------------------|
| yes           | none             | One claim with `value` = string                                                                         |
| yes           | one              | A Mention + a claim with `object_entity_id` on the linked entity. `value` cleared.                      |
| yes           | many             | A Mention + a claim per linked entity. The same property/subject; each claim points at a different entity. |
| no            | one+             | Just the Mention(s). No claim.                                                                          |
| no            | none             | Save disabled.                                                                                          |

The `Property` field is the shared `PropertyPicker` combobox (see below). New entities created from this popover use the current `Value` field as their `primary_label`; existing entities are picked from the typeahead.

**Property picker (combobox)**

Used everywhere a claim property is entered (claim popover, relationship inline add, claim row edit, both add-claim forms). Replaces plain text inputs.

```
Property  [ cast_                  ]
          ┌──────────────────────────────────┐
          │ cast_member         entity P161  │
          │ cast_member_of      entity        │
          │ ──────────────────────────────── │
          │ + Use custom: "cast_m"           │
          └──────────────────────────────────┘
```

Suggestions are filtered by the typed text and the subject entity's type. They come from two sources:
- Ontology-defined properties from `GET /api/ontology`, taking the union over the active set of domain ontologies and scoping by the property's domain/range or applicable node shape
- Live `GET /api/properties/used?subject_type=X` so predicate labels already used in the DB are picked up, including ad-hoc labels not defined in any active ontology

Each row shows value type (`text` / `entity` / `both`) and the Wikidata PID when known; used-only entries show a `used ×N` badge. The last row is always `+ Use custom: <typed>` so new predicate labels can still be introduced; they can be promoted to ontology properties later (see `docs/terms.md` § Promotion).

Keyboard: ↑/↓ navigate, Enter accepts the highlighted option (or the typed text when nothing is highlighted), Esc closes.

**Right panel — control panel**

Four stacked blocks, top to bottom:

**Topic** (sticky)
```
Topic                                 ✎
Pobol y Cwm
[ Series ]  Q1387857
```
or, when no topic is set, an inline `TopicPicker` with three paths: search existing entity, create new entity (per-type buttons), or write a free-text description for pages that aren't about a single thing. The picker is the first thing the user is expected to use on a new source.

**Relationship** (only when active topic differs from page topic)

```
Relationship
Pobol y Cwm  Series
   ↓ cast_member  ×
Megan Harries  FictionalPerson
```

Or, for a 2-hop chain:

```
Pobol y Cwm  Series
   ↓ character  ×
Megan Harries  Character    ← click to make active
   ↓ performer  ×
Sue Roderick  Person
```

Each arrow shows the claim's property in monospace; the arrow direction (`↓` / `↑`) reflects which side of the claim is `subject` versus `object`. Intermediate chips are dotted-underlined and clickable — click to make that entity the active topic. `×` next to a property deletes that hop's claim (no confirm; reversible by re-creating).

Empty state — no claim links page and active yet:

```
Relationship
No claim links these yet.
[ property … ▾ ]  [ + Add ]
Saves: topic → property → active
```

**Active topic**

Defaults to the page topic when that is an entity. Switches when the user clicks a confirmed entity highlight. Shows a "← page" link when active differs from page topic.

When the active topic came from a surface form that maps to multiple entities, a compact switcher appears at the top of this block:

```
"Megan Harries" →  [Character]  [FictionalPerson]  [ + ]
```

- Each button shows only the entity *type* (label is shared and shown once on the left); the entity's primary label is in the button's `title`.
- The currently active entity's chip is highlighted.
- `+` opens an inline picker (search existing or create new of any type) — adding an entity creates a Mention against the surface form and, if needed, adds the surface form as an alias label on that entity so future matches catch it.

Below the switcher, the entity's labels, external IDs, claims, and mentions are rendered identically to the standalone entity view.

**Claims are clickable to edit.** Both the property and the value have dotted underlines indicating they are interactive.

- Click a property — inline `PropertyPicker` opens, save writes `PATCH /api/claims/:id { property }`.
- Click a *text* value — input + `Save text` / `→ Promote to entity` / `Cancel`. Promote expands a typeahead and per-type "new as" buttons; picking either updates the claim to `{ value: null, object_entity_id }`.
- Click an *entity* value — read-only entity name plus `⤵ Unlink (back to text)` / `↻ Replace entity` / `Cancel`. Unlink writes `{ value: entity.primary_label, object_entity_id: null }` (the entity itself is preserved; only the link is broken).

Property and value editors are mutually exclusive — opening one closes the other. Enter saves text edits; Esc cancels.

**Notability marker.** Each claim row has a small notability toggle (☆ outline / ★ filled) next to the value. Marking a claim notable signals it should be included in the *Ready for external publication* export readiness level (see § Export) even when its entities are not yet reconciled. The marker is independent of reconciliation — a claim may be notable without external IDs, or reconciled without being marked notable. See `docs/terms.md` § Notability Marker for the design rationale.

**External IDs include a search-log fallback.** Once the user has searched Wikidata for the entity:

```
External IDs
  Wikidata: Q7326008  ✓        (when confirmed)
or
  Wikidata: searched 2h ago · no results
  🔍 Search again              (when log row exists, no confirmed QID)
or
  🔍 Search Wikidata           (no log row, never searched)
```

The log entry is written server-side on every search; a confirmed `ExternalID` row takes precedence over the log.

**Actions**
```
Status:  [ active ▾ ]
[ ✓ Confirm suggestions ]   [ ✓ Mark done ]
```

---

### 2. Source Queue (`/queue`)

Lists all sources that are not `done` or `irrelevant`. Default view shows `queued` and `active` sources.

```
┌─────────────────────────────────────────────────────┐
│  Queue                            [ + Add URL ]      │
│                                                      │
│  Filter: [ All ▾ ]  [ queued ] [ active ] [ done ]  │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ ● Hinterland (TV series) - Wikipedia        │    │
│  │   active · 12 mentions · added 2h ago       │    │
│  │   [ Open ]  [ Mark irrelevant ]             │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │ ○ S4C - Wikipedia                           │    │
│  │   queued · added 2h ago                     │    │
│  │   [ Open ]  [ Preview ]  [ Mark irrelevant ]│    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**Add URL flow:**
1. User pastes a URL
2. Backend calls `POST /api/sources/fetch`
3. If new: source created as `queued`, added to top of list
4. If existing: scroll to existing entry, show status

**Preview:** shows the stored title, URL, and first 200 characters of text content without navigating to the source viewer.

**Candidates tab:** shows URLs harvested from processed sources that haven't been reviewed. Grouped by frequency. User can queue or dismiss individually or in bulk.

---

### 3. Entity List (`/entities`)

Browse and manage all entities in the database.

```
┌─────────────────────────────────────────────────────┐
│  Entities                         [ + New entity ]  │
│                                                      │
│  Filter: [ All types ▾ ]  Search: [_____________]   │
│  Show: [ unreconciled only □ ]                       │
│                                                      │
│  Person (47)  Film (12)  Series (8)  Character (23)  │
│                                                      │
│  Richard Harrington · Person                        │
│  4 mentions · 8 claims · Wikidata ✓ · IMDB ✓       │
│                                                      │
│  David Lyn · Person  ⚠ ambiguous label              │
│  2 mentions · 3 claims · not reconciled             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

The ⚠ ambiguous label indicator appears when another entity shares the same primary label.

---

### 4. Entity Detail (`/entities/:id`)

Full view of a single entity.

Sections:
- **Header**: primary label, type, edit button, delete button
- **Labels**: all labels with language tags, add/remove controls
- **External IDs**: all IDs with confirmation status, Wikidata search button (uses the same search-log fallback as the side panel — see Source Viewer / Active topic)
- **Claims**: grouped by property, each row rendered with the same `ClaimRow` editor used in the side panel (text↔entity editing, replace, unlink, property edit). The property is shown once per group in the section header, so the row hides it.
- **Mentions**: list of sources where this entity appears, with confirmation status and link to open source at that mention
- **Statistics**: mention count, claim count, source count, reconciliation status

---

### 5. Export (`/export`)

Form:

- **Format**: Turtle, RDF with named graphs (when provenance preservation is needed), CSVW (tabular with schema metadata), or QuickStatements (Wikidata-oriented; available only when claims are sufficiently mapped and reconciled).
- **Readiness level** (three tiers, see `docs/PRD.md` § Notability and Export Readiness):
  - *Everything captured* — includes unresolved labels and weakly structured claims; the broadest export, never silently drops data
  - *Ontology-mapped* — only claims expressed with ontology properties
  - *Ready for external publication* — ontology-mapped *and* either reconciled to an external database or marked notable
- **Domain scope**: filter by one or more active domain ontologies, or export the union of the active set.
- **By type**: optional filter within the chosen domain scope.
- Download button.

The export should make omissions and downgraded representations visible — for example, as warnings in a sidecar manifest or inline comments in the output — especially when the selected format cannot express the full local graph (e.g. plain Turtle without named graphs cannot preserve per-claim provenance).

---

## Highlight colour system

Use CSS variables so the theme can be adjusted:

```css
--highlight-confirmed:  rgba(34, 197, 94, 0.25);   /* green */
--highlight-confirmed-border: rgb(34, 197, 94);

--highlight-suggested:  rgba(251, 191, 36, 0.25);  /* amber */
--highlight-suggested-border: rgb(251, 191, 36);

--highlight-ambiguous:  rgba(251, 191, 36, 0.2);   /* amber, dashed border */
--highlight-ambiguous-border: rgb(251, 191, 36);

--highlight-selected:   rgba(167, 139, 250, 0.25); /* purple */
--highlight-selected-border: rgb(167, 139, 250);
```

Confirmed highlights use a solid border. Ambiguous highlights use a dashed border. Suggested highlights use a dotted border. This allows all three to be distinguished even without colour.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `n` | Add URL to queue (from queue view) |
| `d` | Mark current source as done |
| `a` | Confirm all remaining suggestions on current source |
| `Escape` | Close popover |
| `Enter` | Confirm focused popover action |

---

## State management

Use React context for:
- Current source and its matches
- Currently focused entity (active topic, when different from page topic)
- The surface form + linked entity ids that drove the current active topic (used by the linked-entity switcher)
- Popover state (open/closed, position, type, optional `linkedUrl`)

All server state fetched and mutated via the typed API client in `src/client/api/client.ts`. No global state library needed — fetch on mount, update on mutation, refetch matches after any mention change.

A small `reloadToken` integer is held alongside matches. Bumping it triggers a refetch of relationship paths and other derived views. The relationship panel uses **optimistic updates** on delete (remove the affected paths from local state immediately) and **keeps the previous result visible during background refetches** so unrelated paths do not flicker out and back when one is deleted.

Highlight injection runs inside `useEffect` on `matches` changes and is **not** keyed by `matchKey` — using `key=` to force a remount would discard scroll position. Instead the effect captures `scrollTop` before resetting `innerHTML` and restores it after, so popover saves don't jump the page.
