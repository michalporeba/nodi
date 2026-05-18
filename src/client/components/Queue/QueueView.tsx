import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { Source, SourceStatus, CandidateLink } from '../../api/types'

const STATUS_LABELS: Record<SourceStatus, string> = {
  queued: 'Queued', active: 'Active', done: 'Done', irrelevant: 'Irrelevant',
}

const COL_COUNT = 48
const COL_BUTTONS = 148

function hostname(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ─── Cards ────────────────────────────────────────────────────────────────────

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
        className="input" value={url} onChange={e => setUrl(e.target.value)}
        placeholder="https://en.wikipedia.org/wiki/..." type="url" disabled={loading}
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
  const canOpen = source.type === 'url' && !!source.fetched_at

  async function markIrrelevant(e: React.MouseEvent) {
    e.stopPropagation()
    setUpdating(true)
    await api.sources.update(source.id, { status: 'irrelevant' })
    onStatusChange(source.id, 'irrelevant')
    setUpdating(false)
  }

  const domain = source.url ? hostname(source.url) : null

  return (
    <div
      className="card"
      style={{ padding: '12px 16px', marginBottom: 6, cursor: canOpen ? 'pointer' : 'default' }}
      onClick={() => canOpen && navigate(`/sources/${source.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={`badge badge-${source.status}`}>{STATUS_LABELS[source.status]}</span>
            {domain && <span style={{ fontSize: 11, color: '#94a3b8' }}>{domain}</span>}
          </div>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {source.title ?? source.url ?? '(untitled)'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Added {new Date(source.created_at).toLocaleString()}
          </div>
        </div>
        {source.status !== 'irrelevant' && (
          <button className="btn btn-secondary btn-sm" onClick={markIrrelevant} disabled={updating} style={{ flexShrink: 0 }}>
            Irrelevant
          </button>
        )}
      </div>
    </div>
  )
}

function CandidateCard({ candidate, onKeep, onReject }: {
  candidate: CandidateLink
  onKeep: (url: string) => Promise<void>
  onReject: (url: string) => Promise<void>
}) {
  const [keeping, setKeeping] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const busy = keeping || rejecting

  async function handleKeep(e: React.MouseEvent) {
    e.stopPropagation()
    setKeeping(true)
    try { await onKeep(candidate.url) } finally { setKeeping(false) }
  }
  async function handleReject(e: React.MouseEvent) {
    e.stopPropagation()
    setRejecting(true)
    try { await onReject(candidate.url) } finally { setRejecting(false) }
  }

  return (
    <div
      className="card"
      style={{ padding: '10px 0', display: 'flex', alignItems: 'center', marginBottom: 6, cursor: 'pointer' }}
      onClick={() => openUrl(candidate.url)}
    >
      <div style={{ width: COL_COUNT, textAlign: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#64748b' }}>{candidate.frequency}</span>
      </div>
      <div style={{ width: COL_BUTTONS, flexShrink: 0, display: 'flex', gap: 6, padding: '0 8px' }}>
        <button className="btn btn-primary btn-sm" onClick={handleKeep} disabled={busy} style={{ flex: 1 }}>
          {keeping ? '…' : 'Keep'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleReject} disabled={busy} style={{ flex: 1 }}>
          {rejecting ? '…' : 'Reject'}
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--content-border)', paddingLeft: 12, paddingRight: 16 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{hostname(candidate.url)}</div>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {candidate.title ?? candidate.url}
        </div>
      </div>
    </div>
  )
}

function RejectedCard({ source, onRestore }: {
  source: Source
  onRestore: (source: Source) => Promise<void>
}) {
  const [restoring, setRestoring] = useState(false)

  async function handleRestore(e: React.MouseEvent) {
    e.stopPropagation()
    setRestoring(true)
    try { await onRestore(source) } finally { setRestoring(false) }
  }

  return (
    <div
      className="card"
      style={{ padding: '10px 0', display: 'flex', alignItems: 'center', marginBottom: 6, opacity: 0.6, cursor: source.url ? 'pointer' : 'default' }}
      onClick={() => source.url && openUrl(source.url)}
    >
      <div style={{ width: COL_COUNT, flexShrink: 0 }} />
      <div style={{ width: COL_BUTTONS, flexShrink: 0, display: 'flex', gap: 6, padding: '0 8px' }}>
        <button className="btn btn-secondary btn-sm" onClick={handleRestore} disabled={restoring} style={{ flex: 1 }}>
          {restoring ? '…' : 'Restore'}
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--content-border)', paddingLeft: 12, paddingRight: 16 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{source.url ? hostname(source.url) : ''}</div>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {source.title ?? source.url ?? '(unknown)'}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ margin: '20px 0 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label} ({count})
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function QueueView() {
  const [sources, setSources] = useState<Source[]>([])
  const [candidates, setCandidates] = useState<CandidateLink[]>([])
  const [rejected, setRejected] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<SourceStatus | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const status = statusFilter === 'all' ? undefined : statusFilter
    const [data, candidateData, rejectedData] = await Promise.all([
      api.sources.list({ status }),
      api.sources.candidates(),
      api.sources.list({ status: 'irrelevant', origin: 'discovery' }),
    ])
    setSources(data.filter(s => !(s.status === 'irrelevant' && s.origin === 'discovery')))
    setCandidates(candidateData)
    setRejected(rejectedData)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  function handleAdded(source: Source) {
    setSources(prev => [source, ...prev.filter(s => s.id !== source.id)])
  }

  function handleStatusChange(id: number, status: SourceStatus) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  async function keepCandidate(url: string) {
    const source = await api.sources.fetch(url, 'discovery')
    setCandidates(prev => prev.filter(c => c.url !== url))
    setSources(prev => [...prev, source])
  }

  async function rejectCandidate(url: string) {
    const source = await api.sources.rejectCandidate(url)
    setCandidates(prev => prev.filter(c => c.url !== url))
    setRejected(prev => [...prev, source])
  }

  async function restoreRejected(source: Source) {
    const updated = await api.sources.update(source.id, { status: 'queued' })
    setRejected(prev => prev.filter(r => r.id !== source.id))
    if (updated) setSources(prev => [...prev, updated])
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

      <div style={{ padding: '12px 24px', display: 'flex', gap: 6, borderBottom: '1px solid var(--content-border)' }}>
        {(['all', 'queued', 'active', 'done', 'irrelevant'] as const).map(s => (
          <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: '16px 24px' }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : filtered.length === 0 && candidates.length === 0 && rejected.length === 0 ? (
          <div className="empty-state">
            <span className="icon">📋</span>
            <p>No sources found. Add a URL above to get started.</p>
          </div>
        ) : (
          <>
            {filtered.map(source => (
              <SourceCard key={source.id} source={source} onStatusChange={handleStatusChange} />
            ))}

            {candidates.length > 0 && (
              <>
                <SectionHeader label="Discovered links" count={candidates.length} />
                {candidates.map(c => (
                  <CandidateCard key={c.url} candidate={c} onKeep={keepCandidate} onReject={rejectCandidate} />
                ))}
              </>
            )}

            {rejected.length > 0 && (
              <>
                <SectionHeader label="Rejected" count={rejected.length} />
                {rejected.map(s => (
                  <RejectedCard key={s.id} source={s} onRestore={restoreRejected} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
