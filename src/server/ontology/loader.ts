import { readFileSync, watch } from 'node:fs'
import { resolve } from 'node:path'
import { Parser, Store } from 'n3'

const NODI = 'http://nodi.local/ontology#'
const WDT  = 'http://www.wikidata.org/prop/direct/'
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const SH   = 'http://www.w3.org/ns/shacl#'

export type PropertyValueType = 'text' | 'entity' | 'both'

export interface SeedClaim {
  property: string
  value: string
}

export interface PropertyShape {
  key: string
  iri: string
  pid: string | null
  value_type: PropertyValueType
  applies_to: string[]
  class_range: string | null
  default_entity_type: string | null
  role_label: string | null
  seed_claims: SeedClaim[]
}

export interface TemplateShape {
  name: string
  target_class: string
  seed_claims: SeedClaim[]
  source: string
}

export interface CompiledOntology {
  classes: string[]
  properties: PropertyShape[]
  templates: TemplateShape[]
  by_key: Record<string, PropertyShape>
  by_iri: Record<string, PropertyShape>
  /** short property key → Wikidata PID (where defined) */
  pid_map: Record<string, string>
}

const BASE_PATH    = resolve(process.cwd(), 'data/ontology/base.ttl')
const DEFAULT_PATH = resolve(process.cwd(), 'data/ontology/welsh-film-tv.ttl')

function ontologyPaths(): string[] {
  const domain = process.env.NODI_ONTOLOGY
    ? process.env.NODI_ONTOLOGY.split(',').map(p => resolve(process.cwd(), p.trim())).filter(Boolean)
    : [DEFAULT_PATH]
  // base.ttl is always prepended; dedup in case the user explicitly listed it
  return [BASE_PATH, ...domain.filter(p => p !== BASE_PATH)]
}

let cached: CompiledOntology | null = null
let cachedPath: string | null = null

export function getOntology(): CompiledOntology {
  if (!cached) cached = loadOntologies(ontologyPaths())
  return cached
}

export function reloadOntology(): CompiledOntology {
  cached = loadOntologies(ontologyPaths())
  return cached
}

export function loadOntologies(paths: string[]): CompiledOntology {
  if (paths.length === 1) return loadOntology(paths[0])
  const parts = paths.map(p => loadOntology(p))
  // Union: de-duplicate properties by IRI; merge classes and templates
  const classes = new Set<string>()
  const propertiesByIri = new Map<string, PropertyShape>()
  const templates: TemplateShape[] = []
  const pid_map: Record<string, string> = {}
  for (const ont of parts) {
    for (const c of ont.classes) classes.add(c)
    for (const p of ont.properties) if (!propertiesByIri.has(p.iri)) propertiesByIri.set(p.iri, p)
    for (const t of ont.templates) templates.push(t)
  }
  const properties = [...propertiesByIri.values()]
  const by_key: Record<string, PropertyShape> = {}
  const by_iri: Record<string, PropertyShape> = {}
  for (const p of properties) {
    by_key[p.key] = p
    by_iri[p.iri] = p
    if (p.pid) pid_map[p.key] = p.pid
  }
  return { classes: [...classes].sort(), properties, templates, by_key, by_iri, pid_map }
}

export function loadOntology(path: string): CompiledOntology {
  const source = path.split('/').pop() ?? path
  const ttl = readFileSync(path, 'utf8')
  const quads = new Parser().parse(ttl)
  const store = new Store(quads)
  cachedPath = path

  const classes = new Set<string>()
  for (const q of store.getQuads(null, `${RDF}type`, `${RDFS}Class`, null)) {
    classes.add(localName(q.subject.value))
  }

  const properties: PropertyShape[] = []
  for (const q of store.getQuads(null, `${RDF}type`, `${RDF}Property`, null)) {
    const iri = q.subject.value
    const labelQuad = store.getQuads(iri, `${RDFS}label`, null, null)[0]
    const key = labelQuad?.object.value ?? localName(iri)

    const classObj = store.getQuads(iri, `${SH}class`, null, null)[0]
    const datatypeObj = store.getQuads(iri, `${SH}datatype`, null, null)[0]
    const textAllowedObj = store.getQuads(iri, `${NODI}textAllowed`, null, null)[0]
    const defaultTypeObj = store.getQuads(iri, `${NODI}defaultEntityType`, null, null)[0]
    const roleLabelObj = store.getQuads(iri, `${NODI}roleLabel`, null, null)[0]

    let value_type: PropertyValueType
    if (classObj && (textAllowedObj?.object.value === 'true')) value_type = 'both'
    else if (classObj) value_type = 'entity'
    else if (datatypeObj) value_type = 'text'
    else value_type = 'text'

    const seed_claims: SeedClaim[] = []
    for (const seedQ of store.getQuads(iri, `${NODI}seedClaim`, null, null)) {
      const seedNode = seedQ.object
      const propQ = store.getQuads(seedNode, `${NODI}property`, null, null)[0]
      const valQ  = store.getQuads(seedNode, `${NODI}value`, null, null)[0]
      if (propQ && valQ) {
        seed_claims.push({ property: propQ.object.value, value: valQ.object.value })
      }
    }

    properties.push({
      key,
      iri,
      pid: iri.startsWith(WDT) ? iri.slice(WDT.length) : null,
      value_type,
      applies_to: [],
      class_range: classObj ? localName(classObj.object.value) : null,
      default_entity_type: defaultTypeObj ? localName(defaultTypeObj.object.value) : null,
      role_label: roleLabelObj ? roleLabelObj.object.value : null,
      seed_claims,
    })
  }

  const by_iri: Record<string, PropertyShape> = {}
  for (const p of properties) by_iri[p.iri] = p

  // Walk every sh:NodeShape and attach applies_to → property paths.
  for (const shapeQuad of store.getQuads(null, `${RDF}type`, `${SH}NodeShape`, null)) {
    const nodeShape = shapeQuad.subject
    const target = store.getQuads(nodeShape, `${SH}targetClass`, null, null)[0]
    if (!target) continue
    const cls = localName(target.object.value)
    for (const propQ of store.getQuads(nodeShape, `${SH}property`, null, null)) {
      const pathQ = store.getQuads(propQ.object, `${SH}path`, null, null)[0]
      if (!pathQ) continue
      const propShape = by_iri[pathQ.object.value]
      if (propShape && !propShape.applies_to.includes(cls)) propShape.applies_to.push(cls)
    }
  }

  const by_key: Record<string, PropertyShape> = {}
  const pid_map: Record<string, string> = {}
  for (const p of properties) {
    by_key[p.key] = p
    if (p.pid) pid_map[p.key] = p.pid
  }

  // Degenerate templates — one per rdfs:Class (target_class = the class itself, no seeds)
  const templates: TemplateShape[] = [...classes].sort().map(cls => ({
    name: cls,
    target_class: cls,
    seed_claims: [],
    source,
  }))

  // Explicit nodi:Template entries override/extend the degenerate list
  for (const q of store.getQuads(null, `${RDF}type`, `${NODI}Template`, null)) {
    const iri = q.subject.value
    const labelQ = store.getQuads(iri, `${RDFS}label`, null, null)[0]
    const targetQ = store.getQuads(iri, `${NODI}targetClass`, null, null)[0]
    if (!labelQ || !targetQ) continue
    const name = labelQ.object.value
    const target_class = localName(targetQ.object.value)
    const seed_claims: SeedClaim[] = []
    for (const seedQ of store.getQuads(iri, `${NODI}seedClaim`, null, null)) {
      const seedNode = seedQ.object
      const propQ = store.getQuads(seedNode, `${NODI}property`, null, null)[0]
      const valQ  = store.getQuads(seedNode, `${NODI}value`, null, null)[0]
      if (propQ && valQ) seed_claims.push({ property: propQ.object.value, value: valQ.object.value })
    }
    templates.push({ name, target_class, seed_claims, source })
  }

  return {
    classes: [...classes].sort(),
    properties,
    templates,
    by_key,
    by_iri,
    pid_map,
  }
}

function localName(iri: string): string {
  const hash = iri.lastIndexOf('#')
  if (hash !== -1) return iri.slice(hash + 1)
  const slash = iri.lastIndexOf('/')
  if (slash !== -1) return iri.slice(slash + 1)
  return iri
}

/** Watch the ontology file(s) in dev — clears cache on change. */
export function watchOntology(): void {
  if (process.env.NODE_ENV === 'production') return
  for (const path of ontologyPaths()) {
    try {
      watch(path, () => {
        try {
          reloadOntology()
          console.log(`[ontology] reloaded from ${path}`)
        } catch (err) {
          console.error(`[ontology] reload failed:`, err)
        }
      })
    } catch (err) {
      console.warn(`[ontology] watch unavailable for ${path}:`, err)
    }
  }
}

export function ontologySourcePath(): string {
  const paths = ontologyPaths()
  return cachedPath ?? paths.find(p => p !== BASE_PATH) ?? paths[0]
}
