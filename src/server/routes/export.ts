import { Hono } from 'hono'
import { Writer, DataFactory } from 'n3'
import { getAllEntitiesForExport, getLabelOnlyClaims, type ExportReadiness } from '../db/queries'
import { getOntology } from '../ontology/loader'

const { namedNode, literal, quad, blankNode } = DataFactory

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const WD = 'http://www.wikidata.org/entity/'
const WDT = 'http://www.wikidata.org/prop/direct/'
const LOCAL = 'http://nodi.local/entity/'
const LOCAL_SOURCE = 'http://nodi.local/source/'

const router = new Hono()

function parseReadiness(raw: string | undefined): ExportReadiness {
  if (raw === 'ontology-mapped' || raw === 'publication-ready') return raw
  return 'everything'
}

router.get('/turtle', async c => {
  const entityIdsParam = c.req.query('entity_ids')
  const entityIds = entityIdsParam ? entityIdsParam.split(',').map(Number) : undefined
  const readiness = parseReadiness(c.req.query('readiness'))
  const format = c.req.query('format') === 'nquads' ? 'nquads' : 'turtle'

  const entities = getAllEntitiesForExport(entityIds, readiness)
  const pidMap = getOntology().pid_map

  const writerFormat = format === 'nquads' ? 'application/n-quads' : undefined
  const writer = new Writer(writerFormat
    ? { format: writerFormat }
    : { prefixes: { wd: WD, wdt: WDT, rdfs: RDFS, nodi: LOCAL } }
  )

  for (const entity of entities) {
    const wikidataEid = entity.external_ids.find(e => e.system === 'wikidata' && e.confirmed)
    const subject = wikidataEid ? namedNode(`${WD}${wikidataEid.value}`) : namedNode(`${LOCAL}${entity.id}`)

    // Labels (no named graph)
    for (const label of entity.labels) {
      writer.addQuad(quad(
        subject,
        namedNode(`${RDFS}label`),
        literal(label.value, label.language ?? 'en')
      ))
    }

    // External IDs as sameAs (no named graph)
    for (const eid of entity.external_ids) {
      if (eid.url && eid.confirmed) {
        writer.addQuad(quad(
          subject,
          namedNode('http://www.w3.org/2002/07/owl#sameAs'),
          namedNode(eid.url)
        ))
      }
    }

    // Claims
    for (const claim of entity.claims) {
      const pid = pidMap[claim.property]
      const predicate = pid ? namedNode(`${WDT}${pid}`) : namedNode(`${LOCAL}prop/${claim.property}`)
      const graph = format === 'nquads' && claim.source_id
        ? namedNode(`${LOCAL_SOURCE}${claim.source_id}`)
        : undefined

      if (claim.object_entity_id) {
        const objEntity = entities.find(e => e.id === claim.object_entity_id)
        const objWikidata = objEntity?.external_ids.find(e => e.system === 'wikidata' && e.confirmed)
        const obj = objWikidata ? namedNode(`${WD}${objWikidata.value}`) : namedNode(`${LOCAL}${claim.object_entity_id}`)
        writer.addQuad(graph ? quad(subject, predicate, obj, graph) : quad(subject, predicate, obj))
      } else if (claim.value) {
        writer.addQuad(graph ? quad(subject, predicate, literal(claim.value), graph) : quad(subject, predicate, literal(claim.value)))
      }
    }
  }

  // For "everything" level: emit label-only (unresolved subject) claims as blank node triples
  if (readiness === 'everything') {
    const labelOnlyClaims = getLabelOnlyClaims()
    const labelToBlank = new Map<string, ReturnType<typeof blankNode>>()
    for (const claim of labelOnlyClaims) {
      if (!claim.subject_label) continue
      let subjectNode = labelToBlank.get(claim.subject_label)
      if (!subjectNode) {
        subjectNode = blankNode()
        labelToBlank.set(claim.subject_label, subjectNode)
        writer.addQuad(quad(subjectNode, namedNode(`${RDFS}label`), literal(claim.subject_label)))
      }
      const pid = pidMap[claim.property]
      const predicate = pid ? namedNode(`${WDT}${pid}`) : namedNode(`${LOCAL}prop/${claim.property}`)
      if (claim.value) {
        writer.addQuad(quad(subjectNode, predicate, literal(claim.value)))
      } else if (claim.object_entity_id) {
        writer.addQuad(quad(subjectNode, predicate, namedNode(`${LOCAL}${claim.object_entity_id}`)))
      }
    }
  }

  const output = await new Promise<string>((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  const isNquads = format === 'nquads'
  return new Response(output, {
    headers: {
      'Content-Type': isNquads ? 'application/n-quads; charset=utf-8' : 'text/turtle; charset=utf-8',
      'Content-Disposition': `attachment; filename="nodi-export.${isNquads ? 'nq' : 'ttl'}"`,
    }
  })
})

router.get('/csv', c => {
  const readiness = parseReadiness(c.req.query('readiness'))
  const entities = getAllEntitiesForExport(undefined, readiness)

  const rows = ['type,id,primary_label,wikidata_external_id,mention_count,claim_count']
  for (const entity of entities) {
    const qid = entity.external_ids.find(e => e.system === 'wikidata')?.value ?? ''
    rows.push([entity.type, entity.id, `"${entity.primary_label.replace(/"/g, '""')}"`, qid, entity.mention_count, entity.claim_count].join(','))
  }

  return new Response(rows.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nodi-entities.csv"' }
  })
})

export default router
