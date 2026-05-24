import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { Source, Entity, EntityDetail, EntityType, WikidataCandidate, RelationshipResult, RelHop, EntitySearchLogEntry } from '../../api/types'
import { PropertyPicker } from '../PropertyPicker'
import { ClaimRow } from '../ClaimRow'
import { useOntology, getPropertyShape, type SeedClaim } from '../../data/ontology'

// ─── Shared type-adder dropdown ──────────────────────────────────────────────

function InlineTypeAdder({ classes, currentTypes, onAdd }: { classes: string[]; currentTypes: string[]; onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const available = classes.filter(c => !currentTypes.includes(c))
  if (available.length === 0) return null
  return (
    <span style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 10, padding: '1px 5px' }}
        onClick={() => setOpen(o => !o)}
        title="Add class"
      >+ type</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--panel-bg, #fff)', border: '1px solid var(--content-border)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 130 }}>
          {available.map(c => (
            <div
              key={c}
              style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
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
  const [creating, setCreating] = useState<string | null>(null)
  const [description, setDescription] = useState(source.subject_description ?? '')
  const [busy, setBusy] = useState(false)
  const ontology = useOntology()

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

  async function createAndPick(targetClass: string, seedClaims: SeedClaim[] = []) {
    setBusy(true)
    setCreating(targetClass)
    try {
      const entity = await api.entities.create({ type: targetClass, primary_label: search.trim() })
      if (seedClaims.length) {
        await Promise.all(seedClaims.map(sc =>
          api.claims.create({ subject_entity_id: entity.id, property: sc.property, value: sc.value })
        ))
      }
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
                  {(e.types).join(', ')} · {e.mention_count} mentions
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
            {(ontology?.templates ?? []).map(t => (
              <button
                key={t.name}
                className="btn btn-secondary btn-sm"
                title={t.source}
                onClick={() => createAndPick(t.target_class, t.seed_claims)}
                disabled={!!creating}
              >
                {creating === t.name ? '…' : t.name}
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
  editing: boolean
  onEditingChange: (v: boolean) => void
}

export function TopicSection({ source, onUpdate, editing, onEditingChange }: TopicSectionProps) {
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
          {hasTopic && (
            <button className="btn btn-ghost btn-sm" onClick={() => onEditingChange(false)}>✕</button>
          )}
        </div>
        <TopicPicker
          source={source}
          suggestedText={source.title ?? undefined}
          onSet={updated => { onUpdate(updated); onEditingChange(false) }}
          onCancel={hasTopic ? () => onEditingChange(false) : undefined}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--content-border)', background: 'var(--panel-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {entity ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{entity.primary_label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(entity.types).map(t => (
                  <span key={t} className={`badge badge-${t}`}>{t}</span>
                ))}
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
        <button className="btn btn-ghost btn-sm" onClick={() => onEditingChange(true)} style={{ flexShrink: 0 }}>
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
  linkedSurfaceForm: string | null
  onSwitch: (entityId: number) => void
  onClear: () => void
  onLinkedAdded: (entityId: number) => void
  onMerged?: (canonicalId: number) => void
  onEditTopic?: () => void
  onRemoveAssociation?: () => Promise<void>
}

export function ActiveTopicSection({
  source, focusedEntityId, linkedEntityIds, linkedSurfaceForm, onSwitch, onClear, onLinkedAdded, onMerged, onEditTopic, onRemoveAssociation,
}: ActiveTopicSectionProps) {
  const pageTopicId = source.subject_confirmed ? source.subject_entity_id : null
  const activeEntityId = focusedEntityId ?? pageTopicId
  const isFocusing = focusedEntityId !== null && focusedEntityId !== pageTopicId
  const showSwitcher =
    focusedEntityId !== null &&
    linkedEntityIds.length >= 2 &&
    linkedSurfaceForm !== null &&
    linkedEntityIds.includes(focusedEntityId)

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
        {isFocusing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            {onRemoveAssociation && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={onRemoveAssociation}
                title="Unconfirm this mention. The entity stays; the highlight returns to suggested."
                style={{ color: '#ef4444', fontSize: 11 }}
              >
                Remove association
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClear} title="Back to page topic">
              ← page
            </button>
          </div>
        ) : onEditTopic ? (
          <button className="btn btn-ghost btn-sm" onClick={onEditTopic} title="Edit page topic">
            ✎
          </button>
        ) : null}
      </div>

      {showSwitcher && (
        <LinkedSwitcher
          linkedIds={linkedEntityIds}
          activeId={activeEntityId}
          surfaceForm={linkedSurfaceForm!}
          sourceId={source.id}
          onSwitch={onSwitch}
          onAdded={onLinkedAdded}
          onMerged={onMerged ?? (() => {})}
        />
      )}

      <div className="scroll-y" style={{ flex: 1 }}>
        <EntityDetailPanel entityId={activeEntityId} sourceId={source.id} />
      </div>
    </div>
  )
}

// Compact switcher for surface forms that map to multiple entities. Buttons
// show only the entity type (the shared label is shown once, above), and there's
// always a "+" affordance to attach another entity to the same surface form.
function LinkedSwitcher({ linkedIds, activeId, surfaceForm, sourceId, onSwitch, onAdded, onMerged }: {
  linkedIds: number[]
  activeId: number
  surfaceForm: string
  sourceId: number
  onSwitch: (id: number) => void
  onAdded: (entityId: number) => void
  onMerged: (canonicalId: number) => void
}) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [adding, setAdding] = useState(false)
  const [merging, setMerging] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Entity[]>([])
  const [busy, setBusy] = useState(false)
  const ontology = useOntology()

  useEffect(() => {
    Promise.all(linkedIds.map(id => api.entities.get(id))).then(setEntities)
  }, [linkedIds.join(',')])

  useEffect(() => {
    if (!adding) return
    const q = search.trim()
    if (!q) { setResults([]); return }
    const t = setTimeout(() => api.entities.list({ q }).then(setResults), 200)
    return () => clearTimeout(t)
  }, [search, adding])

  async function addExisting(e: Entity) {
    setBusy(true)
    try {
      // Ensure the entity carries the surface form as a label so future
      // matches across sources catch it. Add as alias if not already present.
      const detail = await api.entities.get(e.id)
      const has = detail.labels.some(l => l.value.toLowerCase() === surfaceForm.toLowerCase())
      if (!has) {
        await api.labels.add(e.id, { value: surfaceForm, is_alias: true })
      }
      await api.mentions.create({ entity_id: e.id, source_id: sourceId, surface_form: surfaceForm })
      onAdded(e.id)
      setAdding(false)
      setSearch('')
    } finally {
      setBusy(false)
    }
  }

  async function addNew(targetClass: string, seedClaims: SeedClaim[] = []) {
    setBusy(true)
    try {
      const e = await api.entities.create({ type: targetClass, primary_label: surfaceForm })
      if (seedClaims.length) {
        await Promise.all(seedClaims.map(sc =>
          api.claims.create({ subject_entity_id: e.id, property: sc.property, value: sc.value, source_id: sourceId })
        ))
      }
      await api.mentions.create({ entity_id: e.id, source_id: sourceId, surface_form: surfaceForm })
      onAdded(e.id)
      setAdding(false)
      setSearch('')
    } finally {
      setBusy(false)
    }
  }

  async function mergeIntoCanonical(canonicalId: number) {
    const canonical = entities.find(e => e.id === canonicalId)
    const absorbed = entities.filter(e => e.id !== canonicalId)
    if (!canonical || absorbed.length === 0) return
    const names = absorbed.map(e => `"${e.primary_label}"`).join(', ')
    if (!window.confirm(`Merge ${names} into "${canonical.primary_label}"? This cannot be undone.`)) return
    setBusy(true)
    try {
      await api.entities.merge(canonicalId, absorbed.map(e => e.id))
      setMerging(false)
      onMerged(canonicalId)
    } finally {
      setBusy(false)
    }
  }

  if (entities.length === 0) return null

  return (
    <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span style={{ color: '#94a3b8' }}>"{surfaceForm}" →</span>
        {entities.filter(e => merging || e.id !== activeId).map(e => {
          const entityTypes = e.types
          return (
            <button
              key={e.id}
              className={`btn btn-sm ${e.id === activeId ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => merging ? mergeIntoCanonical(e.id) : onSwitch(e.id)}
              style={{ padding: '2px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              title={merging ? `Merge others into "${e.primary_label}"` : `${e.primary_label} (id: ${e.id})`}
            >
              {merging && <span style={{ fontSize: 9, color: '#f59e0b' }}>→</span>}
              <span>{e.primary_label}</span>
              {entityTypes.map(t => (
                <span key={t} className={`badge badge-${t}`} style={{ fontSize: 9 }}>{t}</span>
              ))}
            </button>
          )
        })}
        {entities.length >= 2 && (
          <button
            className={`btn btn-ghost btn-sm ${merging ? 'btn-warning' : ''}`}
            onClick={() => { setMerging(m => !m); setAdding(false) }}
            style={{ padding: '2px 6px', fontSize: 11, color: merging ? '#f59e0b' : undefined }}
            title={merging ? 'Cancel merge' : 'Merge duplicate entities'}
            disabled={busy}
          >
            {merging ? '× cancel' : '⊕ merge'}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { setAdding(a => !a); setMerging(false) }}
          style={{ padding: '2px 6px', fontSize: 11 }}
          title={adding ? 'Cancel' : 'Add another entity for this surface form'}
          disabled={busy}
        >
          {adding ? '×' : '+'}
        </button>
      </div>

      {merging && (
        <div style={{ fontSize: 10, color: '#f59e0b', padding: '2px 0' }}>
          Click an entity above to make it canonical — others will be merged into it.
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0 4px' }}>
          <input
            className="input"
            style={{ fontSize: 11, padding: '3px 6px' }}
            placeholder="search existing…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={busy}
            autoFocus
          />
          {results.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
              {results.slice(0, 5).map(e => {
                const already = linkedIds.includes(e.id)
                return (
                  <div
                    key={e.id}
                    className="entity-option"
                    onClick={() => !already && !busy && addExisting(e)}
                    style={{ opacity: already ? 0.5 : 1, cursor: already ? 'default' : 'pointer' }}
                  >
                    <div>
                      <div className="entity-option-label">{e.primary_label}</div>
                      <div className="entity-option-meta">{(e.types).join(', ')}{already && ' · already linked'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>+ new as:</span>
            {(ontology?.templates ?? []).map(t => (
              <button
                key={t.name}
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 6px', fontSize: 11 }}
                title={t.source}
                onClick={() => addNew(t.target_class, t.seed_claims)}
                disabled={busy}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Source actions (status + confirm-all + mark-done) ────────────────────────

interface ActionsSectionProps {
  source: Source
  onUpdate: (source: Source) => void
}

export function ActionsSection({ source, onUpdate }: ActionsSectionProps) {
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

// ─── Relationship connector (page topic ↔ active topic) ──────────────────────

interface RelationshipConnectorProps {
  pageTopicId: number
  activeEntityId: number
  sourceId: number
  reloadToken: number
  onChanged: () => void
  onSwitchActive: (entityId: number) => void
}

export function RelationshipConnector({
  pageTopicId, activeEntityId, sourceId, reloadToken, onChanged, onSwitchActive,
}: RelationshipConnectorProps) {
  const [result, setResult] = useState<RelationshipResult | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [property, setProperty] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (pageTopicId === activeEntityId) { setResult(null); setInitialLoading(false); return }
    // Keep the previous result visible during background refetches; only hide
    // the panel on the very first load before any data exists.
    api.relationships.find(pageTopicId, activeEntityId)
      .then(setResult)
      .finally(() => setInitialLoading(false))
  }, [pageTopicId, activeEntityId, reloadToken])

  async function deleteHop(claimId: number) {
    // Optimistic: drop any path containing this claim, then refresh.
    setResult(prev => prev ? {
      ...prev,
      paths: prev.paths.filter(p => p.hops.every(h => h.claim_id !== claimId)),
    } : prev)
    try {
      await api.claims.delete(claimId)
    } finally {
      onChanged()
    }
  }

  async function addDirect() {
    if (!property.trim()) return
    setSaving(true)
    try {
      await api.claims.create({
        subject_entity_id: pageTopicId,
        property: property.trim(),
        object_entity_id: activeEntityId,
        source_id: sourceId,
      })
      setProperty('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  if (pageTopicId === activeEntityId) return null
  if (initialLoading) return null

  const paths = result?.paths ?? []
  const entities = result?.entities ?? {}

  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid var(--content-border)', borderBottom: '1px solid var(--content-border)', display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(99,102,241,0.04)' }}>
      {paths.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>No claim links these yet.</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <PropertyPicker
              value={property}
              onChange={setProperty}
              subjectTypes={entities[pageTopicId]?.types}
              placeholder="property (e.g. cast_member)"
              disabled={saving}
              onEnter={addDirect}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={addDirect}
              disabled={saving || !property.trim()}
              style={{ padding: '3px 8px', fontSize: 11 }}
            >
              {saving ? '…' : '+ Add'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            Saves: <em>topic</em> → property → <em>active</em>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {paths.map(p => (
            <PathRow
              key={p.hops.map(h => h.claim_id).join('-')}
              hops={p.hops}
              pageTopicId={pageTopicId}
              activeEntityId={activeEntityId}
              intermediateId={p.intermediate_id}
              entities={entities}
              onSwitchActive={onSwitchActive}
              onDeleteHop={deleteHop}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PathRow({ hops, pageTopicId, activeEntityId, intermediateId, entities, onSwitchActive, onDeleteHop }: {
  hops: RelHop[]
  pageTopicId: number
  activeEntityId: number
  intermediateId?: number
  entities: Record<number, { id: number; types: string[]; primary_label: string }>
  onSwitchActive: (id: number) => void
  onDeleteHop: (claimId: number) => void
}) {
  // Render: page → [intermediate →] active, with arrow direction per hop.
  // For each hop, decide which direction it visually flows (down vs up) based on
  // which side connects to the upper node in the chain.

  function renderArrow(hop: RelHop, upperId: number, lowerId: number) {
    const downward = hop.subject_id === upperId && hop.object_id === lowerId
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', paddingLeft: 14 }}>
        <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{downward ? '↓' : '↑'}</span>
        <span style={{ fontFamily: 'monospace' }}>{hop.property}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onDeleteHop(hop.claim_id)}
          style={{ color: '#ef4444', padding: '0 4px', fontSize: 11, lineHeight: 1 }}
          title="Delete this claim"
        >×</button>
      </div>
    )
  }

  function entityChip(id: number, role: 'page' | 'intermediate' | 'active') {
    const e = entities[id]
    const label = e?.primary_label ?? `#${id}`
    const types = e?.types ?? []
    const clickable = role === 'intermediate'
    return (
      <div
        onClick={clickable ? () => onSwitchActive(id) : undefined}
        title={clickable ? 'Make active topic' : undefined}
        style={{
          fontSize: 12,
          fontWeight: role === 'active' ? 600 : 500,
          color: role === 'page' ? '#64748b' : role === 'active' ? '#0f172a' : '#475569',
          cursor: clickable ? 'pointer' : 'default',
          textDecoration: clickable ? 'underline' : 'none',
          textDecorationStyle: 'dotted',
        }}
      >
        {label} <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{types.join(', ')}</span>
      </div>
    )
  }

  if (hops.length === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {renderArrow(hops[0], pageTopicId, activeEntityId)}
      </div>
    )
  }

  // 2-hop: keep intermediate chip — it's not shown elsewhere
  const xId = intermediateId!
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {renderArrow(hops[0], pageTopicId, xId)}
      {entityChip(xId, 'intermediate')}
      {renderArrow(hops[1], xId, activeEntityId)}
    </div>
  )
}

// ─── Entity detail panel (used inside ActiveTopicSection) ─────────────────────

interface WikidataSearchProps {
  entityId: number
  entityType: string
  priorSearch: EntitySearchLogEntry | null
  onConfirmed: (entity: EntityDetail) => void
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < day) return `${Math.round(diff / (60 * 60_000))}h ago`
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`
  return new Date(iso).toLocaleDateString()
}

function WikidataSearch({ entityId, entityType, priorSearch, onConfirmed }: WikidataSearchProps) {
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
    if (priorSearch) {
      const noResults = priorSearch.result_count === 0
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
          <span style={{ color: '#94a3b8' }}>
            Wikidata: searched {formatRelative(priorSearch.last_searched_at)} ·{' '}
            {noResults ? 'no results' : `${priorSearch.result_count} result${priorSearch.result_count === 1 ? '' : 's'}, none selected`}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={search} disabled={loading} style={{ alignSelf: 'flex-start', padding: '2px 6px', fontSize: 11 }}>
            {loading ? 'Searching…' : '🔍 Search again'}
          </button>
        </div>
      )
    }
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
  const [claimEntityId, setClaimEntityId] = useState<number | null>(null)
  const [claimEntitySearch, setClaimEntitySearch] = useState('')  // also used as display label after selection
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

  async function saveLabel() {
    if (!newLabel.value.trim() || !entity) return
    await api.labels.add(entity.id, { value: newLabel.value.trim(), language: newLabel.language || 'en', is_alias: true })
    setNewLabel({ value: '', language: 'en' })
    setAddingLabel(false)
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
    if (!entity || !newClaim.property) return
    if (claimMode === 'entity') {
      if (!claimEntityId) return
      await api.claims.create({ subject_entity_id: entity.id, property: newClaim.property, object_entity_id: claimEntityId, source_id: sourceId })
    } else {
      if (!newClaim.value) return
      await api.claims.create({ subject_entity_id: entity.id, property: newClaim.property, value: newClaim.value, source_id: sourceId })
    }
    setNewClaim({ property: '', value: '' })
    setClaimEntityId(null); setClaimEntitySearch(''); setClaimEntityResults([]); setClaimModeOverride(null)
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

  async function addType(typeName: string) {
    if (!entity) return
    await api.claims.create({ subject_entity_id: entity.id, property: 'instance_of', value: typeName })
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function removeType(typeName: string) {
    if (!entity) return
    const claim = entity.claims.find(c => c.property === 'instance_of' && c.value === typeName)
    if (!claim) return
    await api.claims.delete(claim.id)
    const updated = await api.entities.get(entity.id)
    setEntity(updated)
  }

  async function saveExternalId() {
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

  if (loading) return <div className="loading">Loading…</div>
  if (!entity) return <div className="empty-state"><p>Entity not found</p></div>

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{entity.primary_label}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
            {(entity.types).map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <span className={`badge badge-${t}`}>{t}</span>
                <button onClick={() => removeType(t)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: 11 }} title={`Remove ${t}`}>×</button>
              </span>
            ))}
            <InlineTypeAdder classes={ontology?.classes ?? []} currentTypes={entity.types} onAdd={addType} />
          </div>
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
        {addingLabel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <input className="input" placeholder="Label text" value={newLabel.value} onChange={e => setNewLabel(p => ({ ...p, value: e.target.value }))} style={{ fontSize: 12 }} autoFocus />
            <input className="input" placeholder="Language (e.g. en, cy)" value={newLabel.language} onChange={e => setNewLabel(p => ({ ...p, language: e.target.value }))} style={{ fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={saveLabel}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingLabel(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingLabel(true)} style={{ marginTop: 4 }}>+ alias</button>
        )}
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
        {addingEid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <input className="input" placeholder="System (e.g. imdb, bbc_programme)" value={newEid.system} onChange={e => setNewEid(p => ({ ...p, system: e.target.value }))} style={{ fontSize: 12 }} autoFocus />
            <input className="input" placeholder="ID value" value={newEid.value} onChange={e => setNewEid(p => ({ ...p, value: e.target.value }))} style={{ fontSize: 12 }} />
            <input className="input" placeholder="URL (optional)" value={newEid.url} onChange={e => setNewEid(p => ({ ...p, url: e.target.value }))} style={{ fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={saveExternalId}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingEid(false)}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingEid(true)}>+ add ID</button>
          <WikidataSearch
            entityId={entity.id}
            entityType={entity.types[0] ?? ''}
            priorSearch={entity.search_logs.find(s => s.system === 'wikidata') ?? null}
            onConfirmed={setEntity}
          />
        </div>
      </div>

      {/* Claims */}
      <div>
        <div className="section-heading">Claims</div>
        {entity.claims.filter(c => c.property !== 'instance_of').map(c => (
          <ClaimRow
            key={c.id}
            claim={c}
            subjectTypes={entity.types}
            onChanged={async () => { const u = await api.entities.get(entity.id); setEntity(u) }}
            onDeleted={() => deleteClaim(c.id)}
          />
        ))}

        {addingClaim ? (
          <form onSubmit={handleAddClaim} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <PropertyPicker
              value={newClaim.property}
              onChange={v => setNewClaim(p => ({ ...p, property: v }))}
              subjectTypes={entity.types}
              placeholder="Property (e.g. date_of_birth)"
            />
            {claimPropShape?.value_type === 'both' && (
              <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                <button type="button" className={`btn btn-sm ${claimMode === 'entity' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setClaimModeOverride('entity')}>Entity</button>
                <button type="button" className={`btn btn-sm ${claimMode === 'text' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setClaimModeOverride('text')}>Text</button>
              </div>
            )}
            {claimMode === 'entity' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {claimEntityId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ background: 'rgba(99,102,241,0.1)', borderRadius: 8, padding: '2px 10px' }}>
                      {claimEntitySearch || `#${claimEntityId}`}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setClaimEntityId(null); setClaimEntitySearch('') }}>✕</button>
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder={`Search ${claimPropShape?.class_range ?? 'entity'}…`} value={claimEntitySearch} onChange={e => setClaimEntitySearch(e.target.value)} autoFocus />
                    {claimEntityResults.length > 0 && (
                      <div style={{ maxHeight: 100, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
                        {claimEntityResults.slice(0, 5).map(e => (
                          <div key={e.id} className="entity-option" onClick={() => { setClaimEntityId(e.id); setClaimEntitySearch(e.primary_label); setClaimEntityResults([]) }}>
                            <div className="entity-option-label">{e.primary_label}</div>
                            <div className="entity-option-meta">{(e.types).join(', ')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <input className="input" placeholder="Value" value={newClaim.value} onChange={e => setNewClaim(p => ({ ...p, value: e.target.value }))} />
            )}
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
