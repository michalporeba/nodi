import { Hono } from 'hono'
import { getUsedProperties } from '../db/queries'

const router = new Hono()

router.get('/used', c => {
  const subjectType = c.req.query('subject_type')
  return c.json(getUsedProperties(subjectType))
})

export default router
