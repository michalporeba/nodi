import { Hono } from 'hono'
import {
  getSources, getSource, createSource, updateSource, getSourceByUrl,
  addSourceLinks, getSourceLinks, getCandidateLinks, createMention,
  getMentionsBySource, getAllLabelsForMatching,
} from '../db/queries'
import { runMatchingEngine } from '../matching/engine'

const router = new Hono()

router.get('/', c => {
  const status = c.req.query('status')
  const type = c.req.query('type')
  return c.json(getSources({ status, type }))
})

router.get('/candidates', c => {
  return c.json(getCandidateLinks())
})

router.get('/:id', c => {
  const id = parseInt(c.req.param('id'))
  const source = getSource(id)
  if (!source) return c.json({ error: 'Not found' }, 404)
  return c.json(source)
})

router.post('/fetch', async c => {
  const body = await c.req.json() as { url: string }
  if (!body.url) return c.json({ error: 'url is required' }, 400)

  const existing = getSourceByUrl(body.url)
  if (existing) return c.json(existing)

  let html: string
  let title: string | null = null
  try {
    const resp = await fetch(body.url, {
      headers: { 'User-Agent': 'nodi/1.0 (local knowledge curation tool)' },
    })
    html = await resp.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    title = titleMatch ? titleMatch[1].trim() : null
  } catch (err) {
    return c.json({ error: `Fetch failed: ${(err as Error).message}` }, 502)
  }

  const source = createSource({
    type: 'url',
    url: body.url,
    title: title ?? undefined,
    content: html,
    status: 'queued',
    fetched_at: new Date().toISOString(),
  })

  // Harvest external links
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi
  const links: Array<{ url: string; title: string | null }> = []
  const seen = new Set<string>()
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1]
    if (!seen.has(url) && url !== body.url) {
      seen.add(url)
      links.push({ url, title: null })
    }
  }
  addSourceLinks(source.id, links)

  return c.json(source, 201)
})

router.patch('/:id', async c => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const updated = updateSource(id, body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

router.get('/:id/matches', async c => {
  const id = parseInt(c.req.param('id'))
  const source = getSource(id)
  if (!source) return c.json({ error: 'Not found' }, 404)
  if (!source.content) return c.json([])
  const matches = await runMatchingEngine(id, source.content)
  return c.json(matches)
})

router.get('/:id/links', c => {
  const id = parseInt(c.req.param('id'))
  return c.json(getSourceLinks(id))
})

router.post('/:id/links/queue', async c => {
  const sourceId = parseInt(c.req.param('id'))
  const body = await c.req.json() as { urls: string[] }
  const created: number[] = []
  for (const url of body.urls) {
    const source = createSource({ type: 'url', url, status: 'queued' })
    created.push(source.id)
  }
  return c.json({ queued: created.length })
})

router.post('/:id/mentions/confirm-all', async c => {
  const sourceId = parseInt(c.req.param('id'))
  const source = getSource(sourceId)
  if (!source?.content) return c.json({ error: 'Not found' }, 404)

  const matches = await runMatchingEngine(sourceId, source.content)
  const existing = getMentionsBySource(sourceId)
  const confirmedEntityIds = new Set(existing.map(m => m.entity_id))

  let confirmed = 0
  const skippedAmbiguous = []

  for (const match of matches) {
    if (match.status === 'ambiguous') {
      skippedAmbiguous.push({ label_value: match.label_value, entity_ids: match.entity_ids })
      continue
    }
    if (match.status === 'suggested' && match.entity_ids.length === 1) {
      const entityId = match.entity_ids[0]
      if (!confirmedEntityIds.has(entityId)) {
        createMention({ entity_id: entityId, source_id: sourceId, surface_form: match.surface_form })
        confirmedEntityIds.add(entityId)
        confirmed++
      }
    }
  }

  return c.json({ confirmed, skipped_ambiguous: skippedAmbiguous })
})

export default router
