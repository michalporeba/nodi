import { Hono } from 'hono'
import { getEntities, getEntityDetail, createEntity, updateEntity, deleteEntity } from '../db/queries'
import { validate, ValidationError } from '../validation'

const router = new Hono()

router.get('/', c => {
  const type = c.req.query('type')
  const q = c.req.query('q')
  const unreconciled = c.req.query('unreconciled') === 'true'
  return c.json(getEntities({ type, q, unreconciled }))
})

router.get('/:id', c => {
  const id = parseInt(c.req.param('id'))
  const entity = getEntityDetail(id)
  if (!entity) return c.json({ error: 'Not found' }, 404)
  return c.json(entity)
})

router.post('/', async c => {
  let body: { type: string; primary_label: string; language?: string }
  try {
    body = validate(await c.req.json(), {
      type: { type: 'string', required: true },
      primary_label: { type: 'string', required: true },
      language: { type: 'string' },
    })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message, fields: err.fields }, 400)
    throw err
  }
  const entity = createEntity({ type: body.type, primary_label: body.primary_label, language: body.language })
  return c.json(entity, 201)
})

router.patch('/:id', async c => {
  const id = parseInt(c.req.param('id'))
  let body: Record<string, unknown>
  try {
    body = validate(await c.req.json(), {
      type: { type: 'string' },
      primary_label: { type: 'string' },
      language: { type: 'string', nullable: true },
    })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message, fields: err.fields }, 400)
    throw err
  }
  updateEntity(id, body)
  const entity = getEntityDetail(id)
  if (!entity) return c.json({ error: 'Not found' }, 404)
  return c.json(entity)
})

router.delete('/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteEntity(id)
  return c.json({ ok: true })
})

export default router
