# Core Terms

This document defines the vocabulary used to describe nodi's source review,
matching, annotation, and graph-building workflows.

The main distinction is that nodi does not use a positional annotation model.
User review starts from source text, but the durable data is expressed as
sources, surface forms, entities, labels, mentions, claims, external IDs, and
notability markers.

## Glossary

| Term | Meaning | Durable? |
|---|---|---|
| Source | The page or external document being reviewed. | Yes |
| Source text | The readable text exposed by a source at review time. | Contextual |
| Text selection | A piece of source text selected by the user during review. | No |
| Surface form | The exact text string as seen or selected in a source. | Yes, inside a Mention |
| Page topic | The subject of a source: an entity, a free-text description, or absent. | Yes |
| Active topic | The entity currently receiving claims in the source viewer. | UI state |
| Entity | A real, fictional, conceptual, or domain-specific thing in the knowledge graph. | Yes |
| Domain ontology | A loadable definition of entity types, class templates, properties, external IDs, and export mappings for a knowledge domain. | Yes |
| Active set | The user-selected set of one or more domain ontologies currently in effect. | User preference |
| Class template | An ontology-defined recipe for creating an entity: sets a label and type, optionally seeds additional claims. | Yes, in ontology |
| Label | A stored name, title, alias, translation, or alternate spelling belonging to an Entity. | Yes |
| Match | A computed occurrence of a known Label in source text. | No |
| Highlight | The visual rendering of a Match or Text selection in the UI. | No |
| Mention | A durable assertion that an Entity is referred to by a Surface form in a Source. | Yes |
| Claim | A durable graph assertion about an Entity. Subject, predicate, or object may begin as a text label. | Yes |
| Property | The predicate slot of a claim, ranging from a plain text label to an ontology-defined property mapped to an external identifier. | Yes |
| Promotion | The workflow that turns a plain text label inside a claim into an entity or ontology property. | No |
| Provenance | The chain of evidence — source, mention, claim — supporting a durable assertion. | Yes |
| External ID | A confirmed identifier linking a local entity to an external system such as Wikidata. | Yes |
| Reconciliation | The user-driven workflow of finding and confirming External IDs for a local entity. | No |
| Notability marker | A user signal that a claim is important enough for higher-confidence exports. | Yes |
| Annotation | Umbrella term for the user workflow that turns source text into Mentions, Claims, Labels, or Entities. | No separate object |

## Definitions

### Source

A source is the page or external document being reviewed.

Examples:

- A web page.
- A Wikipedia article.
- A Google Doc or similar externally-authored document in a future browser
  extension workflow.

The source is identified and tracked by nodi, but durable annotations must not
depend on a preserved immutable copy of the source or exact character offsets in
that source.

### Source Text

Source text is the readable text exposed by a source at review time.

Source text gives the user material to inspect, select, and match against known
entity labels. It may change if the external source changes or if the rendering
environment changes.

### Text Selection

A text selection is a piece of source text selected by the user during review.

A text selection is temporary UI state. It can become:

- a Claim value
- a Mention surface form
- a Label for an Entity
- the seed text for a new Entity

The durable result is the selected text value and the graph data created from it,
not the character offsets of the selection.

### Surface Form

A surface form is the exact text string as seen or selected in a source.

Examples:

- `Megan Harries`
- `Megan Harris`
- `Megan Harries (nee Owen)`

A surface form is source-contextual. It records how something appeared in a
particular source, not the canonical name of an entity.

### Page Topic

The page topic is the subject of a source. A source has either an entity page
topic, a free-text subject description, or no topic yet.

Pages about multiple things should use a free-text description rather than
forcing a single entity topic.

### Active Topic

The active topic is the entity currently receiving claims in the source viewer.

The active topic defaults to the page topic when the page topic is an entity.
The user can switch the active topic by clicking a confirmed mention or by
direct selection.

The active topic is viewer state, not a stored field on a source. Its purpose
is to make it obvious which entity will receive new claims created from
selected text. The viewer must make the relationship between page topic and
active topic visible when they differ.

### Entity

An entity is a thing in the local knowledge graph.

Examples:

- a person
- a fictional person
- a character
- a film
- a traditional tune
- a cave
- an organisation
- a location

Entity types are domain-configurable. The current product must support multiple
domains, including overlapping domains and distinct domains.

### Domain Ontology

A domain ontology is a loadable definition of entity types, class templates,
properties, role concepts, external identifier systems, and export mappings
for a particular knowledge domain — such as Welsh film and television, Welsh
traditional music, or caves and caving in Wales.

Multiple domain ontologies can coexist. Users can provide their own.

### Active Set

The active set is the user-selected set of one or more domain ontologies
currently in effect.

Matching, suggestions, pickers, validation, reconciliation hints, and export
operate on the union of the active set. Overlap between ontologies in the
active set is acceptable; the underlying graph naturally handles it.

When ontologies in the active set declare conflicting expectations for the
same class or property, the UI should surface the options, prefer the more
specific where reasonable, and must not block capture.

### Class Template

A class template is an ontology-defined recipe for creating an entity.

At minimum a template sets the new entity's primary label from a surface form
and assigns its type. A richer template may seed additional claims; for
example, an `Actor` template may produce a `Person` entity with an
`occupation = Actor` claim.

All ontology classes are templates. A plain class such as `Person` is a
degenerate template whose only effect is to set the label and type.

Templates apply both when a new entity is created from selected text and when
an existing label is promoted to an entity, so the creation and promotion
paths stay uniform.

### Label

A label is a stored name, title, alias, translation, or alternate spelling for an
entity.

Labels drive matching. When nodi scans source text, it looks for known labels.
Multiple entities can share the same label.

A label is not the same as a surface form:

- A label belongs to an entity and is reused across sources.
- A surface form belongs to a source context and records what text appeared
  there.

### Match

A match is a computed occurrence of a known label in source text.

Matches are generated by the matching engine when a source is reviewed. They are
not durable data. A match can be:

- `suggested` - one candidate entity, not yet confirmed
- `ambiguous` - multiple candidate entities, none confirmed yet
- `confirmed` - at least one candidate entity has a confirmed Mention for the
  source

### Highlight

A highlight is the visual rendering of a match or text selection in the UI.

Highlights help the user inspect and act on source text. They are not durable
data and should not be treated as annotations in the data model.

A highlight can convey either a match status — `confirmed`, `suggested`, or
`ambiguous` — or a UI state such as `selected`, which describes the user's
current text selection rather than a match against known labels. The two
should not be confused: match statuses come from comparing labels with
confirmed mentions, while `selected` is purely interaction state.

### Mention

A mention is a durable assertion that an entity is referred to by a surface form
in a source.

Conceptually:

```text
source + surface form + entity
```

Example:

```text
Source: Pobol y Cwm article
Surface form: "Megan Harries"
Entity: Megan Harries the Character
```

The same source and surface form may mention multiple entities:

```text
"Megan Harries" -> Character entity
"Megan Harries" -> FictionalPerson entity
```

A mention is not tied to one character-offset occurrence. It says that this
surface form refers to this entity in this source context.

### Claim

A claim is a durable graph assertion about an entity.

Examples:

```text
Pobol y Cwm -- cast_member --> Sue Roderick
Megan Harries -- performer --> Sue Roderick
Pobol y Cwm -- original_language --> cy
```

A claim may be supported by a source and/or a mention. A claim value can be a
literal text value or a link to another entity.

Claims can be captured before every part is fully modelled. A claim's subject,
predicate, or object may begin as a plain text label and be promoted to an
entity or ontology property later (see **Promotion**). The claim itself does
not change identity when its parts are promoted; existing references to it
remain valid.

### Property

A property is the predicate slot of a claim. A property may be expressed in
three increasingly structured forms:

- a plain text predicate label, used during early capture
- an ontology-defined property with a stable local identifier
- an ontology-defined property mapped to an external identifier such as a
  Wikidata PID

Predicate labels can be promoted to ontology properties later. Existing claims
that used the predicate label are not invalidated by the promotion; they gain
structure rather than being rewritten.

Previously used predicate labels should be discoverable during claim entry,
even when they are not yet defined in any ontology.

### Promotion

Promotion is the workflow that converts a plain text label inside a claim into
a more structured form:

- a subject or object label promoted to an entity
- a predicate label promoted to an ontology property
- an entity mapped to an external identifier
- a property mapped to an external predicate such as a Wikidata PID

Promotion preserves the existing claim and adds structure to it. The parts of
a claim do not have to be promoted at the same time.

### Provenance

Provenance is the chain of evidence supporting a durable assertion:

- `source → mention → claim` when a specific surface form is involved
- `source → claim` when a claim is supported by review of the source as a
  whole, without a specific highlight

Provenance is durable. Claim editing must preserve it where available.

Search logs are UI memory, not provenance: an unconfirmed search attempt does
not count as evidence for a claim.

### External ID

An external ID is a confirmed identifier linking a local entity to an external
system, such as a Wikidata QID.

External IDs are stored separately from claims. A local entity can exist and
be used in claims without any external ID. Adding an external ID improves
export quality and external linking but does not change the entity's local
meaning.

### Reconciliation

Reconciliation is the user-driven workflow of finding and confirming External
IDs for a local entity.

In the current product reconciliation is limited to Wikidata. Future versions
will support additional targets and may also map predicates to external
identifiers.

Reconciliation is manual confirmation, not automatic identity assignment. It
improves export and external linking but must never block local capture.

### Notability Marker

A notability marker is a user signal that a claim is important enough to
include in higher-confidence exports, even when its entities have not been
reconciled to an external database.

A notability marker is a curation signal, not a universal importance
judgement. It is independent of reconciliation: a claim may be notable without
external IDs, or reconciled without being marked notable.

### Annotation

Annotation is an umbrella term for the user workflow that turns source text into
mentions, claims, labels, or entities.

Annotation is not a separate durable object in the current model. Avoid using
"annotation" when a more specific term such as text selection, surface form,
match, highlight, mention, label, or claim is meant.

## Important Distinctions

### Surface Form Is Not Label

A surface form is how text appears in a source. A label is stored on an entity
and reused for matching.

### Match Is Not Mention

A match is computed. A mention is confirmed and durable.

### Highlight Is Not Annotation

A highlight is visual. Annotation is the workflow that may create durable graph
data.

### Mention Is Not Claim

A mention says an entity is referred to in a source by a surface form. A claim
says something about an entity.

### Selection Is Not Position

A text selection provides a text value. The durable result does not depend on
the selected character offsets.

### Page Topic Is Not Active Topic

The page topic describes what the source is about. The active topic is the
entity currently receiving claims in the viewer. They often coincide; when
they differ, the viewer must make the difference visible so the user
understands which entity will receive new claims.

### Reconciliation Is Not Notability

Reconciliation links a local entity to an external identifier. A notability
marker is a user signal that a claim is important enough to export. They are
orthogonal: a claim may be notable without reconciliation, and reconciliation
does not by itself mark a claim notable.
