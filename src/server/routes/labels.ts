import { Hono } from 'hono'
import { addLabel, deleteLabel } from '../db/queries'

const router = new Hono()

router.post('/entities/:id/labels', async c => {
  const entityId = parseInt(c.req.param('id'))
  const body = await c.req.json() as { value: string; language?: string; is_primary?: boolean; is_alias?: boolean }
  if (!body.value) return c.json({ error: 'value is required' }, 400)
  const label = addLabel({ entity_id: entityId, ...body })
  return c.json(label, 201)
})

router.delete('/labels/:id', c => {
  const id = parseInt(c.req.param('id'))
  const result = deleteLabel(id)
  if (!result.ok) return c.json({ error: result.error }, 400)
  return c.json({ ok: true })
})

export default router
