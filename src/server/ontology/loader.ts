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

export interface CompiledOntology {
  classes: string[]
  properties: PropertyShape[]
  by_key: Record<string, PropertyShape>
  by_iri: Record<string, PropertyShape>
  /** short property key → Wikidata PID (where defined) */
  pid_map: Record<string, string>
}

const DEFAULT_PATH = resolve(process.cwd(), 'data/ontology/welsh-film-tv.ttl')

function ontologyPath(): string {
  return process.env.NODI_ONTOLOGY
    ? resolve(process.cwd(), process.env.NODI_ONTOLOGY)
    : DEFAULT_PATH
}

let cached: CompiledOntology | null = null
let cachedPath: string | null = null

export function getOntology(): CompiledOntology {
  if (!cached) cached = loadOntology(ontologyPath())
  return cached
}

export function reloadOntology(): CompiledOntology {
  cached = loadOntology(ontologyPath())
  return cached
}

export function loadOntology(path: string): CompiledOntology {
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

  return {
    classes: [...classes].sort(),
    properties,
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

/** Watch the ontology file in dev — clears cache on change. */
export function watchOntology(): void {
  if (process.env.NODE_ENV === 'production') return
  const path = ontologyPath()
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

export function ontologySourcePath(): string {
  return cachedPath ?? ontologyPath()
}
