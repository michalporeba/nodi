import { Hono } from 'hono'
import { getOntology } from '../ontology/loader'

const router = new Hono()

router.get('/', c => {
  const ont = getOntology()
  return c.json({
    classes: ont.classes,
    properties: ont.properties,
    templates: ont.templates,
  })
})

export default router
