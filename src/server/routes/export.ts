import { Hono } from 'hono'
import { Writer, DataFactory } from 'n3'
import { getAllEntitiesForExport } from '../db/queries'

const { namedNode, literal, quad } = DataFactory

const WIKIDATA_PID: Record<string, string> = {
  title: 'P1476', director: 'P57', screenwriter: 'P58', producer: 'P162',
  composer: 'P86', film_editor: 'P1040', cast_member: 'P161', character: 'P674',
  publication_date: 'P577', part_of_series: 'P179', series_ordinal: 'P1545',
  season: 'P4908', genre: 'P136', main_subject: 'P921', country_of_origin: 'P495',
  original_language: 'P364', original_broadcaster: 'P449', production_company: 'P272',
  narrative_location: 'P840', filming_location: 'P915', based_on: 'P144',
  present_in_work: 'P1441', performer: 'P175', voice_actor: 'P725',
  first_appearance: 'P4584', given_name: 'P735', family_name: 'P734',
  gender: 'P21', occupation: 'P106', date_of_birth: 'P569', place_of_birth: 'P19',
  father: 'P22', mother: 'P25', sibling: 'P3373', spouse: 'P26', child: 'P40',
  country: 'P17', inception: 'P571',
}

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const WD = 'http://www.wikidata.org/entity/'
const WDT = 'http://www.wikidata.org/prop/direct/'
const LOCAL = 'http://nodi.local/entity/'

const router = new Hono()

router.get('/turtle', async c => {
  const entityIdsParam = c.req.query('entity_ids')
  const entityIds = entityIdsParam ? entityIdsParam.split(',').map(Number) : undefined

  const entities = getAllEntitiesForExport(entityIds)

  const writer = new Writer({ prefixes: { wd: WD, wdt: WDT, rdfs: RDFS, nodi: LOCAL } })

  for (const entity of entities) {
    // Use Wikidata QID as subject if available, otherwise local ID
    const wikidataEid = entity.external_ids.find(e => e.system === 'wikidata' && e.confirmed)
    const subject = wikidataEid ? namedNode(`${WD}${wikidataEid.value}`) : namedNode(`${LOCAL}${entity.id}`)

    // Labels
    for (const label of entity.labels) {
      writer.addQuad(quad(
        subject,
        namedNode(`${RDFS}label`),
        literal(label.value, label.language ?? 'en')
      ))
    }

    // External IDs as sameAs
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
      const pid = WIKIDATA_PID[claim.property]
      const predicate = pid ? namedNode(`${WDT}${pid}`) : namedNode(`${LOCAL}prop/${claim.property}`)

      if (claim.object_entity_id) {
        const objEntity = entities.find(e => e.id === claim.object_entity_id)
        const objWikidata = objEntity?.external_ids.find(e => e.system === 'wikidata' && e.confirmed)
        const obj = objWikidata ? namedNode(`${WD}${objWikidata.value}`) : namedNode(`${LOCAL}${claim.object_entity_id}`)
        writer.addQuad(quad(subject, predicate, obj))
      } else if (claim.value) {
        writer.addQuad(quad(subject, predicate, literal(claim.value)))
      }
    }
  }

  const turtle = await new Promise<string>((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  return new Response(turtle, {
    headers: { 'Content-Type': 'text/turtle; charset=utf-8', 'Content-Disposition': 'attachment; filename="nodi-export.ttl"' }
  })
})

router.get('/csv', c => {
  const entities = getAllEntitiesForExport()

  // Group by type
  const byType = new Map<string, typeof entities>()
  for (const entity of entities) {
    const group = byType.get(entity.type) ?? []
    group.push(entity)
    byType.set(entity.type, group)
  }

  // Build a combined CSV with type column
  const rows = ['type,id,primary_label,wikidata_qid,mention_count,claim_count']
  for (const entity of entities) {
    const qid = entity.external_ids.find(e => e.system === 'wikidata')?.value ?? ''
    rows.push([entity.type, entity.id, `"${entity.primary_label.replace(/"/g, '""')}"`, qid, entity.mention_count, entity.claim_count].join(','))
  }

  return new Response(rows.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nodi-entities.csv"' }
  })
})

export default router
