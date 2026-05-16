import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { Source, SourceStatus, CandidateLink } from '../../api/types'

const STATUS_LABELS: Record<SourceStatus, string> = {
  queued: 'Queued', active: 'Active', done: 'Done', irrelevant: 'Irrelevant',
}

function AddUrlBar({ onAdded }: { onAdded: (source: Source) => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const source = await api.sources.fetch(url.trim())
      onAdded(source)
      setUrl('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
      <input
        className="input"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://en.wikipedia.org/wiki/..."
        type="url"
        disabled={loading}
        style={{ flex: 1 }}
      />
      <button className="btn btn-primary" type="submit" disabled={loading || !url.trim()}>
        {loading ? 'Fetching…' : '+ Add URL'}
      </button>
      {error && <span className="error-msg" style={{ alignSelf: 'center' }}>{error}</span>}
    </form>
  )
}

function SourceCard({ source, onStatusChange }: {
  source: Source
  onStatusChange: (id: number, status: SourceStatus) => void
}) {
  const navigate = useNavigate()
  const [updating, setUpdating] = useState(false)

  async function markIrrelevant() {
    setUpdating(true)
    await api.sources.update(source.id, { status: 'irrelevant' })
    onStatusChange(source.id, 'irrelevant')
    setUpdating(false)
  }

  const domain = source.url ? (() => { try { return new URL(source.url).hostname } catch { return '' } })() : null

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={`badge badge-${source.status}`}>{STATUS_LABELS[source.status]}</span>
            {domain && <span style={{ fontSize: 11, color: '#94a3b8' }}>{domain}</span>}
          </div>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {source.title ?? source.url ?? '(untitled note)'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Added {new Date(source.created_at).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {source.type === 'url' && source.content && (
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/sources/${source.id}`)}>
              Open
            </button>
          )}
          {source.status !== 'irrelevant' && (
            <button className="btn btn-secondary btn-sm" onClick={markIrrelevant} disabled={updating}>
              Irrelevant
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CandidatesPanel({ onQueued }: { onQueued: () => void }) {
  const [candidates, setCandidates] = useState<CandidateLink[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.sources.candidates().then(setCandidates).finally(() => setLoading(false))
  }, [])

  function toggleAll() {
    if (selected.size === candidates.length) setSelected(new Set())
    else setSelected(new Set(candidates.map(c => c.url)))
  }

  async function queueSelected() {
    const urls = Array.from(selected)
    if (!urls.length) return
    // Use bulk fetch (sequential for safety)
    for (const url of urls) {
      try { await api.sources.fetch(url) } catch { /* skip duplicates */ }
    }
    setSelected(new Set())
    onQueued()
  }

  if (loading) return <div className="loading">Loading candidates…</div>
  if (!candidates.length) return <div className="empty-state"><p>No candidate links found.</p></div>

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={selected.size === candidates.length} onChange={toggleAll} />
          Select all ({candidates.length})
        </label>
        {selected.size > 0 && (
          <button className="btn btn-primary btn-sm" onClick={queueSelected}>
            Queue {selected.size} URL{selected.size !== 1 ? 's' : ''}
          </button>
        )}
      </div>
      {candidates.map(c => (
        <div key={c.url} className="card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={selected.has(c.url)} onChange={e => {
            const next = new Set(selected)
            if (e.target.checked) next.add(c.url)
            else next.delete(c.url)
            setSelected(next)
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.url}</div>
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{c.frequency}×</span>
        </div>
      ))}
    </div>
  )
}

export function QueueView() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<SourceStatus | 'all'>('all')
  const [tab, setTab] = useState<'queue' | 'candidates'>('queue')

  const load = useCallback(async () => {
    setLoading(true)
    const status = statusFilter === 'all' ? undefined : statusFilter
    const data = await api.sources.list({ status })
    setSources(data)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  function handleAdded(source: Source) {
    setSources(prev => {
      const without = prev.filter(s => s.id !== source.id)
      return [source, ...without]
    })
  }

  function handleStatusChange(id: number, status: SourceStatus) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const filtered = statusFilter === 'all' ? sources : sources.filter(s => s.status === statusFilter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h1>Source Queue</h1>
        <div className="page-header-actions" style={{ flex: 1 }}>
          <AddUrlBar onAdded={handleAdded} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--content-border)', paddingLeft: 24 }}>
        {(['queue', 'candidates'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t ? 'var(--accent)' : '#64748b', fontWeight: tab === t ? 600 : 400,
            fontSize: 13,
          }}>
            {t === 'queue' ? 'Queue' : 'Candidates'}
          </button>
        ))}
      </div>

      {tab === 'queue' ? (
        <>
          <div style={{ padding: '12px 24px', display: 'flex', gap: 6, borderBottom: '1px solid var(--content-border)' }}>
            {(['all', 'queued', 'active', 'done', 'irrelevant'] as const).map(s => (
              <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: '16px 24px' }}>
            {loading ? <div className="loading">Loading…</div> : filtered.length === 0 ? (
              <div className="empty-state">
                <span className="icon">📋</span>
                <p>No sources found. Add a URL above to get started.</p>
              </div>
            ) : filtered.map(source => (
              <SourceCard key={source.id} source={source} onStatusChange={handleStatusChange} />
            ))}
          </div>
        </>
      ) : (
        <div className="scroll-y" style={{ flex: 1, paddingTop: 16 }}>
          <CandidatesPanel onQueued={load} />
        </div>
      )}
    </div>
  )
}
