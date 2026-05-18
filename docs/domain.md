# Domain: Welsh Film and Television

This document is a **human-readable companion** to the file-driven ontology at
`data/ontology/welsh-film-tv.ttl`. The TTL is authoritative — when the two
disagree, the TTL wins. This file exists to make the domain inspectable
without parsing turtle and to document modelling conventions specific to
Welsh film and television.

Welsh film and television is one of several initial domain ontologies,
alongside Welsh traditional music and caves and caving in Wales. The product
supports loading multiple ontologies into an active set; see `docs/PRD.md`
and `docs/terms.md` for the multi-domain design.

Additional domains live in their own ontology files under `data/ontology/`,
each with their own human-readable companion document if useful. Do not
collapse multiple domains into this file.

---

## Entity types

| Type | Wikidata equivalent | Notes |
|---|---|---|
| `Person` | Q5 (human) | Real people: actors, directors, writers, composers |
| `FictionalPerson` | Q15632617 (fictional human) | Fictional people who are characters |
| `Character` | Q15773317 (television character) + Q1707847 (role) | The character-as-role in a work. May also be a FictionalPerson. Use separate Entity rows and link with claims. |
| `Film` | Q11424 | Feature films |
| `Series` | Q5398426 (television series) | TV series |
| `Episode` | Q21191270 (television series episode) | Individual episodes |
| `Organisation` | — | Broadcasters, production companies |
| `Location` | — | Real places used as narrative or filming locations |
| `Other` | — | Anything that doesn't fit above |

---

## Properties

### Films and Series

| Property key | Wikidata PID | Value type | Notes |
|---|---|---|---|
| `title` | P1476 | text | Use language qualifier where known. Multiple values allowed (Welsh + English titles). |
| `genre` | P136 | Entity | |
| `main_subject` | P921 | Entity | Use for historical events or topics the work is about |
| `country_of_origin` | P495 | Entity (Location) | e.g. Wales (Q25), United Kingdom (Q145) |
| `original_language` | P364 | text | BCP47 language code: `cy`, `en` |
| `original_broadcaster` | P449 | Entity (Organisation) | e.g. S4C |
| `production_company` | P272 | Entity (Organisation) | |
| `cast_member` | P161 | Entity (Person) | Who appears in the work. Character link via Character entity. |
| `character` | P674 | Entity (Character) | Characters present in the work |
| `narrative_location` | P840 | Entity (Location) | Where the story is set |
| `filming_location` | P915 | Entity (Location) | Where it was physically filmed |
| `based_on` | P144 | Entity | Source material (book, play, etc.) |
| `director` | P57 | Entity (Person) | |
| `screenwriter` | P58 | Entity (Person) | |
| `producer` | P162 | Entity (Person) | |
| `composer` | P86 | Entity (Person) | Music composer |
| `film_editor` | P1040 | Entity (Person) | |
| `publication_date` | P577 | text | ISO8601 date |
| `part_of_series` | P179 | Entity (Series) | For episodes or films in a series |

### Episodes

| Property key | Wikidata PID | Value type | Notes |
|---|---|---|---|
| `part_of_series` | P179 | Entity (Series) | |
| `series_ordinal` | P1545 | text | Episode number within series |
| `season` | P4908 | text | Season/series number |
| `director` | P57 | Entity (Person) | May differ per episode |
| `screenwriter` | P58 | Entity (Person) | |
| `cast_member` | P161 | Entity (Person) | |
| `character` | P674 | Entity (Character) | |
| `publication_date` | P577 | text | Broadcast date |
| `title` | P1476 | text | Episode title |

### Characters

| Property key | Wikidata PID | Value type | Notes |
|---|---|---|---|
| `present_in_work` | P1441 | Entity (Film/Series/Episode) | |
| `performer` | P175 | Entity (Person) | Actor playing this character |
| `voice_actor` | P725 | Entity (Person) | |
| `first_appearance` | P4584 | Entity (Episode/Film) | |
| `given_name` | P735 | text | |
| `family_name` | P734 | text | |
| `gender` | P21 | text | Wikidata QID or plain text |
| `occupation` | P106 | text or Entity | Character's in-story occupation |
| `father` | P22 | Entity (Person/FictionalPerson) | |
| `mother` | P25 | Entity (Person/FictionalPerson) | |
| `sibling` | P3373 | Entity | |
| `spouse` | P26 | Entity | |
| `child` | P40 | Entity | |

### Persons

| Property key | Wikidata PID | Value type | Notes |
|---|---|---|---|
| `given_name` | P735 | text | |
| `family_name` | P734 | text | |
| `gender` | P21 | text | |
| `date_of_birth` | P569 | text | ISO8601 date |
| `place_of_birth` | P19 | Entity (Location) | |
| `occupation` | P106 | text or Entity | e.g. actor, director, musician |
| `cast_member_of` | — | Entity (Film/Series) | Inverse of cast_member; local only |

### Organisations

| Property key | Wikidata PID | Value type | Notes |
|---|---|---|---|
| `country` | P17 | Entity (Location) | |
| `inception` | P571 | text | ISO8601 date |

---

## External ID systems

| System key | Wikidata PID | Applies to | URL pattern |
|---|---|---|---|
| `wikidata` | — | all | `https://www.wikidata.org/wiki/{value}` |
| `wikipedia_en` | — | all | full URL stored |
| `wikipedia_cy` | — | all | full URL stored |
| `imdb` | P345 | Person, Film, Series | `https://www.imdb.com/title/{value}/` or `/name/{value}/` |
| `bbc_programme` | P827 | Film, Series, Episode | `https://www.bbc.co.uk/programmes/{value}` |
| `bfi` | P4438 | Film, Series, Person | `https://www.bfi.org.uk/films-tv-people/{value}` |
| `tmdb_movie` | P4947 | Film | `https://www.themoviedb.org/movie/{value}` |
| `tmdb_tv` | P4985 | Series | `https://www.themoviedb.org/tv/{value}` |

---

## Notes on modelling

**Titles in multiple languages** — Welsh-language productions often have both a Welsh and an English title (e.g. Y Gwyll / Hinterland). Store as two separate `title` Claims on the same entity, each with a `value` in the relevant language. Use the `language` field on the Label table for display names.

**Cast member triangle** — the relationship between a Film, a Person, and the Character they play is modelled across three entities:
- Film has claim `cast_member → Person`
- Film has claim `character → Character`
- Character has claim `performer → Person`
- Character has claim `present_in_work → Film`

No qualifiers are needed. The full triangle is reconstructable by querying claims.

**Double-instance Characters** — a character who is both a fictional human and a television character should have two Entity rows of type `FictionalPerson` and `Character`, linked by a `same_as` claim or by sharing a label. In practice, for curation purposes, a single `Character` entity with all relevant claims is usually sufficient.

**Country of origin** — for Welsh productions, use Wales (Q25) rather than United Kingdom (Q145) where appropriate. Both may be recorded.
