import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api } from '../../api/client'
import type { Source, Match, Entity, EntityType } from '../../api/types'
import { ENTITY_TYPES } from '../../api/types'
import { SourceContent } from './SourceContent'
import { TopicSection, ActiveTopicSection, ActionsSection, RelationshipConnector } from './EntityPanel'
import { PropertyPicker } from '../PropertyPicker'
import { useOntology, getPropertyShape } from '../../data/ontology'

// ─── Popovers ─────────────────────────────────────────────────────────────────

interface PopoverPosition { x: number; y: number }

function PopoverWrapper({ pos, onClose, children }: { pos: PopoverPosition; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Position popover above click point
  const style: React.CSSProperties = {
    left: Math.min(pos.x, window.innerWidth - 380),
    top: pos.y - 10,
    transform: 'translateY(-100%)',
  }

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
      <div className="popover" style={style}>{children}</div>
    </>,
    document.body
  )
}

function SuggestedPopover({ match, pos, sourceId, onConfirmed, onDismiss }: {
  match: Match
  pos: PopoverPosition
  sourceId: number
  onConfirmed: () => void
  onDismiss: () => void
}) {
  const [entityData, setEntityData] = useState<Entity | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (match.entity_ids[0]) {
      api.entities.list({ q: '' }).then(entities => {
        const found = entities.find(e => e.id === match.entity_ids[0])
        setEntityData(found ?? null)
        setLoading(false)
      })
    }
  }, [match.entity_ids])

  async function confirm() {
    setConfirming(true)
    await api.mentions.create({
      entity_id: match.entity_ids[0],
      source_id: sourceId,
      surface_form: match.surface_form,
    })
    onConfirmed()
  }

  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">Suggested match</div>
      <div className="popover-body">
        {loading ? <span style={{ color: '#94a3b8' }}>Loading…</span> : entityData ? (
          <div>
            <div style={{ fontWeight: 600 }}>{entityData.primary_label}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {entityData.type} · {entityData.mention_count} mentions · {entityData.claim_count} claims
            </div>
          </div>
        ) : <span style={{ color: '#94a3b8' }}>Unknown entity</span>}
      </div>
      <div className="popover-actions">
        <button className="btn btn-primary btn-sm" onClick={confirm} disabled={confirming || !entityData}>
          ✓ Confirm
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>✗ Not this</button>
      </div>
    </PopoverWrapper>
  )
}

function AmbiguousPopover({ match, pos, sourceId, onConfirmed, onDismiss }: {
  match: Match
  pos: PopoverPosition
  sourceId: number
  onConfirmed: () => void
  onDismiss: () => void
}) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    api.entities.list({}).then(all => {
      setEntities(all.filter(e => match.entity_ids.includes(e.id)))
    })
  }, [match.entity_ids])

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function confirmSelected() {
    if (selected.size === 0) return
    setConfirming(true)
    for (const entityId of selected) {
      await api.mentions.create({ entity_id: entityId, source_id: sourceId, surface_form: match.surface_form })
    }
    onConfirmed()
  }

  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">"{match.surface_form}" could be:</div>
      <div className="popover-body" style={{ maxHeight: 280, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Tick all that apply (a name can refer to multiple entities):</div>
        {entities.map(e => {
          const isSelected = selected.has(e.id)
          return (
            <div
              key={e.id}
              className="entity-option"
              onClick={() => toggle(e.id)}
              style={{ background: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(e.id)}
                onClick={e => e.stopPropagation()}
                style={{ marginRight: 8 }}
              />
              <div style={{ flex: 1 }}>
                <div className="entity-option-label">{e.primary_label}</div>
                <div className="entity-option-meta">{e.type} · {e.mention_count} mentions</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="popover-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={confirmSelected}
          disabled={confirming || selected.size === 0}
        >
          {confirming ? 'Confirming…' : `✓ Confirm ${selected.size || ''}`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss} disabled={confirming}>Cancel</button>
      </div>
    </PopoverWrapper>
  )
}

type LinkedEntity =
  | { kind: 'existing'; entity: Entity }
  | { kind: 'new'; type: EntityType }

function ClaimPopover({ text, pos, sourceId, activeEntityId, linkedUrl, onCreated, onDismiss }: {
  text: string
  pos: PopoverPosition
  sourceId: number
  activeEntityId: number | null
  linkedUrl?: string
  onCreated: () => void
  onDismiss: () => void
}) {
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null)
  const [propertyRaw, setPropertyRaw] = useState('')
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [value, setValue] = useState(text)
  const [results, setResults] = useState<Entity[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [linked, setLinked] = useState<LinkedEntity[]>([])
  const [saving, setSaving] = useState(false)
  const [urlSource, setUrlSource] = useState<Source | null | undefined>(undefined)
  const [queueing, setQueueing] = useState(false)
  const property = propertyRaw
  function setProperty(v: string) { setPropertyRaw(v); setShowAllTypes(false) }
  const ontology = useOntology()
  const propShape = getPropertyShape(ontology, property.trim())
  const defaultType = propShape?.default_entity_type as EntityType | null | undefined
  const roleLabel = propShape?.role_label ?? defaultType

  useEffect(() => {
    if (!linkedUrl) { setUrlSource(undefined); return }
    api.sources.byUrl(linkedUrl).then(setUrlSource).catch(() => setUrlSource(null))
  }, [linkedUrl])

  async function queueUrl() {
    if (!linkedUrl) return
    setQueueing(true)
    try {
      const src = await api.sources.fetch(linkedUrl)
      setUrlSource(src)
    } finally {
      setQueueing(false)
    }
  }

  useEffect(() => {
    if (activeEntityId === null) { setActiveEntity(null); return }
    api.entities.list({}).then(all => {
      setActiveEntity(all.find(e => e.id === activeEntityId) ?? null)
    })
  }, [activeEntityId])

  useEffect(() => {
    if (!value.trim()) { setResults([]); return }
    setLoadingSearch(true)
    const t = setTimeout(() => {
      api.entities.list({ q: value }).then(setResults).finally(() => setLoadingSearch(false))
    }, 250)
    return () => clearTimeout(t)
  }, [value])

  function addExisting(e: Entity) {
    if (linked.some(l => l.kind === 'existing' && l.entity.id === e.id)) return
    setLinked(p => [...p, { kind: 'existing', entity: e }])
  }

  function addNew(type: EntityType) {
    if (linked.some(l => l.kind === 'new' && l.type === type)) return
    setLinked(p => [...p, { kind: 'new', type }])
  }

  function removeLinked(idx: number) {
    setLinked(p => p.filter((_, i) => i !== idx))
  }

  const hasActive = activeEntityId !== null
  const hasProperty = property.trim().length > 0
  const hasEntities = linked.length > 0
  const canSaveClaim = hasActive && hasProperty
  const canSave = canSaveClaim || hasEntities

  let actionLabel = 'Save'
  if (canSaveClaim && hasEntities) actionLabel = `Save claim · ${linked.length} ${linked.length === 1 ? 'entity' : 'entities'}`
  else if (canSaveClaim) actionLabel = 'Save claim'
  else if (hasEntities) actionLabel = linked.length === 1 ? 'Save entity' : `Save ${linked.length} entities`

  async function save() {
    if (!canSave) return
    setSaving(true)

    // Resolve any 'new' entries by creating the entity (plus seed claims if defined)
    const resolved: Entity[] = []
    for (const item of linked) {
      if (item.kind === 'existing') {
        resolved.push(item.entity)
      } else {
        const newEntity = await api.entities.create({ type: item.type, primary_label: value.trim() })
        resolved.push(newEntity)
        if (propShape?.seed_claims?.length) {
          await Promise.all(propShape.seed_claims.map(sc =>
            api.claims.create({ subject_entity_id: newEntity.id, property: sc.property, value: sc.value, source_id: sourceId })
          ))
        }
      }
    }

    // Mentions: link the surface form to each entity in this source
    for (const ent of resolved) {
      await api.mentions.create({ entity_id: ent.id, source_id: sourceId, surface_form: text })
    }

    // Claims about the active topic
    if (canSaveClaim) {
      if (resolved.length === 0) {
        await api.claims.create({
          subject_entity_id: activeEntityId!,
          property: property.trim(),
          value: value.trim(),
          source_id: sourceId,
        })
      } else {
        for (const ent of resolved) {
          await api.claims.create({
            subject_entity_id: activeEntityId!,
            property: property.trim(),
            object_entity_id: ent.id,
            source_id: sourceId,
          })
        }
      }
    }

    onCreated()
  }

  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">
        {hasActive
          ? <>About <strong>{activeEntity?.primary_label ?? '…'}</strong></>
          : <>"{text}"</>}
      </div>
      <div className="popover-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 340 }}>
        {linkedUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', background: 'rgba(99,102,241,0.06)', borderRadius: 4 }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>External link</div>
            <div style={{ fontSize: 11, wordBreak: 'break-all', color: '#475569' }}>{linkedUrl}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {urlSource === undefined ? (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Checking…</span>
              ) : urlSource ? (
                <span className={`badge badge-${urlSource.status}`} style={{ fontSize: 10 }}>
                  In queue · {urlSource.status}
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Not in queue</span>
                  <button className="btn btn-secondary btn-sm" onClick={queueUrl} disabled={queueing} style={{ padding: '2px 8px', fontSize: 11 }}>
                    {queueing ? '…' : '+ Add to queue'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {hasActive && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b', width: 64 }}>Property</span>
            <PropertyPicker
              value={property}
              onChange={setProperty}
              subjectType={activeEntity?.type}
              placeholder="e.g. cast_member, date_of_birth"
              autoFocus
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b', width: 64 }}>Value</span>
          <input
            className="input"
            style={{ fontSize: 12, flex: 1 }}
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus={!hasActive}
          />
        </div>
        {!hasActive && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            No active topic — selection is saved as entities only (no claim).
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--content-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {hasEntities
              ? 'Linked entities (one claim per entity will be saved):'
              : 'Add entities, or leave empty to save the value as a string.'}
          </div>

          {linked.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {linked.map((l, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.10)', borderRadius: 12, padding: '3px 10px', fontSize: 12 }}>
                  {l.kind === 'existing'
                    ? <>{l.entity.primary_label} <span style={{ color: '#94a3b8' }}>({l.entity.type})</span></>
                    : <>+ new <span style={{ color: '#94a3b8' }}>({l.type})</span></>}
                  <button
                    onClick={() => removeLinked(i)}
                    style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}
                    aria-label="Remove"
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
              {results.slice(0, 5).map(e => {
                const already = linked.some(l => l.kind === 'existing' && l.entity.id === e.id)
                return (
                  <div
                    key={e.id}
                    className="entity-option"
                    onClick={() => !already && addExisting(e)}
                    style={{ opacity: already ? 0.5 : 1, cursor: already ? 'default' : 'pointer' }}
                  >
                    <div>
                      <div className="entity-option-label">{e.primary_label}</div>
                      <div className="entity-option-meta">{e.type}{already && ' · added'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {loadingSearch && <span style={{ fontSize: 11, color: '#94a3b8' }}>Searching…</span>}

          {value.trim() && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>+ new as:</span>
              {defaultType && !showAllTypes ? (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: 11, opacity: linked.some(l => l.kind === 'new' && l.type === defaultType) ? 0.4 : 1 }}
                    onClick={() => addNew(defaultType)}
                    disabled={linked.some(l => l.kind === 'new' && l.type === defaultType)}
                  >
                    {roleLabel}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 4px', fontSize: 10, color: '#94a3b8' }}
                    onClick={() => setShowAllTypes(true)}
                  >
                    other…
                  </button>
                </>
              ) : (
                ENTITY_TYPES.map(t => {
                  const already = linked.some(l => l.kind === 'new' && l.type === t)
                  return (
                    <button
                      key={t}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 8px', fontSize: 11, opacity: already ? 0.4 : 1 }}
                      onClick={() => addNew(t)}
                      disabled={already}
                    >
                      {t}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
      <div className="popover-actions">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!canSave || saving}>
          {saving ? 'Saving…' : `✓ ${actionLabel}`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss} disabled={saving}>Cancel</button>
      </div>
    </PopoverWrapper>
  )
}

// ─── Main SourceViewer ────────────────────────────────────────────────────────

type PopoverState =
  | { type: 'suggested'; match: Match; pos: PopoverPosition }
  | { type: 'ambiguous'; match: Match; pos: PopoverPosition }
  | { type: 'claim'; text: string; pos: PopoverPosition; linkedUrl?: string }

export function SourceViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sourceId = parseInt(id ?? '0')

  const [source, setSource] = useState<Source | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [focusedEntityId, setFocusedEntityId] = useState<number | null>(null)
  const [linkedEntityIds, setLinkedEntityIds] = useState<number[]>([])
  const [linkedSurfaceForm, setLinkedSurfaceForm] = useState<string | null>(null)
  const [relReloadToken, setRelReloadToken] = useState(0)
  const [popover, setPopover] = useState<PopoverState | null>(null)

  useEffect(() => {
    if (!sourceId) return
    setLoading(true)
    Promise.all([
      api.sources.get(sourceId).then(s => { setSource(s); if (s.status === 'queued') api.sources.update(sourceId, { status: 'active' }).then(setSource) }),
      api.sources.matches(sourceId).then(m => { setMatches(m); setMatchesLoading(false) }),
    ]).finally(() => setLoading(false))
  }, [sourceId])

  const reloadMatches = useCallback(async () => {
    const m = await api.sources.matches(sourceId)
    setMatches(m)
    setPopover(null)
    setRelReloadToken(t => t + 1)
  }, [sourceId])

  const handleMatchClick = useCallback((match: Match, x: number, y: number) => {
    const pos = { x, y }
    if (match.status === 'confirmed') {
      // Single or multi: focus the first confirmed entity; switcher in active block lets user flip and add more
      setFocusedEntityId(match.confirmed_entity_ids[0] ?? null)
      setLinkedEntityIds(match.confirmed_entity_ids)
      setLinkedSurfaceForm(match.surface_form)
      setPopover(null)
    } else if (match.status === 'suggested') {
      setPopover({ type: 'suggested', match, pos })
    } else {
      setPopover({ type: 'ambiguous', match, pos })
    }
  }, [])

  const handleTextSelect = useCallback((text: string, x: number, y: number, linkedUrl?: string) => {
    setPopover({ type: 'claim', text, pos: { x, y }, linkedUrl })
  }, [])

  async function handleConfirmAll() {
    await api.sources.confirmAll(sourceId)
    await reloadMatches()
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') setPopover(null)
      if (e.key === 'a') handleConfirmAll()
      if (e.key === 'd' && source) api.sources.update(sourceId, { status: 'done' }).then(setSource)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [source, sourceId])

  if (loading) return <div className="loading">Loading source…</div>
  if (!source) return <div className="empty-state"><p>Source not found.</p><button className="btn btn-secondary" onClick={() => navigate('/queue')}>Back to queue</button></div>

  const pageTopicId = source.subject_confirmed ? source.subject_entity_id : null
  const activeEntityId = focusedEntityId ?? pageTopicId

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: source content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--content-border)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--content-border)', background: 'var(--panel-bg)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/queue')}>← Queue</button>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {source.title ?? source.url ?? 'Source'}
          </span>
          {matchesLoading ? (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Loading matches…</span>
          ) : (
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {matches.filter(m => m.status === 'confirmed').length} confirmed ·{' '}
              {matches.filter(m => m.status === 'suggested').length} suggested ·{' '}
              {matches.filter(m => m.status === 'ambiguous').length} ambiguous
            </span>
          )}
        </div>

        {source.content ? (
          <SourceContent
            html={source.content}
            matches={matches}
            onMatchClick={handleMatchClick}
            onTextSelect={handleTextSelect}
          />
        ) : (
          <div className="empty-state"><p>Source has no content yet.</p></div>
        )}
      </div>

      {/* Right: context panel */}
      <div style={{ width: 480, minWidth: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--panel-bg)' }}>
        <TopicSection source={source} onUpdate={setSource} />
        {pageTopicId !== null && focusedEntityId !== null && focusedEntityId !== pageTopicId && (
          <RelationshipConnector
            pageTopicId={pageTopicId}
            activeEntityId={focusedEntityId}
            sourceId={sourceId}
            reloadToken={relReloadToken}
            onChanged={() => setRelReloadToken(t => t + 1)}
            onSwitchActive={id => setFocusedEntityId(id)}
          />
        )}
        <ActiveTopicSection
          source={source}
          focusedEntityId={focusedEntityId}
          linkedEntityIds={linkedEntityIds}
          linkedSurfaceForm={linkedSurfaceForm}
          onSwitch={id => setFocusedEntityId(id)}
          onClear={() => { setFocusedEntityId(null); setLinkedEntityIds([]); setLinkedSurfaceForm(null) }}
          onLinkedAdded={id => {
            setLinkedEntityIds(prev => prev.includes(id) ? prev : [...prev, id])
            reloadMatches()
          }}
        />
        <ActionsSection
          source={source}
          onUpdate={setSource}
          onConfirmAll={handleConfirmAll}
        />
      </div>

      {/* Popovers */}
      {popover?.type === 'suggested' && (
        <SuggestedPopover
          match={popover.match}
          pos={popover.pos}
          sourceId={sourceId}
          onConfirmed={reloadMatches}
          onDismiss={() => setPopover(null)}
        />
      )}
      {popover?.type === 'ambiguous' && (
        <AmbiguousPopover
          match={popover.match}
          pos={popover.pos}
          sourceId={sourceId}
          onConfirmed={reloadMatches}
          onDismiss={() => setPopover(null)}
        />
      )}
      {popover?.type === 'claim' && (
        <ClaimPopover
          text={popover.text}
          pos={popover.pos}
          sourceId={sourceId}
          activeEntityId={activeEntityId}
          linkedUrl={popover.linkedUrl}
          onCreated={reloadMatches}
          onDismiss={() => setPopover(null)}
        />
      )}
    </div>
  )
}
