import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { EntityDetail as EntityDetailType, Entity, WikidataCandidate } from '../../api/types'
import { PropertyPicker } from '../PropertyPicker'
import { ClaimRow } from '../ClaimRow'
import { useOntology, getPropertyShape } from '../../data/ontology'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  )
}

function WikidataReconcile({ entity, onUpdated }: { entity: EntityDetailType; onUpdated: (e: EntityDetailType) => void }) {
  const [candidates, setCandidates] = useState<WikidataCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const existing = entity.external_ids.find(e => e.system === 'wikidata' && e.confirmed)

  async function search() {
    setLoading(true)
    setError(null)
    setOpen(true)
    try {
      const results = await api.reconcile.search(entity.id)
      setCandidates(results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function confirm(c: WikidataCandidate) {
    try {
      const updated = await api.reconcile.confirm({
        entity_id: entity.id,
        qid: c.qid,
        wikipedia_en: c.wikipedia_en,
        wikipedia_cy: c.wikipedia_cy,
      })
      onUpdated(updated)
      setOpen(false)
      setCandidates([])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (existing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color: '#22c55e' }}>✓</span>
      <a href={`https://www.wikidata.org/wiki/${existing.value}`} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
        {existing.value}
      </a>
    </div>
  )

  const priorSearch = entity.search_logs.find(s => s.system === 'wikidata') ?? null
  const showPrior = priorSearch && !open && candidates.length === 0

  return (
    <div>
      {showPrior ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span style={{ color: '#94a3b8' }}>
            Wikidata: searched {new Date(priorSearch!.last_searched_at).toLocaleString()} ·{' '}
            {priorSearch!.result_count === 0
              ? 'no results'
              : `${priorSearch!.result_count} result${priorSearch!.result_count === 1 ? '' : 's'}, none selected`}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={search} disabled={loading} style={{ alignSelf: 'flex-start' }}>
            {loading ? 'Searching…' : '🔍 Search again'}
          </button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={search} disabled={loading}>
          {loading ? 'Searching…' : '🔍 Search Wikidata'}
        </button>
      )}
      {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
      {open && candidates.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          {candidates.map(c => (
            <div key={c.qid} style={{ padding: '10px 14px', borderBottom: '1px solid var(--content-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{c.label}</div>
                {c.description && <div style={{ fontSize: 12, color: '#64748b' }}>{c.description}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.qid}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => confirm(c)}>Select</button>
            </div>
          ))}
          <div style={{ padding: '10px 14px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setCandidates([]) }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TypeAdder({ classes, currentTypes, onAdd }: { classes: string[]; currentTypes: string[]; onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const available = classes.filter(c => !currentTypes.includes(c))
  if (available.length === 0) return null
  return (
    <span style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 11, padding: '1px 6px' }}
        onClick={() => setOpen(o => !o)}
        title="Add class"
      >+ type</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--panel-bg, #fff)', border: '1px solid var(--content-border)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 140 }}>
          {available.map(c => (
            <div
              key={c}
              style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
              onMouseOut={e => (e.currentTarget.style.background = '')}
              onClick={() => { onAdd(c); setOpen(false) }}
            >{c}</div>
          ))}
        </div>
      )}
    </span>
  )
}

export function EntityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const entityId = parseInt(id ?? '0')

  const [entity, setEntity] = useState<EntityDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingClaim, setAddingClaim] = useState(false)
  const [newClaim, setNewClaim] = useState({ property: '', value: '' })
  const [claimEntityId, setClaimEntityId] = useState<number | null>(null)
  const [claimEntitySearch, setClaimEntitySearch] = useState('')
  const [claimEntityResults, setClaimEntityResults] = useState<Entity[]>([])
  const [claimModeOverride, setClaimModeOverride] = useState<'text' | 'entity' | null>(null)
  const [addingLabel, setAddingLabel] = useState(false)
  const [newLabel, setNewLabel] = useState({ value: '', language: 'en' })
  const [addingEid, setAddingEid] = useState(false)
  const [newEid, setNewEid] = useState({ system: '', value: '', url: '' })
  const ontology = useOntology()

  const claimPropShape = getPropertyShape(ontology, newClaim.property.trim())
  const defaultClaimMode: 'text' | 'entity' =
    claimPropShape?.value_type === 'entity' ? 'entity'
    : claimPropShape?.value_type === 'both' && (claimPropShape.class_range || claimPropShape.default_entity_type) ? 'entity'
    : 'text'
  const claimMode = claimModeOverride ?? defaultClaimMode

  useEffect(() => {
    if (!entityId) return
    setLoading(true)
    api.entities.get(entityId).then(setEntity).finally(() => setLoading(false))
  }, [entityId])

  useEffect(() => {
    setClaimEntityId(null); setClaimEntitySearch(''); setClaimEntityResults([]); setClaimModeOverride(null)
  }, [newClaim.property])

  useEffect(() => {
    if (claimMode !== 'entity' || !claimEntitySearch.trim()) { setClaimEntityResults([]); return }
    const t = setTimeout(() => { api.entities.list({ q: claimEntitySearch }).then(setClaimEntityResults) }, 250)
    return () => clearTimeout(t)
  }, [claimEntitySearch, claimMode])

  async function handleDelete() {
    if (!entity) return
    if (!window.confirm(`Delete "${entity.primary_label}" and all associated data?`)) return
    await api.entities.delete(entity.id)
    navigate('/entities')
  }

  async function handleAddLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!entity || !newLabel.value.trim()) return
    await api.labels.add(entity.id, { value: newLabel.value.trim(), language: newLabel.language, is_alias: true })
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
    setNewLabel({ value: '', language: 'en' })
    setAddingLabel(false)
  }

  async function handleDeleteLabel(labelId: number) {
    if (!entity) return
    await api.labels.delete(labelId)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleSaveExternalId() {
    if (!newEid.system.trim() || !newEid.value.trim() || !entity) return
    await api.externalIds.add(entity.id, {
      system: newEid.system.trim(),
      value: newEid.value.trim(),
      url: newEid.url.trim() || undefined,
      confirmed: true,
    })
    setNewEid({ system: '', value: '', url: '' })
    setAddingEid(false)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleToggleExternalIdConfirmed(eid: EntityDetailType['external_ids'][0]) {
    await api.externalIds.update(eid.id, { confirmed: !eid.confirmed })
    const updated = await api.entities.get(entityId)
    setEntity(updated)
  }

  async function handleDeleteExternalId(id: number) {
    if (!entity) return
    await api.externalIds.delete(id)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleAddClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!entity || !newClaim.property) return
    if (claimMode === 'entity') {
      if (!claimEntityId) return
      await api.claims.create({ subject_entity_id: entity.id, property: newClaim.property, object_entity_id: claimEntityId })
    } else {
      if (!newClaim.value) return
      await api.claims.create({ subject_entity_id: entity.id, property: newClaim.property, value: newClaim.value })
    }
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
    setNewClaim({ property: '', value: '' })
    setClaimEntityId(null); setClaimEntitySearch(''); setClaimEntityResults([]); setClaimModeOverride(null)
    setAddingClaim(false)
  }

  async function handleDeleteClaim(claimId: number) {
    if (!entity) return
    await api.claims.delete(claimId)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleAddType(typeName: string) {
    if (!entity || !typeName) return
    await api.claims.create({ subject_entity_id: entity.id, property: 'instance_of', value: typeName })
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function handleRemoveType(typeName: string) {
    if (!entity) return
    const claim = entity.claims.find(c => c.property === 'instance_of' && c.value === typeName)
    if (!claim) return
    await api.claims.delete(claim.id)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!entity) return <div className="empty-state"><p>Entity not found</p><button className="btn btn-secondary" onClick={() => navigate('/entities')}>Back</button></div>

  // Group claims by property; hide instance_of (surfaced as type chips instead)
  const claimsByProp = entity.claims.reduce<Record<string, typeof entity.claims>>((acc, c) => {
    if (c.property === 'instance_of') return acc
    if (!acc[c.property]) acc[c.property] = []
    acc[c.property].push(c)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/entities')}>← Entities</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20 }}>{entity.primary_label}</h1>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {entity.types.map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <span className={`badge badge-${t}`}>{t}</span>
                      <button
                        onClick={() => handleRemoveType(t)}
                        style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: 11 }}
                        title={`Remove ${t} class`}
                      >×</button>
                    </span>
                  ))}
                  <TypeAdder classes={ontology?.classes ?? []} currentTypes={entity.types} onAdd={handleAddType} />
                </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {entity.mention_count} mentions · {entity.claim_count} claims
            </div>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: '24px', maxWidth: 800 }}>

        {/* Labels */}
        <Section title="Labels">
          <div className="card" style={{ overflow: 'visible' }}>
            {entity.labels.map((l, i) => (
              <div key={l.id} style={{ padding: '10px 16px', borderBottom: i < entity.labels.length - 1 ? '1px solid var(--content-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 14 }}>{l.value}</span>
                  {l.is_primary && <span style={{ fontSize: 11, color: '#6366f1', marginLeft: 8 }}>primary</span>}
                  {l.is_alias && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>alias</span>}
                  {l.language && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{l.language}</span>}
                </div>
                {!l.is_primary && (
                  <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => handleDeleteLabel(l.id)}>Remove</button>
                )}
              </div>
            ))}
            {addingLabel ? (
              <form onSubmit={handleAddLabel} style={{ padding: '10px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--content-border)' }}>
                <input className="input" placeholder="Label text" value={newLabel.value} onChange={e => setNewLabel(p => ({ ...p, value: e.target.value }))} style={{ flex: 1 }} autoFocus />
                <input className="input" placeholder="lang" value={newLabel.language} onChange={e => setNewLabel(p => ({ ...p, language: e.target.value }))} style={{ width: 60 }} />
                <button className="btn btn-primary btn-sm" type="submit">Add</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAddingLabel(false)}>Cancel</button>
              </form>
            ) : (
              <div style={{ padding: '8px 16px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingLabel(true)}>+ Add alias</button>
              </div>
            )}
          </div>
        </Section>

        {/* Wikidata reconciliation */}
        <Section title="Wikidata">
          <WikidataReconcile entity={entity} onUpdated={setEntity} />
        </Section>

        {/* External IDs */}
        <Section title="External IDs">
          <div className="card">
            {entity.external_ids.map((eid, i) => (
              <div key={eid.id} style={{ padding: '10px 16px', borderBottom: i < entity.external_ids.length - 1 ? '1px solid var(--content-border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>{eid.system}</span>
                  {eid.url ? (
                    <a href={eid.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', fontSize: 13 }}>{eid.value}</a>
                  ) : (
                    <span style={{ fontSize: 13 }}>{eid.value}</span>
                  )}
                </div>
                <button
                  className={`btn btn-sm ${eid.confirmed ? 'btn-ghost' : 'btn-secondary'}`}
                  style={{ color: eid.confirmed ? '#22c55e' : '#94a3b8', fontSize: 11 }}
                  onClick={() => handleToggleExternalIdConfirmed(eid)}
                  title={eid.confirmed ? 'Mark unconfirmed' : 'Mark confirmed'}
                >
                  {eid.confirmed ? '✓' : '○'}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => handleDeleteExternalId(eid.id)}>×</button>
              </div>
            ))}
            {addingEid && (
              <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--content-border)' }}>
                <input className="input" placeholder="System (e.g. imdb, wikidata)" value={newEid.system} onChange={e => setNewEid(p => ({ ...p, system: e.target.value }))} autoFocus style={{ fontSize: 13 }} />
                <input className="input" placeholder="ID value" value={newEid.value} onChange={e => setNewEid(p => ({ ...p, value: e.target.value }))} style={{ fontSize: 13 }} />
                <input className="input" placeholder="URL (optional)" value={newEid.url} onChange={e => setNewEid(p => ({ ...p, url: e.target.value }))} style={{ fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveExternalId}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAddingEid(false)}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{ padding: '8px 16px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingEid(true)}>+ Add ID</button>
            </div>
          </div>
        </Section>

        {/* Claims */}
        <Section title="Claims">
          <div className="card" style={{ marginBottom: 8 }}>
            {Object.entries(claimsByProp).map(([prop, claims], pi, arr) => (
              <div key={prop} style={{ padding: '10px 16px', borderBottom: pi < arr.length - 1 ? '1px solid var(--content-border)' : 'none' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{prop}</div>
                {claims.map(c => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    subjectTypes={entity.types}
                    hideProperty
                    onChanged={async () => { const u = await api.entities.get(entity.id); setEntity(u) }}
                    onDeleted={() => handleDeleteClaim(c.id)}
                  />
                ))}
              </div>
            ))}
            {entity.claims.length === 0 && (
              <div style={{ padding: '16px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No claims yet</div>
            )}
          </div>
          {addingClaim ? (
            <form onSubmit={handleAddClaim} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <PropertyPicker
                    value={newClaim.property}
                    onChange={v => setNewClaim(p => ({ ...p, property: v }))}
                    subjectTypes={entity.types}
                    placeholder="Property (e.g. date_of_birth)"
                    autoFocus
                  />
                  {claimPropShape?.value_type === 'both' && (
                    <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                      <button type="button" className={`btn btn-sm ${claimMode === 'entity' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setClaimModeOverride('entity')}>Entity</button>
                      <button type="button" className={`btn btn-sm ${claimMode === 'text' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setClaimModeOverride('text')}>Text</button>
                    </div>
                  )}
                  {claimMode === 'entity' ? (
                    claimEntityId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ background: 'rgba(99,102,241,0.1)', borderRadius: 8, padding: '2px 10px' }}>
                          {claimEntitySearch || `#${claimEntityId}`}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setClaimEntityId(null); setClaimEntitySearch('') }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <input className="input" placeholder={`Search ${claimPropShape?.class_range ?? 'entity'}…`} value={claimEntitySearch} onChange={e => setClaimEntitySearch(e.target.value)} style={{ width: '100%' }} />
                        {claimEntityResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: 120, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4, background: 'white' }}>
                            {claimEntityResults.slice(0, 5).map(e => (
                              <div key={e.id} className="entity-option" onClick={() => { setClaimEntityId(e.id); setClaimEntitySearch(e.primary_label); setClaimEntityResults([]) }}>
                                <div className="entity-option-label">{e.primary_label}</div>
                                <div className="entity-option-meta">{e.types.join(', ')}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <input className="input" placeholder="Value" value={newClaim.value} onChange={e => setNewClaim(p => ({ ...p, value: e.target.value }))} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
                  <button className="btn btn-primary btn-sm" type="submit">Save</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAddingClaim(false)}>Cancel</button>
                </div>
              </div>
            </form>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setAddingClaim(true)}>+ Add claim</button>
          )}
        </Section>

        {/* Mentions */}
        <Section title={`Mentions (${entity.mentions.length})`}>
          {entity.mentions.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>No confirmed mentions yet.</p>
          ) : (
            <div className="card">
              {entity.mentions.map((m, i) => (
                <div key={m.id} style={{ padding: '10px 16px', borderBottom: i < entity.mentions.length - 1 ? '1px solid var(--content-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.source_title ?? m.source_url ?? `Source ${m.source_id}`}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      "{m.surface_form}" · <span className={`badge badge-${m.source_status}`} style={{ fontSize: 10 }}>{m.source_status}</span>
                    </div>
                  </div>
                  <Link to={`/sources/${m.source_id}`} className="btn btn-ghost btn-sm">Open →</Link>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
