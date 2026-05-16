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

The primary annotation workspace. Split into two panels:

```
┌───────────────────────────────┬──────────────────────┐
│                               │                      │
│  Source content               │  Entity panel        │
│  (rendered HTML or markdown)  │  (context-sensitive) │
│  with highlight overlay       │                      │
│                               │                      │
└───────────────────────────────┴──────────────────────┘
```

**Left panel — source content**

Displays the stored HTML rendered in a sandboxed container (no scripts, no external requests). All links are intercepted — clicking an internal link does not navigate; instead it opens an "Add to queue?" prompt.

Highlights are rendered as inline `<mark>` elements injected over the rendered content:
- **Green** (`--highlight-confirmed`) — confirmed mention, entity known
- **Amber** (`--highlight-suggested`) — suggested match, one candidate entity, awaiting confirmation
- **Amber dashed** (`--highlight-ambiguous`) — ambiguous match, multiple candidate entities
- **Purple** (`--highlight-selected`) — user has selected this text, classification in progress

On page load:
1. Fetch source content from `GET /api/sources/:id`
2. Fetch matches from `GET /api/sources/:id/matches`
3. Inject highlights into rendered HTML

**Interactions on the left panel**

*Clicking a confirmed highlight (green):*
- Opens the entity panel on the right showing the matched entity
- Highlight border becomes more prominent

*Clicking a suggested highlight (amber, unambiguous):*
- Opens a small inline popover above the highlight:
  ```
  [Entity name] · [type]
  [# mentions] mentions · [# claims] claims
  [ ✓ Confirm ]  [ ✗ Not this ]
  ```
- Confirm → creates a Mention row, highlight turns green
- Not this → dismisses the suggestion for this session (does not delete the label)

*Clicking an ambiguous highlight (amber dashed):*
- Opens a disambiguation popover listing all candidate entities:
  ```
  "David Lyn" could be:
  ○  David Lyn  · Person  · actor, b. 1947
  ○  David Lyn  · Person  · poet, 19th century
  [ + Create new entity ]
  ```
- Selecting a candidate confirms the mention for that entity, turns highlight green
- "Create new entity" opens the entity creation flow

*Selecting new text (mouse selection):*
- On mouseup, if selected text is not already highlighted, show a small floating toolbar:
  ```
  [ Mark as entity ]  [ Dismiss ]
  ```
- "Mark as entity" opens the classification popover (see below)

**Classification popover**

Appears when user selects text and clicks "Mark as entity":

```
Selected: "Emyr Wyn"

Type:  [ Person ▾ ]

Search existing:  [_____________]
                  > Emyr Wyn · Person · Welsh actor ✓
                  > Emyr Wyn Jones · Person · politician

[ + Create new ]  [ Cancel ]
```

- Type dropdown: Person, FictionalPerson, Character, Film, Series, Episode, Organisation, Location, Other
- Search field queries `GET /api/entities?q=...&type=...` as user types
- Selecting an existing entity creates a Mention and adds the selected text as an alias Label if it differs from existing labels
- "Create new" creates an Entity with this text as primary label and the selected type, then creates a Mention

**Right panel — entity panel**

Shows context-sensitive information. Default state: source metadata.

```
Source metadata (default)
─────────────────────────
Title: Hinterland (TV series) - Wikipedia
URL: https://en.wikipedia.org/wiki/...
Status: [ active ▾ ]
Subject: [ Hinterland (series) × ]  or  [ Set subject... ]

[ Confirm all remaining ]
[ Mark as done ]
```

When an entity is focused (by clicking a highlight):

```
Richard Harrington
─────────────────
Type: Person
Mentions: 4 sources
Claims: 8

Labels
  Richard Harrington  [primary] [en]
  [ + add alias ]

External IDs
  Wikidata: Q7326008  ✓
  IMDB: nm0364813  ✓
  [ + add ID ]
  [ Search Wikidata ]

Claims
  date_of_birth  1975-07-27  [source]
  occupation     actor       [source]
  [ + add claim ]

[ View full entity → ]
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
- **External IDs**: all IDs with confirmation status, Wikidata search button
- **Claims**: grouped by property, each with provenance source link, add/delete controls
- **Mentions**: list of sources where this entity appears, with confirmation status and link to open source at that mention
- **Statistics**: mention count, claim count, source count, reconciliation status

---

### 5. Export (`/export`)

Simple form:
- Export format: Turtle / CSV
- Scope: All entities / Reconciled only / By type (checkboxes)
- Download button

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
- Currently focused entity
- Popover state (open/closed, position, type)

All server state fetched and mutated via the typed API client in `src/client/api/client.ts`. No global state library needed — fetch on mount, update on mutation, refetch matches after any mention change.
