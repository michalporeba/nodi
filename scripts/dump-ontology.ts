#!/usr/bin/env bun
// Dumps the compiled ontology — used to verify template loading (Phase 3 verification).
import { loadOntology } from '../src/server/ontology/loader'
import { resolve } from 'node:path'

const path = process.argv[2] ?? resolve(process.cwd(), 'data/ontology/welsh-film-tv.ttl')
const ont = loadOntology(path)

console.log(`Classes (${ont.classes.length}):`)
for (const c of ont.classes) console.log(`  ${c}`)

console.log(`\nProperties (${ont.properties.length}):`)
for (const p of ont.properties) console.log(`  ${p.key} [${p.value_type}] applies_to=[${p.applies_to.join(',')}]`)

console.log(`\nTemplates (${ont.templates.length}):`)
for (const t of ont.templates) {
  const seeds = t.seed_claims.map(s => `${s.property}=${s.value}`).join(', ')
  console.log(`  ${t.name} → ${t.target_class}${seeds ? ` seeds=[${seeds}]` : ''} (${t.source})`)
}
