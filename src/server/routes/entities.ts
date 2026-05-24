import { Hono } from 'hono'
import { getEntities, getEntityDetail, createEntity, updateEntity, deleteEntity, mergeEntities } from '../db/queries'
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

router.post('/:id/merge', async c => {
  const canonicalId = parseInt(c.req.param('id'))
  const body = await c.req.json() as { absorbIds?: unknown }
  if (!Array.isArray(body.absorbIds) || body.absorbIds.length === 0 || !body.absorbIds.every((x: unknown) => typeof x === 'number')) {
    return c.json({ error: 'absorbIds must be a non-empty array of entity ids' }, 400)
  }
  const canonical = getEntityDetail(canonicalId)
  if (!canonical) return c.json({ error: 'Canonical entity not found' }, 404)
  const merged = mergeEntities(canonicalId, body.absorbIds as number[])
  return c.json(merged)
})

export default router
