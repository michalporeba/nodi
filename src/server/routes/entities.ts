import { Hono } from 'hono'
import { getEntities, getEntityDetail, createEntity, updateEntity, deleteEntity } from '../db/queries'

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
  const body = await c.req.json() as { type: string; primary_label: string; language?: string }
  if (!body.type || !body.primary_label) return c.json({ error: 'type and primary_label are required' }, 400)
  const entity = createEntity({ type: body.type as any, primary_label: body.primary_label, language: body.language })
  return c.json(entity, 201)
})

router.patch('/:id', async c => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
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
