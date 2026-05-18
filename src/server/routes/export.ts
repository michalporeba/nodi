import { Hono } from 'hono'
import { Writer, DataFactory } from 'n3'
import { zipSync, strToU8 } from 'fflate'
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

router.get('/csvw', c => {
  const readiness = parseReadiness(c.req.query('readiness'))
  const entities = getAllEntitiesForExport(undefined, readiness)
  const { by_key, pid_map } = getOntology()

  // Group entities by type
  const byType = new Map<string, typeof entities>()
  for (const entity of entities) {
    const group = byType.get(entity.type) ?? []
    group.push(entity)
    byType.set(entity.type, group)
  }

  const files: Record<string, Uint8Array> = {}
  const tableDescriptors: object[] = []

  for (const [type, typeEntities] of byType) {
    // Collect all property keys used by this type
    const propKeys = new Set<string>()
    for (const entity of typeEntities) {
      for (const claim of entity.claims) propKeys.add(claim.property)
    }
    const props = [...propKeys].sort()

    // CSV header + rows
    const header = ['id', 'primary_label', 'wikidata_qid', ...props]
    const rows = [header.join(',')]
    for (const entity of typeEntities) {
      const qid = entity.external_ids.find(e => e.system === 'wikidata')?.value ?? ''
      const claimValues: Record<string, string> = {}
      for (const claim of entity.claims) {
        const existing = claimValues[claim.property]
        const val = claim.object_label ?? claim.value ?? ''
        claimValues[claim.property] = existing ? `${existing}|${val}` : val
      }
      const cols = [
        entity.id,
        `"${entity.primary_label.replace(/"/g, '""')}"`,
        qid,
        ...props.map(p => `"${(claimValues[p] ?? '').replace(/"/g, '""')}"`)
      ]
      rows.push(cols.join(','))
    }

    const filename = `${type.replace(/[^a-z0-9_-]/gi, '_')}.csv`
    files[filename] = strToU8(rows.join('\n'))

    // CSVW column descriptors
    const columns = [
      { name: 'id', datatype: 'integer', titles: 'id' },
      { name: 'primary_label', datatype: 'string', titles: 'primary_label' },
      { name: 'wikidata_qid', datatype: 'string', titles: 'wikidata_qid' },
      ...props.map(p => {
        const pid = pid_map[p] ?? by_key[p]?.pid ?? null
        const col: Record<string, string> = { name: p, datatype: 'string', titles: p }
        if (pid) col['propertyUrl'] = `http://www.wikidata.org/prop/direct/${pid}`
        return col
      })
    ]
    tableDescriptors.push({ url: filename, tableSchema: { columns } })
  }

  const metadata = { '@context': 'http://www.w3.org/ns/csvw', tables: tableDescriptors }
  files['metadata.json'] = strToU8(JSON.stringify(metadata, null, 2))

  const zip = zipSync(files)
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="nodi-export-csvw.zip"',
    }
  })
})

router.get('/quickstatements', c => {
  const entities = getAllEntitiesForExport(undefined, 'publication-ready')
  const { pid_map } = getOntology()

  const lines: string[] = []
  const entityQid = new Map<number, string>()
  for (const entity of entities) {
    const wikidata = entity.external_ids.find(e => e.system === 'wikidata' && e.confirmed)
    if (wikidata) entityQid.set(entity.id, wikidata.value)
  }

  for (const entity of entities) {
    const subjectQid = entityQid.get(entity.id)
    if (!subjectQid) continue
    for (const claim of entity.claims) {
      const pid = pid_map[claim.property]
      if (!pid) continue
      if (claim.object_entity_id) {
        const objectQid = entityQid.get(claim.object_entity_id)
        if (objectQid) {
          lines.push(`${subjectQid}\t${pid}\t${objectQid}`)
        } else {
          lines.push(`# warning: object entity ${claim.object_entity_id} has no Wikidata QID for ${subjectQid} ${pid}`)
        }
      } else if (claim.value) {
        lines.push(`${subjectQid}\t${pid}\t"${claim.value}"`)
      }
    }
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nodi-quickstatements.txt"',
    }
  })
})

export default router
