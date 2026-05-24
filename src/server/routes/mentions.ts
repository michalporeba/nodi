import { Hono } from 'hono'
import { createMention, deleteMention, deleteMentionByTriple } from '../db/queries'
import { validate, ValidationError } from '../validation'

const router = new Hono()

router.post('/', async c => {
  let body: { entity_id: number; source_id: number; surface_form: string }
  try {
    body = validate(await c.req.json(), {
      entity_id: { type: 'number', required: true },
      source_id: { type: 'number', required: true },
      surface_form: { type: 'string', required: true },
    })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message, fields: err.fields }, 400)
    throw err
  }
  const mention = createMention(body)
  return c.json(mention, 201)
})

router.delete('/', c => {
  const entity_id = parseInt(c.req.query('entity_id') ?? '')
  const source_id = parseInt(c.req.query('source_id') ?? '')
  const surface_form = c.req.query('surface_form') ?? ''
  if (!entity_id || !source_id || !surface_form) return c.json({ error: 'entity_id, source_id, surface_form required' }, 400)
  deleteMentionByTriple(entity_id, source_id, surface_form)
  return c.json({ ok: true })
})

router.delete('/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteMention(id)
  return c.json({ ok: true })
})

export default router
