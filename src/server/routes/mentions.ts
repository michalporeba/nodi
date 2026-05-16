import { Hono } from 'hono'
import { createMention, deleteMention } from '../db/queries'

const router = new Hono()

router.post('/', async c => {
  const body = await c.req.json() as { entity_id: number; source_id: number; surface_form: string }
  if (!body.entity_id || !body.source_id || !body.surface_form) {
    return c.json({ error: 'entity_id, source_id, and surface_form are required' }, 400)
  }
  const mention = createMention(body)
  return c.json(mention, 201)
})

router.delete('/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteMention(id)
  return c.json({ ok: true })
})

export default router
