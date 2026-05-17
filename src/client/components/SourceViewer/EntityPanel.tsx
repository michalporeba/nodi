import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { Source, Entity, EntityDetail, EntityType, WikidataCandidate } from '../../api/types'
import { ENTITY_TYPES } from '../../api/types'

// ─── Topic picker (used when no topic is set, or when changing) ───────────────

interface TopicPickerProps {
  source: Source
  suggestedText?: string
  onSet: (updated: Source) => void
  onCancel?: () => void
}

function TopicPicker({ source, suggestedText, onSet, onCancel }: TopicPickerProps) {
  const [search, setSearch] = useState(suggestedText ?? source.title ?? '')
  const [results, setResults] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<EntityType | null>(null)
  const [description, setDescription] = useState(source.subject_description ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.entities.list({ q: search }).then(setResults).finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  async function pickEntity(entity: Entity) {
    setBusy(true)
    const updated = await api.sources.update(source.id, {
      subject_entity_id: entity.id,
      subject_confirmed: true,
      subject_description: null,
    })
    onSet(updated)
  }

  async function createAndPick(type: EntityType) {
    setBusy(true)
    setCreating(type)
    try {
      const entity = await api.entities.create({ type, primary_label: search.trim() })
      const updated = await api.sources.update(source.id, {
        subject_entity_id: entity.id,
        subject_confirmed: true,
        subject_description: null,
      })
      onSet(updated)
    } finally {
      setCreating(null)
      setBusy(false)
    }
  }

  async function setAsDescription() {
    if (!description.trim()) return
    setBusy(true)
    const updated = await api.sources.update(source.id, {
      subject_entity_id: null,
      subject_confirmed: false,
      subject_description: description.trim(),
    })
    onSet(updated)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>What is this page about?</div>

      <input
        className="input"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search or create entity…"
        disabled={busy}
        autoFocus
      />

      {loading && <div style={{ fontSize: 11, color: '#94a3b8' }}>Searching…</div>}

      {results.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 6 }}>
          {results.slice(0, 8).map(e => (
            <div
              key={e.id}
              className="entity-option"
              onClick={() => !busy && pickEntity(e)}
              style={{ cursor: busy ? 'wait' : 'pointer' }}
            >
              <div>
                <div className="entity-option-label">{e.primary_label}</div>
                <div className="entity-option-meta">
                  {e.type} · {e.mention_count} mentions
                  {e.wikidata_qid && <> · {e.wikidata_qid}</>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {search.trim() && !busy && (
        <details>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: '#6366f1' }}>
            + Create "{search.trim()}" as new entity
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {ENTITY_TYPES.map(t => (
              <button
                key={t}
                className="btn btn-secondary btn-sm"
                onClick={() => createAndPick(t)}
                disabled={!!creating}
              >
                {creating === t ? '…' : t}
              </button>
            ))}
          </div>
        </details>
      )}

      <div style={{ borderTop: '1px solid var(--content-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>Or describe it (page is a reference, not about one thing):</div>
        <input
          className="input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. List of Welsh-language films"
          disabled={busy}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={setAsDescription}
            disabled={busy || !description.trim()}
          >
            Set as description
          </button>
          {onCancel && (
            <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Topic section (page topic, sticky at top of side panel) ──────────────────

interface TopicSectionProps {
  source: Source
  onUpdate: (source: Source) => void
}

export function TopicSection({ source, onUpdate }: TopicSectionProps) {
  const [editing, setEditing] = useState(false)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [loadingEntity, setLoadingEntity] = useState(false)

  useEffect(() => {
    if (source.subject_entity_id && source.subject_confirmed) {
      setLoadingEntity(true)
      api.entities.get(source.subject_entity_id)
        .then(setEntity)
        .finally(() => setLoadingEntity(false))
    } else {
      setEntity(null)
    }
  }, [source.subject_entity_id, source.subject_confirmed])

  const hasTopic = (source.subject_entity_id && source.subject_confirmed) || !!source.subject_description

  if (editing || !hasTopic) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--content-border)', background: 'var(--panel-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-heading" style={{ margin: 0 }}>Topic</div>
          {hasTopic && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>✕</button>
          )}
        </div>
        <TopicPicker
          source={source}
          suggestedText={source.title ?? undefined}
          onSet={updated => { onUpdate(updated); setEditing(false) }}
          onCancel={hasTopic ? () => setEditing(false) : undefined}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--content-border)', background: 'var(--panel-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="section-heading" style={{ margin: '0 0 4px' }}>Topic</div>
          {entity ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{entity.primary_label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                <span className={`badge badge-${entity.type}`}>{entity.type}</span>
                {entity.wikidata_qid && <span style={{ marginLeft: 6 }}>{entity.wikidata_qid}</span>}
              </div>
            </>
          ) : loadingEntity ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</div>
          ) : source.subject_description ? (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: '#475569' }}>
              "{source.subject_description}"
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>(reference, no specific subject)</div>
            </div>
          ) : null}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} style={{ flexShrink: 0 }}>
          ✎
        </button>
      </div>
    </div>
  )
}

// ─── Active topic section ─────────────────────────────────────────────────────

interface ActiveTopicSectionProps {
  source: Source
  focusedEntityId: number | null
  linkedEntityIds: number[]
  onSwitch: (entityId: number) => void
  onClear: () => void
}

export function ActiveTopicSection({ source, focusedEntityId, linkedEntityIds, onSwitch, onClear }: ActiveTopicSectionProps) {
  const pageTopicId = source.subject_confirmed ? source.subject_entity_id : null
  const activeEntityId = focusedEntityId ?? pageTopicId
  const isFocusing = focusedEntityId !== null && focusedEntityId !== pageTopicId
  const showSwitcher = focusedEntityId !== null && linkedEntityIds.length > 1

  if (activeEntityId === null) {
    return (
      <div className="scroll-y" style={{ flex: 1, padding: '16px' }}>
        <div className="section-heading">Active topic</div>
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0', lineHeight: 1.5 }}>
          {source.subject_description
            ? <>This page is a reference, not about one entity. Click a confirmed highlight to focus an entity and add claims about it.</>
            : <>Set a topic above, or click a confirmed highlight to focus an entity.</>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="section-heading" style={{ margin: 0 }}>
          Active topic
          {!isFocusing && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>(page topic)</span>}
        </div>
        {isFocusing && (
          <button className="btn btn-ghost btn-sm" onClick={onClear} title="Back to page topic">
            ← page
          </button>
        )}
      </div>

      {showSwitcher && (
        <LinkedSwitcher
          linkedIds={linkedEntityIds}
          activeId={activeEntityId}
          onSwitch={onSwitch}
        />
      )}

      <div className="scroll-y" style={{ flex: 1 }}>
        <EntityDetailPanel entityId={activeEntityId} sourceId={source.id} />
      </div>
    </div>
  )
}

// Small chip switcher when one mention links to multiple entities
function LinkedSwitcher({ linkedIds, activeId, onSwitch }: {
  linkedIds: number[]
  activeId: number
  onSwitch: (id: number) => void
}) {
  const [entities, setEntities] = useState<Entity[]>([])

  useEffect(() => {
    Promise.all(linkedIds.map(id => api.entities.get(id))).then(setEntities)
  }, [linkedIds.join(',')])

  if (entities.length === 0) return null

  return (
    <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11 }}>
      <span style={{ color: '#94a3b8', alignSelf: 'center' }}>Same label →</span>
      {entities.map(e => (
        <button
          key={e.id}
          className={`btn btn-sm ${e.id === activeId ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSwitch(e.id)}
          style={{ padding: '2px 8px', fontSize: 11 }}
        >
          {e.primary_label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{e.type}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Source actions (status + confirm-all + mark-done) ────────────────────────

interface ActionsSectionProps {
  source: Source
  onUpdate: (source: Source) => void
  onConfirmAll: () => void
}

export function ActionsSection({ source, onUpdate, onConfirmAll }: ActionsSectionProps) {
  const [updating, setUpdating] = useState(false)

  async function handleStatusChange(status: Source['status']) {
    setUpdating(true)
    const updated = await api.sources.update(source.id, { status })
    onUpdate(updated)
    setUpdating(false)
  }

  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--content-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Status:</span>
        <select
          className="select"
          value={source.status}
          onChange={e => handleStatusChange(e.target.value as Source['status'])}
          disabled={updating}
          style={{ fontSize: 12, padding: '3px 6px', flex: 1 }}
        >
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="done">Done</option>
          <option value="irrelevant">Irrelevant</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-secondary btn-sm" onClick={onConfirmAll} style={{ flex: 1 }}>
          ✓ Confirm suggestions
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => handleStatusChange('done')}
          disabled={source.status === 'done'}
          style={{ flex: 1 }}
        >
          ✓ Mark done
        </button>
      </div>
    </div>
  )
}

// ─── Entity detail panel (used inside ActiveTopicSection) ─────────────────────

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
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
