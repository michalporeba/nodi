import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api } from '../../api/client'
import type { Source, Match, Entity, EntityType } from '../../api/types'
import { ENTITY_TYPES } from '../../api/types'
import { SourceContent } from './SourceContent'
import { SourcePanel, EntityDetailPanel } from './EntityPanel'

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
  const [confirming, setConfirming] = useState<number | null>(null)

  useEffect(() => {
    api.entities.list({}).then(all => {
      setEntities(all.filter(e => match.entity_ids.includes(e.id)))
    })
  }, [match.entity_ids])

  async function confirm(entityId: number) {
    setConfirming(entityId)
    await api.mentions.create({ entity_id: entityId, source_id: sourceId, surface_form: match.surface_form })
    onConfirmed()
  }

  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">"{match.surface_form}" could be:</div>
      <div className="popover-body" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {entities.map(e => (
          <div key={e.id} className="entity-option" onClick={() => confirm(e.id)}>
            <div style={{ flex: 1 }}>
              <div className="entity-option-label">{e.primary_label}</div>
              <div className="entity-option-meta">{e.type} · {e.mention_count} mentions</div>
            </div>
            {confirming === e.id && <span style={{ fontSize: 12, color: '#94a3b8' }}>…</span>}
          </div>
        ))}
      </div>
    </PopoverWrapper>
  )
}

function ClassificationPopover({ text, pos, sourceId, onCreated, onDismiss }: {
  text: string
  pos: PopoverPosition
  sourceId: number
  onCreated: () => void
  onDismiss: () => void
}) {
  const [type, setType] = useState<EntityType>('Person')
  const [search, setSearch] = useState(text)
  const [results, setResults] = useState<Entity[]>([])
  const [creating, setCreating] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    setLoadingSearch(true)
    const timer = setTimeout(() => {
      api.entities.list({ q: search }).then(setResults).finally(() => setLoadingSearch(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  async function selectExisting(entity: Entity) {
    await api.mentions.create({ entity_id: entity.id, source_id: sourceId, surface_form: text })
    // Add alias if it differs from known labels
    onCreated()
  }

  async function createNew() {
    setCreating(true)
    const entity = await api.entities.create({ type, primary_label: text })
    await api.mentions.create({ entity_id: entity.id, source_id: sourceId, surface_form: text })
    onCreated()
  }

  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">Mark as entity: "{text}"</div>
      <div className="popover-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Type:</span>
          <select className="select" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} value={type} onChange={e => setType(e.target.value as EntityType)}>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <input
          className="input"
          style={{ fontSize: 12 }}
          placeholder="Search existing…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {loadingSearch && <span style={{ fontSize: 12, color: '#94a3b8' }}>Searching…</span>}
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {results.slice(0, 6).map(e => (
            <div key={e.id} className="entity-option" onClick={() => selectExisting(e)}>
              <div>
                <div className="entity-option-label">{e.primary_label}</div>
                <div className="entity-option-meta">{e.type}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="popover-actions">
        <button className="btn btn-primary btn-sm" onClick={createNew} disabled={creating}>
          {creating ? 'Creating…' : '+ Create new'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Cancel</button>
      </div>
    </PopoverWrapper>
  )
}

function LinkPopover({ url, pos, onQueue, onDismiss }: {
  url: string
  pos: PopoverPosition
  onQueue: () => void
  onDismiss: () => void
}) {
  return (
    <PopoverWrapper pos={pos} onClose={onDismiss}>
      <div className="popover-header">External link</div>
      <div className="popover-body">
        <div style={{ fontSize: 12, wordBreak: 'break-all', color: '#64748b' }}>{url}</div>
      </div>
      <div className="popover-actions">
        <button className="btn btn-primary btn-sm" onClick={onQueue}>Add to queue</button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
      </div>
    </PopoverWrapper>
  )
}

// ─── Main SourceViewer ────────────────────────────────────────────────────────

type PopoverState =
  | { type: 'suggested'; match: Match; pos: PopoverPosition }
  | { type: 'ambiguous'; match: Match; pos: PopoverPosition }
  | { type: 'classification'; text: string; pos: PopoverPosition }
  | { type: 'link'; url: string; pos: PopoverPosition }

export function SourceViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sourceId = parseInt(id ?? '0')

  const [source, setSource] = useState<Source | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [focusedEntityId, setFocusedEntityId] = useState<number | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [matchKey, setMatchKey] = useState(0) // force re-render of highlights

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
    setMatchKey(k => k + 1)
    setPopover(null)
  }, [sourceId])

  const handleMatchClick = useCallback((match: Match, x: number, y: number) => {
    const pos = { x, y }
    if (match.status === 'confirmed') {
      setFocusedEntityId(match.confirmed_entity_id)
      setPopover(null)
    } else if (match.status === 'suggested') {
      setPopover({ type: 'suggested', match, pos })
    } else {
      setPopover({ type: 'ambiguous', match, pos })
    }
  }, [])

  const handleTextSelect = useCallback((text: string, x: number, y: number) => {
    setPopover({ type: 'classification', text, pos: { x, y } })
  }, [])

  const handleLinkClick = useCallback((url: string) => {
    setPopover({ type: 'link', url, pos: { x: window.innerWidth / 2, y: window.innerHeight / 2 } })
  }, [])

  async function handleConfirmAll() {
    await api.sources.confirmAll(sourceId)
    await reloadMatches()
  }

  async function handleQueueLink(url: string) {
    await api.sources.fetch(url)
    setPopover(null)
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
            key={matchKey}
            html={source.content}
            matches={matches}
            onMatchClick={handleMatchClick}
            onTextSelect={handleTextSelect}
            onLinkClick={handleLinkClick}
          />
        ) : (
          <div className="empty-state"><p>Source has no content yet.</p></div>
        )}
      </div>

      {/* Right: context panel */}
      <div style={{ width: 300, minWidth: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--panel-bg)' }}>
        {focusedEntityId ? (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--content-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Entity</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setFocusedEntityId(null)}>✕</button>
            </div>
            <div className="scroll-y" style={{ flex: 1 }}>
              <EntityDetailPanel entityId={focusedEntityId} sourceId={sourceId} />
            </div>
          </>
        ) : (
          <SourcePanel
            source={source}
            onUpdate={setSource}
            onConfirmAll={handleConfirmAll}
          />
        )}
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
      {popover?.type === 'classification' && (
        <ClassificationPopover
          text={popover.text}
          pos={popover.pos}
          sourceId={sourceId}
          onCreated={reloadMatches}
          onDismiss={() => setPopover(null)}
        />
      )}
      {popover?.type === 'link' && (
        <LinkPopover
          url={popover.url}
          pos={popover.pos}
          onQueue={() => handleQueueLink(popover.url)}
          onDismiss={() => setPopover(null)}
        />
      )}
    </div>
  )
}
