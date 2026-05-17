# Ontology rework plan

Move the hardcoded ontology in `src/client/data/properties.ts` to an editable
turtle file on disk, parsed at startup and served to the client.

## Decisions

- **Format**: SHACL (`sh:NodeShape`, `sh:PropertyShape`, `sh:class`, `sh:datatype`)
  plus a small `nodi:` extension vocabulary for things SHACL doesn't cover:
  `nodi:textAllowed`, `nodi:defaultEntityType`, `nodi:seedClaim`.
- **DB keys**: keep short string keys in `Claim.property` (`cast_member`,
  not `wdt:P161`). Loader maps IRI → short key via `rdfs:label` or the IRI's
  local name. No migration.
- **Validation**: advisory only. UI warns, server logs and attaches `warnings`
  on the response, never blocks. Custom property keys (not in the ontology)
  keep working as today.
- **Swapping**: `NODI_ONTOLOGY=path/to/file.ttl` env var. Multiple-file merge
  can come later.
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

End state: pickers work identically, but the source is editable on disk.

1. `data/ontology/welsh-film-tv.ttl` — translate everything in
   `properties.ts` to SHACL + `nodi:` extensions.
2. `src/server/ontology/loader.ts` — parse with `n3.Parser` at startup,
   compile to an in-memory index keyed by short name. Watch the file in
   dev for hot reload.
3. `GET /api/ontology` — returns the compiled JSON shape.
4. `src/client/data/ontology.ts` — small hook/cache that fetches once.
5. Replace `getCuratedProperties` usages in `PropertyPicker.tsx`,
   `ClaimRow.tsx` (both `TextClaimEditor` and `EntityClaimEditor`).
   Delete `src/client/data/properties.ts`.
6. `NODI_ONTOLOGY=path/to/file.ttl` env var to swap files.

## Phase 2 — defaults and advisory warnings

7. Use `nodi:defaultEntityType` in `TextClaimEditor.promoteToNew` to
   preselect the type instead of showing all 9 buttons.
8. Use `nodi:seedClaim` to auto-add seed claims when promoting
   (e.g. `cast_member` promotion seeds `occupation = actor`).
9. Use `sh:class` in `EntityClaimEditor.replaceWith` to filter the entity
   search to allowed types.
10. Advisory warnings: server attaches `warnings: string[]` on claim
    create/update if range/domain off; UI shows a small badge on the
    claim row and dims off-shape items in the picker.

## Phase 3 — consolidation

11. `src/server/routes/export.ts:7-19` reads its PID map from the
    ontology instead of hardcoding it.
12. `docs/domain.md` becomes a generated/derived view, or a pointer to
    the ttl file.

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
