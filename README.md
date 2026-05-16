# nodi

**nodi** (Welsh: *to mark, to note*) is a local-first knowledge curation tool for extracting structured data from web pages and documents. It is designed for researchers who need to collect, annotate, and reconcile entities and facts from multiple sources before contributing to Wikidata or other knowledge bases.

nodi is intentionally narrow in scope: it solves the problem of going from a web page or a document to structured, sourced, reconciled data — without automated extraction, without noise, and without losing provenance.

## What it does

- Fetches and stores web pages locally with full HTML snapshots
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
docs/
  schema.sql        # canonical schema
  ARCHITECTURE.md   # data model and design decisions
  api.md            # API routes reference
  ui.md             # UI components and interaction flows
  matching.md       # string matching engine behaviour
  domain.md         # entity types, properties, external ID systems
```

## Data portability

All data lives in `data/nodi.db` (SQLite). You can:

- Back it up by copying the file
- Query it directly with any SQLite client
- Export to Turtle via the export route
- Export to CSV via the export route
- Read it from Python notebooks using `sqlite3` or `sqlalchemy`

## Scope and roadmap

The current implementation covers the **Welsh film and television** domain as a starting point. The entity types, properties, and external ID systems are defined in `docs/domain.md`. The architecture is designed to support additional domains (Welsh folk music, etc.) in future iterations.

PDF annotation, local LLM suggestions, and SHACL validation are out of scope for this version.
