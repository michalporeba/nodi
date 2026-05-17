import { Hono } from 'hono'
import { findRelationshipPaths } from '../db/queries'

const router = new Hono()

router.get('/', c => {
  const from = parseInt(c.req.query('from') ?? '')
  const to = parseInt(c.req.query('to') ?? '')
  if (!from || !to) return c.json({ error: 'from and to are required' }, 400)
  return c.json(findRelationshipPaths(from, to))
})

export default router
