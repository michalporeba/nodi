import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { Entity, EntityType } from '../../api/types'
import { ENTITY_TYPES } from '../../api/types'

function NewEntityDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (e: Entity) => void }) {
  const [type, setType] = useState<EntityType>('Person')
  const [label, setLabel] = useState('')
  const [lang, setLang] = useState('en')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setLoading(true)
    setError(null)
    try {
      const entity = await api.entities.create({ type, primary_label: label.trim(), language: lang })
      onCreated(entity)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 400, padding: '24px' }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>New Entity</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Type</label>
            <select className="select" style={{ width: '100%' }} value={type} onChange={e => setType(e.target.value as EntityType)}>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Primary label</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Name or title" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Language</label>
            <input className="input" value={lang} onChange={e => setLang(e.target.value)} placeholder="en" style={{ width: 80 }} />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !label.trim()}>
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function EntityList() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<EntityType | ''>('')
  const [search, setSearch] = useState('')
  const [unreconciled, setUnreconciled] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.entities.list({
      type: typeFilter || undefined,
      q: search || undefined,
      unreconciled: unreconciled || undefined,
    })
    setEntities(data)
    setLoading(false)
  }, [typeFilter, search, unreconciled])

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  // Count by type
  const typeCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h1>Entities</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New entity</button>
        </div>
      </div>

      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--content-border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search labels…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value as EntityType | '')}>
          <option value="">All types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t} ({typeCounts[t] ?? 0})</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={unreconciled} onChange={e => setUnreconciled(e.target.checked)} />
          Unreconciled only
        </label>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: '16px 24px' }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : entities.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🏷️</span>
            <p>No entities found.</p>
            {!search && !typeFilter && (
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>Create first entity</button>
            )}
          </div>
        ) : (
          entities.map(entity => (
            <div
              key={entity.id}
              className="card"
              style={{ padding: '12px 16px', cursor: 'pointer', marginBottom: 6 }}
              onClick={() => navigate(`/entities/${entity.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{entity.primary_label}</span>
                    <span className={`badge badge-${entity.type}`}>{entity.type}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10 }}>
                    <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
                    <span>{entity.claim_count} claim{entity.claim_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span style={{ color: '#94a3b8', fontSize: 18 }}>›</span>
              </div>
            </div>
          ))
        )}
      </div>

      {showNew && (
        <NewEntityDialog
          onClose={() => setShowNew(false)}
          onCreated={entity => {
            setEntities(prev => [entity as Entity, ...prev])
            navigate(`/entities/${entity.id}`)
          }}
        />
      )}
    </div>
  )
}
