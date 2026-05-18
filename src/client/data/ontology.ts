import { useEffect, useState } from 'react'
import type { EntityType } from '../api/types'

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
  seed_claims: SeedClaim[]
}

export interface Ontology {
  classes: string[]
  properties: PropertyShape[]
}

let cache: Ontology | null = null
let pending: Promise<Ontology> | null = null

async function fetchOntology(): Promise<Ontology> {
  const res = await fetch('/api/ontology')
  if (!res.ok) throw new Error(`Failed to load ontology: ${res.status}`)
  const data = await res.json() as Ontology
  cache = data
  return data
}

export function loadOntology(): Promise<Ontology> {
  if (cache) return Promise.resolve(cache)
  if (!pending) pending = fetchOntology().finally(() => { pending = null })
  return pending
}

export function useOntology(): Ontology | null {
  const [state, setState] = useState<Ontology | null>(cache)
  useEffect(() => {
    if (state) return
    let cancelled = false
    loadOntology().then(o => { if (!cancelled) setState(o) }).catch(() => {})
    return () => { cancelled = true }
  }, [state])
  return state
}

export function getCuratedProperties(ont: Ontology | null, subjectType?: EntityType): PropertyShape[] {
  if (!ont) return []
  if (!subjectType) return ont.properties
  return ont.properties.filter(p => p.applies_to.includes(subjectType))
}

export function getPropertyShape(ont: Ontology | null, key: string): PropertyShape | undefined {
  return ont?.properties.find(p => p.key === key)
}
