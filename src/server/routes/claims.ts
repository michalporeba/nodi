import { Hono } from 'hono'
import { createClaim, deleteClaim } from '../db/queries'

const router = new Hono()

router.post('/', async c => {
  const body = await c.req.json() as {
    subject_entity_id: number
    property: string
    value?: string
    object_entity_id?: number
    mention_id?: number
    source_id?: number
  }
  if (!body.subject_entity_id || !body.property) {
    return c.json({ error: 'subject_entity_id and property are required' }, 400)
  }
  if (!body.value && !body.object_entity_id) {
    return c.json({ error: 'Either value or object_entity_id is required' }, 400)
  }
  const claim = createClaim(body)
  return c.json(claim, 201)
})

router.delete('/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteClaim(id)
  return c.json({ ok: true })
})

export default router
