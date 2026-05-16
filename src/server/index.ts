import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import sourcesRouter from './routes/sources'
import entitiesRouter from './routes/entities'
import labelsRouter from './routes/labels'
import externalIdsRouter from './routes/externalIds'
import mentionsRouter from './routes/mentions'
import claimsRouter from './routes/claims'
import reconcileRouter from './routes/reconcile'
import exportRouter from './routes/export'

// Initialize DB on startup
import { initializeSchema } from './db/client'
initializeSchema()

const app = new Hono()

app.use('*', cors())

// API
const api = new Hono()
api.route('/sources', sourcesRouter)
api.route('/entities', entitiesRouter)
api.route('/', labelsRouter)      // /api/entities/:id/labels and /api/labels/:id
api.route('/', externalIdsRouter) // /api/entities/:id/external-ids and /api/external-ids/:id
api.route('/mentions', mentionsRouter)
api.route('/claims', claimsRouter)
api.route('/reconcile', reconcileRouter)
api.route('/export', exportRouter)

app.route('/api', api)

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', async c => {
    const file = Bun.file('./dist/index.html')
    return new Response(file, { headers: { 'Content-Type': 'text/html' } })
  })
}

const port = parseInt(process.env.PORT ?? '3001')
console.log(`nodi API running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
