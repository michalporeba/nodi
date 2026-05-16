import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { Source, EntityDetail, WikidataCandidate } from '../../api/types'

// ─── Source metadata panel ────────────────────────────────────────────────────

interface SourcePanelProps {
  source: Source
  onUpdate: (source: Source) => void
  onConfirmAll: () => void
}

export function SourcePanel({ source, onUpdate, onConfirmAll }: SourcePanelProps) {
  const [updating, setUpdating] = useState(false)

  async function handleStatusChange(status: Source['status']) {
    setUpdating(true)
    const updated = await api.sources.update(source.id, { status })
    onUpdate(updated)
    setUpdating(false)
  }

  async function handleMarkDone() {
    await handleStatusChange('done')
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="section-heading">Source</div>

      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {source.title ?? '(untitled)'}
        </div>
        {source.url && (
          <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>
            <a href={source.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
              {source.url}
            </a>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Status:</span>
        <select
          className="select"
          value={source.status}
          onChange={e => handleStatusChange(e.target.value as Source['status'])}
          disabled={updating}
          style={{ fontSize: 12, padding: '4px 8px' }}
        >
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="done">Done</option>
          <option value="irrelevant">Irrelevant</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={onConfirmAll}>
          ✓ Confirm all suggestions
        </button>
        <button className="btn btn-primary" onClick={handleMarkDone} disabled={source.status === 'done'}>
          ✓ Mark as done
        </button>
      </div>
    </div>
  )
}

// ─── Entity detail panel ──────────────────────────────────────────────────────

interface WikidataSearchProps {
  entityId: number
  entityType: string
  onConfirmed: (entity: EntityDetail) => void
}

function WikidataSearch({ entityId, entityType, onConfirmed }: WikidataSearchProps) {
  const [candidates, setCandidates] = useState<WikidataCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    setLoading(true)
    setError(null)
    try {
      const results = await api.reconcile.search(entityId, undefined, entityType)
      setCandidates(results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function confirm(candidate: WikidataCandidate) {
    try {
      const entity = await api.reconcile.confirm({
        entity_id: entityId,
        qid: candidate.qid,
        wikipedia_en: candidate.wikipedia_en,
        wikipedia_cy: candidate.wikipedia_cy,
      })
      onConfirmed(entity)
      setCandidates([])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!candidates.length) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={search} disabled={loading}>
        {loading ? 'Searching…' : '🔍 Search Wikidata'}
      </button>
    )
  }

  return (
    <div>
      {candidates.map(c => (
        <div key={c.qid} style={{ padding: '8px 0', borderBottom: '1px solid var(--content-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
              {c.description && <div style={{ fontSize: 11, color: '#64748b' }}>{c.description}</div>}
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.qid}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => confirm(c)}>
              Select
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setCandidates([])}>
        Cancel
      </button>
      {error && <div className="error-msg" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  )
}

interface EntityPanelProps {
  entityId: number
  sourceId?: number
}

export function EntityDetailPanel({ entityId, sourceId }: EntityPanelProps) {
  const [entity, setEntity] = useState<EntityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingClaim, setAddingClaim] = useState(false)
  const [newClaim, setNewClaim] = useState({ property: '', value: '' })

  useEffect(() => {
    setLoading(true)
    api.entities.get(entityId).then(setEntity).finally(() => setLoading(false))
  }, [entityId])

  async function addLabel() {
    const value = window.prompt('Label text:')
    if (!value || !entity) return
    const lang = window.prompt('Language (e.g. en, cy):', 'en')
    await api.labels.add(entity.id, { value, language: lang ?? 'en', is_alias: true })
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function deleteLabel(id: number) {
    if (!entity) return
    await api.labels.delete(id)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleAddClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!entity || !newClaim.property || !newClaim.value) return
    await api.claims.create({
      subject_entity_id: entity.id,
      property: newClaim.property,
      value: newClaim.value,
      source_id: sourceId,
    })
    setNewClaim({ property: '', value: '' })
    setAddingClaim(false)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function deleteClaim(id: number) {
    if (!entity) return
    await api.claims.delete(id)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function addExternalId() {
    if (!entity) return
    const system = window.prompt('System (e.g. imdb, bbc_programme):')
    if (!system) return
    const value = window.prompt('ID value:')
    if (!value) return
    const url = window.prompt('URL (optional):') ?? undefined
    await api.externalIds.add(entity.id, { system, value, url, confirmed: true })
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!entity) return <div className="empty-state"><p>Entity not found</p></div>

  return (
    <div className="scroll-y" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{entity.primary_label}</div>
          <span className={`badge badge-${entity.type}`} style={{ marginTop: 4 }}>{entity.type}</span>
        </div>
        <Link to={`/entities/${entity.id}`} className="btn btn-ghost btn-sm">
          Full view →
        </Link>
      </div>

      <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12 }}>
        <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
        <span>{entity.claim_count} claim{entity.claim_count !== 1 ? 's' : ''}</span>
      </div>

      {/* Labels */}
      <div>
        <div className="section-heading">Labels</div>
        {entity.labels.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
            <span>
              {l.value}
              {l.is_primary && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 6 }}>primary</span>}
              {l.language && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{l.language}</span>}
            </span>
            {!l.is_primary && (
              <button className="btn btn-ghost btn-sm" onClick={() => deleteLabel(l.id)} style={{ color: '#ef4444', padding: '2px 6px' }}>×</button>
            )}
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={addLabel} style={{ marginTop: 4 }}>+ alias</button>
      </div>

      {/* External IDs */}
      <div>
        <div className="section-heading">External IDs</div>
        {entity.external_ids.map(eid => (
          <div key={eid.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
            <span>
              <span style={{ color: '#64748b', marginRight: 6 }}>{eid.system}:</span>
              {eid.url ? <a href={eid.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>{eid.value}</a> : eid.value}
              {eid.confirmed && <span style={{ color: '#22c55e', marginLeft: 4 }}>✓</span>}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={addExternalId}>+ add ID</button>
          <WikidataSearch entityId={entity.id} entityType={entity.type} onConfirmed={setEntity} />
        </div>
      </div>

      {/* Claims */}
      <div>
        <div className="section-heading">Claims</div>
        {entity.claims.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
            <span>
              <span style={{ color: '#64748b', marginRight: 6 }}>{c.property}</span>
              {c.object_label ?? c.value}
              {c.source_title && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>[{c.source_title}]</span>}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => deleteClaim(c.id)} style={{ color: '#ef4444', padding: '2px 6px' }}>×</button>
          </div>
        ))}

        {addingClaim ? (
          <form onSubmit={handleAddClaim} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <input className="input" placeholder="Property (e.g. date_of_birth)" value={newClaim.property} onChange={e => setNewClaim(p => ({ ...p, property: e.target.value }))} />
            <input className="input" placeholder="Value" value={newClaim.value} onChange={e => setNewClaim(p => ({ ...p, value: e.target.value }))} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" type="submit">Save</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAddingClaim(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingClaim(true)} style={{ marginTop: 4 }}>+ add claim</button>
        )}
      </div>
    </div>
  )
}
