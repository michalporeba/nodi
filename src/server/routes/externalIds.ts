import { Hono } from 'hono'
import { getExternalIds, addExternalId, updateExternalId, deleteExternalId } from '../db/queries'

const router = new Hono()

router.get('/entities/:id/external-ids', c => {
  const entityId = parseInt(c.req.param('id'))
  return c.json(getExternalIds(entityId))
})

router.post('/entities/:id/external-ids', async c => {
  const entityId = parseInt(c.req.param('id'))
  const body = await c.req.json() as { system: string; value: string; url?: string; confirmed?: boolean }
  if (!body.system || !body.value) return c.json({ error: 'system and value are required' }, 400)
  const eid = addExternalId({ entity_id: entityId, ...body })
  return c.json(eid, 201)
})

router.patch('/external-ids/:id', async c => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const updated = updateExternalId(id, body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

router.delete('/external-ids/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteExternalId(id)
  return c.json({ ok: true })
})

export default router
