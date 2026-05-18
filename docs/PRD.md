# Product Requirements Document: nodi

Last updated: 2026-05-18

## Purpose

nodi is a local-first knowledge curation tool for researchers and data curators
who need to build structured, source-backed graph data from web pages and
documents. It supports human review, entity reconciliation, provenance tracking,
and export to reusable formats, including RDF, CSV, and Wikidata-oriented
workflows such as QuickStatements.

This PRD records the current product baseline and the requirements future work
should preserve. It is not a replacement for the technical references in
`docs/terms.md`, `docs/ARCHITECTURE.md`, `docs/api.md`, `docs/ui.md`,
`docs/matching.md`, or `data/ontology/welsh-film-tv.ttl`.

## Product Summary

nodi helps users collect source material, identify and disambiguate entities,
confirm where those entities are mentioned, and build a local graph of sourced
claims. The resulting dataset can be reconciled against external identifiers and
exported for analysis, publication, or contribution to systems such as Wikidata.

The product is intentionally narrow. It favors explicit human judgement,
provenance, local storage, and predictable workflows over automated extraction,
broad crawling, or cloud-dependent processing.

## Users

Primary user:

- A researcher, editor, archivist, or data curator building a structured local
  dataset from source documents before publishing or analysis.

Initial domains:

- Welsh film and television.
- Welsh traditional music.
- Caves and caving in Wales.

Domain flexibility is a core product requirement. nodi must be developed against
multiple domains from the start, including domains that partially overlap and
domains that are substantially distinct. Domain-specific entity types,
properties, external identifiers, and export mappings should be configurable
without weakening the shared source, entity, mention, claim, provenance,
reconciliation, and export workflows.

## Goals

- Let users collect web pages and other externally-authored source documents
  into a review queue.
- Let users identify, create, disambiguate, and reconcile entities across
  multiple sources.
- Detect known entity labels in sources and let users explicitly confirm,
  reject, or resolve matches.
- Support ambiguous labels and cases where the same surface form legitimately
  refers to multiple entities.
- Anchor annotations to selected text values, entity labels, and source
  references rather than to fragile document positions.
- Let users build a local graph of sourced claims between entities and literal
  values.
- Preserve provenance from source to mention to claim wherever possible.
- Keep text-valued and entity-valued claims distinguishable.
- Support configurable domains with their own entity types, properties,
  external identifiers, and export mappings.
- Support manual reconciliation against external identifiers, including but not
  limited to Wikidata.
- Export curated data to reusable formats such as RDF, CSV, and
  Wikidata-oriented batch formats.
- Keep the app local-first and usable without cloud sync.

## Non-goals

- No automated claim extraction.
- No automatic crawling of the web.
- No cloud sync or multi-user collaboration in the current product.
- No LLM extraction in the current product.
- No in-app note-taking or document authoring in the current product.
- No requirement to preserve immutable local copies of sources as the durable
  annotation target.
- No per-position annotation model tied to exact offsets in a source document.
- No direct editing of Wikidata from inside nodi.
- No RDF triplestore as the working data store.
- No claim qualifiers in the current data model.

## Current Product Baseline

### Source Queue

Users can add URL sources, view queued and active sources, mark sources done, and
mark sources irrelevant.

Requirements:

- A source record identifies the source under review and tracks its queue
  status, topic, and review state.
- The source may be cached or rendered for inspection, but durable annotations
  must not depend on preserving an immutable copy of the source content.
- A source status is one of `queued`, `active`, `done`, or `irrelevant`.
- Opening a queued source for inspection does not by itself move it to `active`.
- A queued source moves to `active` when the user starts review work, such as
  setting the topic, confirming or creating a mention, creating a claim, or
  changing another source-level review value.
- `done` means annotation is complete.
- `irrelevant` means the source should not reappear as a candidate.
- Links harvested from fetched pages are candidates only; they are not
  automatically promoted to sources.
- Candidate links can be queued or dismissed by the user.

### Source Viewer

The source viewer is the main review workspace for a single source. It lets the
user inspect source text, work with matches and highlights, create mentions,
create or update entities and labels, add claims, and manage the source's review
state without leaving the source context.

The viewer must keep three kinds of context visible:

- the source being reviewed
- the page topic, when the source has one
- the active topic, which is the entity currently receiving claims

#### Source Text and Highlights

The viewer presents the source text as available at review time. The source may
be fetched, cached, or rendered through an external document surface, but durable
graph data must not depend on exact character offsets in the source.

Known entity labels are matched against the source text. Matches are rendered as
highlights so the user can inspect and act on them.

Highlight states:

- confirmed: the source contains a surface form already confirmed as a mention
  of one or more entities
- suggested: the surface form matches exactly one known entity label, but no
  mention has been confirmed for this source
- ambiguous: the surface form matches labels for multiple candidate entities and
  needs user resolution
- selected: the user has selected source text and is deciding what to create
  from that text selection

Highlights are visual aids only. Matches and highlights are recomputed from
source text, labels, and mentions; they are not the durable annotation model.

#### Text Selection Flow

The user can select source text. The selected text value becomes the working
surface form for the annotation flow.

From a text selection, the user can:

- create a text-valued claim about the active topic
- link the surface form to an existing entity, creating or confirming a mention
- create a new entity seeded from the surface form
- add the surface form as a label to an entity
- create one or more entity-valued claims about the active topic
- combine mention creation and claim creation in a single save action where
  appropriate

The durable result of the selection is based on the selected text value, source
reference, entities, mentions, labels, and claims. It must not depend on the
selection's character offsets.

#### Match Resolution Flow

The viewer shows computed matches for known labels in the source text.

For a suggested match, the user can confirm that the surface form mentions the
candidate entity or reject it for this source context.

For an ambiguous match, the user can choose one or more candidate entities. This
creates one confirmed mention per chosen entity.

A single surface form may legitimately refer to multiple entities in the same
source, such as a character entity and a fictional-person entity sharing a name.
The viewer must support this without forcing the user to choose only one.

#### Mention and Label Flow

Confirming a match creates a mention:

```text
source + surface form + entity
```

When the user creates a new entity from selected text, the selected text becomes
the entity's initial label. If an existing entity is linked from a surface form
that is not already one of its labels, the viewer should allow or perform label
creation so future matching can find that surface form.

Mentions remain source-contextual. Labels belong to entities and are reused for
matching across sources.

#### Claim Creation Flow

Claims created from the source viewer are attributed to the active topic.

A claim can have:

- a literal text value derived from the selected source text
- an object entity linked from the selected surface form or chosen through search

When a claim is created from source context, the viewer should preserve source
and mention provenance where available.

Switching between text-valued and entity-valued claims must keep the value kind
clear: a normal claim has either a literal value or an object entity, not both.

#### Page Topic and Active Topic Context

The page topic describes what the source is about. It may be an entity topic or
a free-text subject description.

The active topic is the entity currently being inspected or edited in the source
viewer. Claims created from selected text are about the active topic.

The active topic defaults to the page topic when the page topic is an entity.
Clicking a confirmed mention can switch the active topic to the mentioned
entity.

The viewer must make it clear when the active topic differs from the page topic,
so the user understands which entity will receive new claims.

#### Relationship Context

When the page topic and active topic are different entities, the viewer shows
known claim paths connecting them where possible.

The relationship context helps answer: "Why am I editing this entity while
reviewing this source?"

The viewer should support direct relationship creation when no link exists,
typically by creating a claim from the page topic to the active topic with a
chosen property.

#### Source Review State

The viewer lets the user update source-level review state.

Opening a queued source for inspection does not make it active. The source moves
to active only when the user starts review work, such as setting a topic,
confirming or creating a mention, creating a claim, or changing another
source-level review value.

The user can mark a source done when review is complete or irrelevant when it
should not remain in the review queue.

### Page Topic and Active Topic

Each source can have a page topic. During annotation, the user can temporarily
focus an active topic that differs from the page topic.

Requirements:

- A source has either a single entity topic, a free-text subject description, or
  no topic yet.
- Pages about multiple things should use a free-text subject description rather
  than forcing a single entity topic.
- The active topic defaults to the page topic when the page topic is an entity.
- Clicking a confirmed entity mention can switch the active topic.
- Claims created from selected text are attributed to the active topic.
- The UI must make the relationship between page topic and active topic visible
  when they differ.

### Entities and Labels

Entities are the things in the local knowledge graph. Labels are the strings
used to find and display them.

Requirements:

- Entity types are defined by the active domain ontologies, not hardcoded by
  the product.
- Different domains may define different entity types, and the active set of
  domain ontologies may partially overlap. Overlap is acceptable; matching,
  pickers, and suggestions operate on the union.
- Users should be able to provide their own domain ontologies with their own
  entity types, properties, role concepts, external identifiers, and export
  mappings.
- Examples of entity types include people, characters, films, tunes, caves,
  organisations, locations, events, publications, and other domain-specific
  concepts.
- Entity creation runs through ontology-defined **class templates**. A class
  template is a recipe applied when a new entity is created from selected text
  or when an existing label is promoted to an entity. At minimum it sets the
  surface form as the entity's primary label and assigns its type.
- All ontology classes are templates. A plain class such as `Person` is a
  degenerate template whose only effect is to set the label and type. Richer
  templates seed additional claims; for example, an `Actor` template may
  produce a `Person` entity with an `occupation = Actor` claim.
- Role-like selections such as `actor` are class templates, not fixed product
  primitives. The same mechanism handles plain classes, role-flavored classes,
  and any future composite recipes.
- The ontology determines which properties are available for each entity type
  and what value kind or entity range those properties expect.
- Each entity has one or more labels.
- Labels can be primary names, aliases, alternate spellings, translations, or
  stage names.
- Matching runs against all labels, case-insensitively.
- Multiple entities may share the same label.
- Adding a label should affect future source matching without modifying source
  content or migrating stored annotation positions.

### Mentions

A mention is a durable assertion that a surface form in a source refers to an
entity.

Conceptually:

```text
source + surface form + entity
```

Requirements:

- A mention is created only by user confirmation or by an explicit user action
  such as linking selected text to an entity.
- Unconfirmed suggestions are matches, not mentions, and are not persisted.
- A mention stores the exact `surface_form` seen or selected in the source.
- A mention is source-contextual: the same surface form may refer to different
  entities in different sources.
- A mention applies to that surface form in the context of the source, not to a
  single character-offset occurrence.
- One source and surface form may correspond to multiple confirmed entities.
- The product model should allow distinct mentions for different surface forms
  referring to the same entity in the same source.
- Mentions can support claims as provenance.
- Deleting a mention unconfirms the entity-source-surface-form link but does not
  delete entities, labels, or claims.

### String Matching

String matching compares source text with entity labels and returns computed
matches for the source viewer. Matching is a review aid; it does not create
mentions or claims by itself.

Requirements:

- Matching runs on demand when a source is reviewed.
- The matcher compares source text against labels from the entity graph defined
  by the active set of domain ontologies.
- A match represents a label found in source text.
- A match is not durable data and is not a mention until the user confirms or
  links it.
- Positions are computed at scan time only as rendering hints for highlights and
  are not stored permanently.
- Matches are case-insensitive.
- Longer overlapping matches take priority over shorter contained matches.
- Boundary matching is lenient: the characters around the match must be
  non-word characters or source-text edges.
- Client highlighting must mirror server matching closely enough that returned
  matches can be acted on reliably.
- Match status is resolved as `confirmed`, `suggested`, or `ambiguous` by
  comparing candidate entities with confirmed mentions for the same source and
  surface form.
- A confirmed match can include more than one confirmed entity.

### Claims

A claim is a graph statement captured during review. It records something the
user believes is supported by a source or by their review of that source.

At its simplest, a claim can be captured as source-scoped labels:

```text
subject label -> predicate label -> object label
```

Example:

```text
"Megan Harries" -> "is a" -> "character"
```

As the graph becomes more structured, any part of the claim can be resolved:

- a subject label can be promoted to an entity
- a predicate label can be promoted to an ontology property
- an object label can remain literal text or be promoted to an entity
- external mappings such as Wikidata PIDs can be attached to properties
- entity labels can be reconciled to external identifiers

For a source with a page topic, claim creation can default the subject to the
page topic or active topic. For example, if the page topic is
`ex:Pobol_y_Cwm`, the user can create more structured statements such as:

```text
ex:Megan_Harries -> a -> "role"
ex:Megan_Harries -> rdfs:label -> "Megan Harries"
ex:Pobol_y_Cwm -> "role" -> ex:Megan_Harries
```

Requirements:

- Claims are open-world graph statements. The system should allow capture even
  when the ontology has no matching entity type, property, or value shape.
- Ontology guidance should recommend properties, expected value kinds, entity
  ranges, role concepts, external mappings, and export behavior, but should not
  block data capture unless a future PRD explicitly changes validation
  behavior.
- A claim may start with subject, predicate, or object represented as plain text
  labels.
- A subject label can later be promoted to an entity.
- A predicate label can later be promoted to an ontology property or mapped to
  an external property such as a Wikidata PID.
- An object label can remain a literal value or later be promoted to an entity.
- Previously used predicate labels should be suggested during claim entry so the
  user can converge on consistent property language over time.
- Claims can be created from selected source text, from a confirmed mention, or
  manually without a specific highlight.
- Claims do not require a mention. Some claims are supported by the user's
  review of the source as a whole rather than by a single surface form.
- When source or mention context is available, claims should preserve it as
  provenance.
- In structured mode, a normal claim should keep value kind clear: the object is
  either a literal value or an entity link.
- Claims should remain flat. Qualifiers are not part of the current model.

Current implementation note: the existing schema requires an entity subject. The
product direction is broader: early capture should be possible with text labels
first, followed by later promotion into entities and ontology properties.

### Ontology and Property Guidance

Ontologies define domain knowledge used to guide capture, structure graph data,
drive the user experience, validate or warn about data shape, and map local
labels to external systems. They are not a prerequisite for capturing claims.

A domain ontology may define:

- entity types and role concepts
- class templates (see below), including degenerate templates for plain classes
- property labels and property identifiers
- which properties are commonly used with which entity types
- expected value kinds and entity ranges
- default values, seed claims, and promotion rules
- external identifier systems
- export mappings, including mappings to RDF predicates or Wikidata PIDs

A class template is a recipe that runs at entity creation and at
label-to-entity promotion. At minimum it sets the new entity's primary label
from the surface form and assigns its type. A richer template may seed
additional claims, such as `occupation = Actor` for an `Actor` template, and
may reference other entities the template requires.

Requirements:

- The product must support multiple loaded domain ontologies, including
  user-provided ontologies.
- At any time the user has an active set of one or more domain ontologies.
  Matching, suggestions, pickers, validation, reconciliation hints, and export
  operate on the union of the active set.
- Overlap between active ontologies is acceptable. When ontologies declare
  conflicting expectations for the same class or property, the UI should
  surface the options, prefer the more specific where reasonable, and must not
  block capture.
- The initial domain ontologies should cover Welsh film and television, Welsh
  traditional music, and caves and caving in Wales.
- The default Welsh film and television ontology currently lives at
  `data/ontology/welsh-film-tv.ttl`.
- The current `NODI_ONTOLOGY` mechanism points to a single ontology file. The
  product direction is in-app selection of the active set, with
  `NODI_ONTOLOGY` either accepting a list or being superseded by an in-app
  domain selector.
- Ontologies can evolve over time. Updating an ontology should improve future
  suggestions, defaults, validation, promotion paths, reconciliation hints, and
  export mappings without invalidating already captured graph data.
- The server exposes compiled ontology guidance through `GET /api/ontology` or a
  successor API that supports multiple domains.
- Entity type pickers, role choices, property pickers, value editors,
  reconciliation hints, validation messages, and export mappings should use
  ontology guidance where available.
- Class templates apply both when a new entity is created from selected text
  and when an existing label is promoted to an entity, so the creation and
  promotion paths stay uniform.
- A template may reference other entities (for example, an `Actor` template
  referencing the `Actor` occupation entity). The ontology should declare
  those reference entities, or the system should create them on first use.
- With multiple active ontologies, the template picker shows the union.
  Template provenance — which ontology defined a template — should be visible
  so the user can disambiguate name collisions.
- Ontology-defined properties should be recommended when they match the current
  subject, predicate text, selected surface form, source context, or active
  domain.
- Previously used predicate labels should remain discoverable even when they are
  not defined in an ontology.
- Users must be able to enter custom predicate labels, entity labels, and
  literal values when the ontology does not yet describe the needed concept.
- A user-created predicate label can later be promoted to, merged with, or
  mapped onto an ontology property.
- A user-created entity label can later be promoted to, merged with, or mapped
  onto an ontology-defined entity type or external identifier.
- Ontology validation should guide, warn, and improve consistency, but should
  not block capture unless a future PRD explicitly changes validation behavior.

### Relationship Context

The source viewer shows relationship context as a short stack, not as an
unbounded graph browser. The stack helps the user understand which entity is
being edited and how it relates to the source topic.

The stack starts with the source and its page topic. The user may then focus one
nearby entity from the source, and inspect or edit claims about that entity.
Those claims may themselves point to entities, but the viewer should not expand
into a long chain of nested entity contexts.

Conceptually:

```text
Source
  page topic
    focused entity
      claims about focused entity
        linked claim values
```

Requirements:

- The source viewer should keep the context stack short enough to remain
  understandable during review.
- The stack should normally include the source, page topic, active or focused
  entity, and claims about that focused entity.
- Claims about the focused entity may link to other entities, but those linked
  entities should be shown as claim values rather than automatically expanding
  the stack indefinitely.
- The user may deliberately switch focus to a linked entity, replacing the
  focused entity level of the stack.
- The page topic and focused entity may have one or more ontology classes or
  domain roles, and the UI should have space to show those without turning the
  stack into a long graph path.
- Relationship context is derived from claims and labels; it is not a separate
  data model.
- Ontology-defined predicates should be suggested where available, but users
  must be able to enter a custom predicate label.
- Adding a relationship from the stack creates a claim.
- Removing a relationship from the stack removes the underlying claim link, not
  the entities, labels, or source.

### Reconciliation

Reconciliation links local graph items to Wikidata identifiers. In the current
product this is limited to Wikidata entity reconciliation. Future versions
should allow additional reconciliation targets and may also support mapping
predicates or ontology properties to external identifiers.

Requirements:

- Wikidata search is manual and entity-specific.
- Reconciliation should start from the entity's labels and ontology/domain
  context where available.
- Confirming a Wikidata candidate creates a confirmed external ID for the local
  entity.
- A local entity can exist and be used in claims without being reconciled.
- Reconciliation improves export quality and external linking, but must not
  block capture.
- External IDs are stored separately from claims.
- Search attempts are logged in `EntitySearchLog`.
- Search logs are UI memory, not provenance.
- A confirmed Wikidata external ID supersedes the search-log fallback in the UI.
- The entity list can filter to unreconciled entities.
- Future versions should support reconciliation targets beyond Wikidata.

### Notability and Export Readiness

nodi distinguishes between captured graph data and export-ready graph data. A
claim may be useful locally even when it is not yet suitable for publication or
external contribution.

Users should be able to mark claims or facts as notable when they believe the
statement is important enough to include in higher-confidence exports, even if it
has not yet been reconciled to an external database.

Requirements:

- Claims may have an export or readiness status derived from their structure,
  ontology mapping, reconciliation state, and user notability marker.
- A claim can be marked notable by the user.
- A notability marker is a user curation signal, not an assertion that the claim
  is universally important.
- A notability marker should be independent of whether the claim's entities are
  reconciled to external databases.
- Claims can remain useful working data even when they are not marked notable.
- Export filters should support domain or ontology scope.
- Export filters should support at least three levels:
  - everything captured, including labels and weakly structured claims
  - claims expressed with ontology mappings
  - claims expressed with ontology mappings and either reconciled to an external
    database or marked notable
- The UI should make unresolved, unmapped, unreconciled, and non-notable claims
  visible so the user can improve them over time.

### Export

Export turns the local graph and source-backed capture data into reusable
formats. Export should be filterable by domain or ontology and by export
readiness level.

Requirements:

- Export must not require cloud services.
- Export should support domain or ontology filters.
- Export should support the readiness levels defined in Notability and Export
  Readiness.
- Export should preserve entities, labels, mentions, claims, sources, external
  IDs, notability markers, and provenance where the target format supports them.
- The broadest export level should include unresolved labels and weakly
  structured claims rather than silently dropping them.
- RDF exports should support Turtle files and, where useful for provenance or
  source-scoped statements, RDF quads or named graphs.
- RDF export should use external identifiers and mapped predicates where
  available, falling back to local identifiers, blank nodes, or label-based
  representations where needed.
- QuickStatements-compatible export should be available for sufficiently mapped
  and reconciled Wikidata-oriented claims.
- CSVW export should be supported for tabular data with machine-readable
  metadata.
- Ontology mappings should drive export behavior where available.
- Export should make omissions and downgraded representations clear, especially
  when the selected format cannot express the full local graph.

## User Experience Principles

nodi is a tool for careful human curation. The interface should make complex
graph-building work approachable without hiding the underlying provenance or
structure when the user needs it.

Requirements:

- The UI should be accessible to keyboard, screen reader, and low-vision users.
- Core review workflows should be usable without relying on color alone.
- The interface should use clear language from `docs/terms.md`.
- The UI should guide users through capture, disambiguation, promotion,
  reconciliation, and export readiness without requiring them to understand RDF
  or ontology internals upfront.
- Ontology-driven suggestions and defaults should reduce repetitive work without
  preventing free-form capture.
- Advanced graph, ontology, and export details should be available when needed
  but should not dominate the basic review workflow.
- The source viewer should prioritize focus and context: source, page topic,
  focused entity, relevant claims, and next useful action.
- Destructive actions should be clear and reversible where practical.
- Bulk actions should provide feedback and should not silently create or delete
  large amounts of durable data.

## Design Invariants

Future changes should preserve these decisions unless a deliberate PRD update
explains why they are changing.

- nodi is an open-world curation tool: users must be able to capture useful
  graph data before every entity, predicate, or value is fully modelled.
- Ontology guidance improves suggestions, defaults, validation, promotion,
  reconciliation, and export, but must not block capture unless explicitly
  changed by a future PRD.
- The product must support multiple domains and user-provided ontologies.
- The user selects an active set of one or more domain ontologies. Matching,
  suggestions, pickers, validation, reconciliation hints, and export operate on
  the union of that set; overlap between ontologies is acceptable.
- Entity creation and label-to-entity promotion run through ontology-defined
  class templates. A template at minimum sets the primary label and type;
  richer templates seed additional claims.
- A claim may begin as labels and later be promoted into entities, ontology
  properties, external identifiers, and export mappings.
- The source reference plus selected text value, surface form, label, or entity
  link is the durable annotation anchor.
- Mentions are `source + surface form + entity`, not per-position annotations.
- Source content may change over time; nodi should preserve the user's curated
  graph and provenance even when exact document positions are no longer valid.
- Unconfirmed matches are ephemeral.
- Labels drive matching; adding labels updates future scans.
- A page topic and active topic are different concepts.
- A surface form can refer to more than one entity at the same time.
- Claim provenance matters and should not be discarded during editing.
- Claims can be supported by source-level review even when no specific highlight
  or mention exists.
- Reconciliation is manual confirmation, not automatic identity assignment.
- Reconciliation improves linking and export but must not block local graph
  capture.
- Search logs are UI memory, not evidence.
- Notability markers are user curation signals for export readiness, not
  universal importance judgements.
- Export must tolerate partial structure and make unresolved or downgraded data
  visible rather than silently dropping it.
- The UI must remain accessible, user-friendly, and centered on the curator's
  review workflow rather than exposing raw data-model complexity by default.
- Irrelevant source decisions are durable.
- The product should remain useful for careful manual curation even when no
  external service is reachable.

## Regression Checklist for Future Changes

Before merging a meaningful product change, check the following:

- Can a user add a source, open it, set a topic, confirm a mention, add a claim,
  mark the source done, and export?
- Does a queued source stay queued when merely opened for inspection?
- Does a queued source transition to active after the first annotation or
  source-level review change?
- Can a user capture a label-first claim when the subject, predicate, or object
  is not yet represented by an ontology concept?
- Can a user create a claim manually without selecting a highlight or confirming
  a mention?
- Do confirmed, suggested, ambiguous, and selected highlights remain visually
  distinct?
- Does matching still handle labels with punctuation and non-ASCII letters?
- Can two entities share one label without data loss?
- Can one surface form be confirmed for multiple entities?
- Can different surface forms in the same source refer to the same entity
  without overwriting each other?
- Does claim editing preserve source, mention, and source-level provenance?
- Can labels be promoted to entities, and can predicate labels be promoted or
  mapped to ontology properties?
- Does the source viewer context stack still show the source, page topic,
  focused entity, and relevant claims without expanding into an unbounded graph
  browser?
- Can ontology-driven suggestions, defaults, role choices, and validation
  warnings be bypassed when the user needs free-form capture?
- Can a user work with more than one domain or ontology without hardcoded entity
  types leaking into the UI?
- Can a user mark a claim or fact as notable and filter export by readiness
  level?
- Does Wikidata search logging still distinguish "not searched" from "searched
  but not confirmed"?
- Does export still work when entities are unreconciled, predicates are
  unmapped, or claims contain unresolved labels?
- Does the broadest export level include weakly structured claims instead of
  silently dropping them?
- Do RDF/Turtle, RDF quads or named graphs, QuickStatements-compatible export,
  and CSVW behavior remain clear about omissions and downgraded representations?
- Are core workflows accessible by keyboard and understandable without relying
  on color alone?
- Does a marked-irrelevant URL stay out of future candidate lists?
- Does the ontology still load from the default file, from `NODI_ONTOLOGY`, and
  through the intended future path for multiple loaded domains?

## Known Product Risks

These are current areas where future development should be careful:

- The source rendering surface must be kept safe from hostile fetched markup.
- Claim creation and editing should continue moving toward stronger validation
  of text-valued versus entity-valued properties.
- The server and client matching behavior must stay aligned.
- API request bodies should become more consistently validated over time.
- Prototype-grade interactions such as prompts, broad keyboard shortcuts, and
  bulk actions need careful UX treatment before the product is relied on for
  large datasets.

## Future Development Principles

- Prefer improvements that make human curation faster without hiding decisions.
- Preserve reversibility where practical, especially around claims, mentions,
  reconciliation, and source status.
- Keep domain-specific knowledge in the ontology or domain documentation rather
  than scattering it through UI code.
- Keep source, entity, mention, claim, and reconciliation concepts separate.
- When adding automation, make it advisory first and require explicit user
  confirmation before writing durable data.

## Reference Documents

- `README.md` - concise product overview and setup.
- `docs/ARCHITECTURE.md` - data model and design rationale.
- `docs/ui.md` - UI behavior and interaction reference.
- `docs/api.md` - API contract.
- `docs/matching.md` - string matching behavior.
- `docs/domain.md` - domain properties and external ID systems.
- `data/ontology/welsh-film-tv.ttl` - file-driven ontology source.
