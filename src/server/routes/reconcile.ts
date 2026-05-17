import { Hono } from 'hono'
import { getEntityDetail, addExternalId, recordEntitySearch } from '../db/queries'

const WIKIDATA_SEARCH = 'https://www.wikidata.org/w/api.php'

const ENTITY_TYPE_HINTS: Record<string, string> = {
  Person: 'Q5',
  FictionalPerson: 'Q15632617',
  Character: 'Q15773317',
  Film: 'Q11424',
  Series: 'Q5398426',
  Episode: 'Q21191270',
  Organisation: 'Q43229',
  Location: 'Q17334923',
}

interface WikidataCandidate {
  qid: string
  label: string
  description: string | null
  url: string
  wikipedia_en: string | null
  wikipedia_cy: string | null
}

async function searchWikidata(q: string, type?: string): Promise<WikidataCandidate[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: q,
    language: 'en',
    type: 'item',
    limit: '10',
    format: 'json',
    origin: '*',
  })
  if (type && ENTITY_TYPE_HINTS[type]) {
    // Wikidata search doesn't filter by type directly, but we include for context
  }

  const resp = await fetch(`${WIKIDATA_SEARCH}?${params}`, {
    headers: { 'User-Agent': 'nodi/1.0 (local knowledge curation tool)' },
  })
  const data = await resp.json() as { search: Array<{ id: string; label: string; description?: string }> }

  const candidates: WikidataCandidate[] = []
  for (const item of data.search ?? []) {
    // Fetch sitelinks for Wikipedia URLs
    let wikipedia_en: string | null = null
    let wikipedia_cy: string | null = null
    try {
      const sitelinkParams = new URLSearchParams({
        action: 'wbgetentities',
        ids: item.id,
        props: 'sitelinks',
        format: 'json',
        origin: '*',
      })
      const sitelinkResp = await fetch(`${WIKIDATA_SEARCH}?${sitelinkParams}`, {
        headers: { 'User-Agent': 'nodi/1.0 (local knowledge curation tool)' },
      })
      const sitelinkData = await sitelinkResp.json() as { entities: Record<string, { sitelinks: Record<string, { site: string; title: string }> }> }
      const entity = sitelinkData.entities[item.id]
      if (entity?.sitelinks?.enwiki) {
        wikipedia_en = `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title.replace(/ /g, '_'))}`
      }
      if (entity?.sitelinks?.cywiki) {
        wikipedia_cy = `https://cy.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.cywiki.title.replace(/ /g, '_'))}`
      }
    } catch {
      // Ignore sitelink fetch errors
    }

    candidates.push({
      qid: item.id,
      label: item.label,
      description: item.description ?? null,
      url: `https://www.wikidata.org/wiki/${item.id}`,
      wikipedia_en,
      wikipedia_cy,
    })
  }

  return candidates
}

const router = new Hono()

router.get('/wikidata', async c => {
  const entityId = c.req.query('entity_id')
  const q = c.req.query('q')
  const type = c.req.query('type')

  let searchTerm = q
  let entityType = type

  if (entityId) {
    const entity = getEntityDetail(parseInt(entityId))
    if (!entity) return c.json({ error: 'Entity not found' }, 404)
    searchTerm = entity.primary_label
    entityType = entity.type
  }

  if (!searchTerm) return c.json({ error: 'q or entity_id is required' }, 400)

  try {
    const candidates = await searchWikidata(searchTerm, entityType)
    if (entityId) {
      recordEntitySearch(parseInt(entityId), 'wikidata', candidates.length)
    }
    return c.json(candidates)
  } catch (err) {
    return c.json({ error: `Wikidata search failed: ${(err as Error).message}` }, 502)
  }
})

router.post('/wikidata/confirm', async c => {
  const body = await c.req.json() as {
    entity_id: number
    qid: string
    wikipedia_en?: string | null
    wikipedia_cy?: string | null
  }

  if (!body.entity_id || !body.qid) {
    return c.json({ error: 'entity_id and qid are required' }, 400)
  }

  addExternalId({
    entity_id: body.entity_id,
    system: 'wikidata',
    value: body.qid,
    url: `https://www.wikidata.org/wiki/${body.qid}`,
    confirmed: true,
  })

  if (body.wikipedia_en) {
    addExternalId({
      entity_id: body.entity_id,
      system: 'wikipedia_en',
      value: body.wikipedia_en,
      url: body.wikipedia_en,
      confirmed: true,
    })
  }

  if (body.wikipedia_cy) {
    addExternalId({
      entity_id: body.entity_id,
      system: 'wikipedia_cy',
      value: body.wikipedia_cy,
      url: body.wikipedia_cy,
      confirmed: true,
    })
  }

  const entity = getEntityDetail(body.entity_id)
  return c.json(entity)
})

export default router
