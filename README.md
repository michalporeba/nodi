# nodi

**nodi** (Welsh: *to mark, to note*) is a local-first knowledge curation tool for extracting structured data from web pages and documents. It is designed for researchers who need to collect, annotate, and reconcile entities and facts from multiple sources before contributing to Wikidata or other knowledge bases.

nodi is intentionally narrow in scope: it solves the problem of going from a web page or a document to structured, sourced, reconciled data — without automated extraction, without noise, and without losing provenance.

## What it does

- Fetches and caches web pages locally for inspection during review (the cache is not the durable annotation anchor)
- Scans loaded pages for known entity names and highlights them
- Lets you select any text and annotate it as an entity (Person, Film, Character, etc.)
- Tracks mentions — which entities appear in which sources
- Records structured claims about entities, with the source mention as provenance
- Searches Wikidata to reconcile local entities with QIDs and other external IDs
- Manages a queue of pages to review, with status tracking
- Exports data as Turtle (RDF) or CSV for downstream analysis

## What it does not do

- Automated extraction — every claim requires a human decision
- Crawling — pages are added explicitly, not discovered automatically
- Cloud sync — everything stays on your machine in a local SQLite database
- LLM extraction — not in the current version

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Backend | Hono |
| Frontend | React + Vite |
| Database | SQLite via `bun:sqlite` |
| RDF export | n3.js |
| String matching | Custom, server-side |

## Getting started

```bash
# Install dependencies
bun install

# Run database migrations
bun run migrate

# Start development server
bun run dev
```

The app runs at `http://localhost:3000`.

The database is stored at `data/nodi.db`. This file is gitignored. The schema is in `docs/schema.sql` and is applied by the migration runner on first start.

## Project layout

```
src/
  server/           # Hono backend
    db/             # schema, migrations, query functions
    routes/         # one file per resource
    matching/       # string matching engine
  client/           # React SPA
    components/     # UI components
    hooks/          # React hooks
    api/            # typed fetch wrappers
data/
  nodi.db           # SQLite database (gitignored)
  ontology/         # file-driven domain ontologies (TTL)
docs/
  PRD.md            # product requirements and regression guardrails
  terms.md          # shared vocabulary for source review and graph data
  schema.sql        # canonical schema
  ARCHITECTURE.md   # data model and design decisions
  api.md            # API routes reference
  ui.md             # UI components and interaction flows
  matching.md       # string matching engine behaviour
  domain.md         # human-readable companion to the Welsh film/TV ontology
```

## Data portability

All data lives in `data/nodi.db` (SQLite). You can:

- Back it up by copying the file
- Query it directly with any SQLite client
- Export to Turtle via the export route
- Export to CSV via the export route
- Read it from Python notebooks using `sqlite3` or `sqlalchemy`

## Scope and roadmap

Multi-domain support is a core requirement. The initial domain ontologies cover **Welsh film and television**, **Welsh traditional music**, and **caves and caving in Wales**. Each domain is defined as a separate ontology file under `data/ontology/`; the current default lives at `data/ontology/welsh-film-tv.ttl`. Users can provide their own ontologies.

At any time the user has an active set of one or more domain ontologies. Matching, suggestions, pickers, validation, and export operate on the union of the active set. See `docs/PRD.md` and `docs/terms.md` for the full design.

PDF annotation, local LLM suggestions, and SHACL validation are out of scope for this version.
