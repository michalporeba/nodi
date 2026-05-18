# Ontology rework plan

Move the hardcoded ontology in `src/client/data/properties.ts` to editable
turtle files on disk, parsed at startup and served to the client. Multiple
ontologies can be loaded into an active set; matching, pickers, validation,
and export operate on the union (see `docs/PRD.md`).

## Decisions

- **Format**: SHACL (`sh:NodeShape`, `sh:PropertyShape`, `sh:class`, `sh:datatype`)
  plus a small `nodi:` extension vocabulary for things SHACL doesn't cover:
  `nodi:textAllowed`, `nodi:defaultEntityType`, `nodi:seedClaim`,
  and template metadata for class templates (see below).
- **Class templates**: every ontology class is a creation/promotion template.
  Plain classes (e.g. `nodi:Person`) are degenerate templates that just set a
  label and type. Richer templates (e.g. `nodi:Actor`) seed additional claims.
  The current TTL carries `nodi:roleLabel` and `nodi:seedClaim` on
  *properties*; the direction is to move these to dedicated class templates
  on the *class* side so the template picker can offer them uniformly at
  entity creation and at label-to-entity promotion.
- **DB keys**: keep short string keys in `Claim.property` (`cast_member`,
  not `wdt:P161`). Loader maps IRI → short key via `rdfs:label` or the IRI's
  local name. No migration.
- **Validation**: advisory only. UI warns, server logs and attaches `warnings`
  on the response, never blocks. Custom property keys (not in the ontology)
  keep working as today.
- **Active set**: the product loads multiple ontology files and the user
  selects which are active. `NODI_ONTOLOGY` currently accepts a single file
  path; it will either accept a list or be superseded by in-app domain
  selection. Overlap between ontologies in the active set is acceptable.
- **In-app editor**: out of scope short-term. File-on-disk only.

## Current state (for reference)

- Entity types: TS union in `src/client/api/types.ts:5-14`.
- Properties: hardcoded list in `src/client/data/properties.ts:16`.
- Used by the picker only (`src/client/components/PropertyPicker.tsx:49`).
- Server (`src/server/routes/claims.ts:6`) does no shape validation.
- Three places hand-sync the same info today:
  `src/client/data/properties.ts`, `docs/domain.md`, the PID map in
  `src/server/routes/export.ts:7-19`.
- `n3` is already a dependency (used in `export.ts`), so no new deps needed.

## Phase 1 — swap to file-driven (parity with today)

Largely complete: `data/ontology/welsh-film-tv.ttl` exists and the loader,
`GET /api/ontology`, and `NODI_ONTOLOGY` env var are in place. Outstanding:

1. Replace `getCuratedProperties` usages in `PropertyPicker.tsx`,
   `ClaimRow.tsx` (both `TextClaimEditor` and `EntityClaimEditor`).
   Delete `src/client/data/properties.ts` once nothing imports it.
2. Verify `GET /api/ontology` shape covers everything the client needs
   so the curated TS list can be deleted cleanly.

## Phase 2 — defaults and advisory warnings

3. Use `nodi:defaultEntityType` in `TextClaimEditor.promoteToNew` to
   preselect the type instead of showing all 9 buttons.
4. Use `nodi:seedClaim` to auto-add seed claims when promoting
   (e.g. `cast_member` promotion seeds `occupation = actor`).
5. Use `sh:class` in `EntityClaimEditor.replaceWith` to filter the entity
   search to allowed types.
6. Advisory warnings: server attaches `warnings: string[]` on claim
   create/update if range/domain off; UI shows a small badge on the
   claim row and dims off-shape items in the picker.

## Phase 3 — class templates

7. Define class-side templates in the TTL: a `nodi:Actor` class with
   `rdfs:subClassOf nodi:Person` plus seed claims, similarly for
   director/screenwriter/etc. Keep the current per-property
   `nodi:seedClaim` data as a fallback during transition.
8. Update the loader to compile class templates into the JSON returned
   by `GET /api/ontology`.
9. Update the entity creation and label-to-entity promotion paths to use
   a template picker (union over the active set, with template
   provenance shown for disambiguation), replacing the hardcoded
   per-type button strip.

## Phase 4 — active set (multi-ontology)

10. Accept a list of ontology paths (either via `NODI_ONTOLOGY` accepting
    a comma-separated list or via a config file) and load them into a
    union index.
11. Add an in-app domain selector so the user can choose which loaded
    ontologies are in the active set. Surface conflict resolution rules
    (prefer the more specific, never block capture) in the UI.
12. `src/server/routes/export.ts` reads its PID map from the active set
    instead of hardcoding it; export gains a domain filter.
13. `docs/domain.md` and any sibling per-domain docs are companion
    references to their TTL files, not authoritative.

## Example: what cast_member looks like in turtle

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix wdt:  <http://www.wikidata.org/prop/direct/> .
@prefix nodi: <http://nodi.local/ontology#> .

nodi:Film a rdfs:Class ; rdfs:label "Film" .
nodi:Person a rdfs:Class ; rdfs:label "Person" .

wdt:P161 a rdf:Property ;
  rdfs:label "cast_member" ;
  sh:class nodi:Person ;
  nodi:textAllowed true ;
  nodi:defaultEntityType nodi:Person ;
  nodi:seedClaim [ nodi:property wdt:P106 ; nodi:value "actor" ] .

nodi:FilmShape a sh:NodeShape ;
  sh:targetClass nodi:Film ;
  sh:property [ sh:path wdt:P161 ] ,
              [ sh:path wdt:P57  ] .
```
