import { Hono } from 'hono'
import { createClaim, deleteClaim, updateClaim, getEntityById } from '../db/queries'
import { getOntology } from '../ontology/loader'
import { validate, ValidationError } from '../validation'

const router = new Hono()

function claimWarnings(property: string, objectEntityId: number | null | undefined): string[] {
  const ont = getOntology()
  const shape = ont.by_key[property]
  if (!shape) return []
  const warnings: string[] = []
  if (objectEntityId) {
    if (shape.value_type === 'text') {
      warnings.push(`Property "${property}" expects a text value, not an entity.`)
    } else if (shape.class_range) {
      const entity = getEntityById(objectEntityId)
      if (entity && entity.type !== shape.class_range) {
        warnings.push(`Property "${property}" expects type "${shape.class_range}", got "${entity.type}".`)
      }
    }
  } else if (shape.value_type === 'entity') {
    warnings.push(`Property "${property}" expects an entity value, not text.`)
  }
  return warnings
}

router.post('/', async c => {
  let body: {
    subject_entity_id?: number | null
    subject_label?: string | null
    property: string
    value?: string
    object_entity_id?: number
    mention_id?: number
    source_id?: number
  }
  try {
    body = validate(await c.req.json(), {
      subject_entity_id: { type: 'number', nullable: true },
      subject_label: { type: 'string', nullable: true },
      property: { type: 'string', required: true },
      value: { type: 'string' },
      object_entity_id: { type: 'number' },
      mention_id: { type: 'number' },
      source_id: { type: 'number' },
    })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message, fields: err.fields }, 400)
    throw err
  }
  if (!body.subject_entity_id && !body.subject_label) {
    return c.json({ error: 'Either subject_entity_id or subject_label is required' }, 400)
  }
  if (!body.value && !body.object_entity_id) {
    return c.json({ error: 'Either value or object_entity_id is required' }, 400)
  }
  const claim = createClaim(body)
  const warnings = claimWarnings(body.property, body.object_entity_id)
  if (warnings.length) console.warn(`[ontology] claim ${claim.id}:`, warnings.join('; '))
  return c.json({ ...claim, warnings }, 201)
})

router.patch('/:id', async c => {
  const id = parseInt(c.req.param('id'))
  let body: {
    value?: string | null
    object_entity_id?: number | null
    property?: string
    subject_entity_id?: number | null
    subject_label?: string | null
    notable?: boolean
  }
  try {
    body = validate(await c.req.json(), {
      value: { type: 'string', nullable: true },
      object_entity_id: { type: 'number', nullable: true },
      property: { type: 'string' },
      subject_entity_id: { type: 'number', nullable: true },
      subject_label: { type: 'string', nullable: true },
      notable: { type: 'boolean' },
    })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message, fields: err.fields }, 400)
    throw err
  }
  const updated = updateClaim(id, body)
  if (!updated) return c.json({ error: 'Not found' }, 404)
  const warnings = claimWarnings(updated.property, updated.object_entity_id)
  if (warnings.length) console.warn(`[ontology] claim ${updated.id}:`, warnings.join('; '))
  return c.json({ ...updated, warnings })
})

router.delete('/:id', c => {
  const id = parseInt(c.req.param('id'))
  deleteClaim(id)
  return c.json({ ok: true })
})

export default router
