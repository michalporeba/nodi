import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Claim, Entity, EntityType } from '../api/types'
import type { SeedClaim } from '../data/ontology'
import { PropertyPicker } from './PropertyPicker'
import { useOntology, getPropertyShape } from '../data/ontology'

interface Props {
  claim: Claim
  subjectType?: EntityType
  subjectTypes?: string[]
  onChanged: () => void
  onDeleted: () => void
  hideProperty?: boolean
}

type EditMode = 'property' | 'value' | null

function useClaimWarnings(claim: Claim): string[] {
  const ontology = useOntology()
  const shape = getPropertyShape(ontology, claim.property)
  if (!shape) return []
  const warnings: string[] = []
  if (claim.object_entity_id !== null) {
    if (shape.value_type === 'text') {
      warnings.push(`"${claim.property}" expects text, not an entity`)
    } else if (shape.class_range && claim.object_type && !claim.object_type.split(',').includes(shape.class_range)) {
      warnings.push(`"${claim.property}" expects ${shape.class_range}, got ${claim.object_type}`)
    }
  } else if (claim.value !== null && shape.value_type === 'entity') {
    warnings.push(`"${claim.property}" expects an entity, not text`)
  }
  return warnings
}

export function ClaimRow({ claim, subjectType, subjectTypes, onChanged, onDeleted, hideProperty }: Props) {
  const [editing, setEditing] = useState<EditMode>(null)
  const [promotingSubject, setPromotingSubject] = useState(false)
  const isEntity = claim.object_entity_id !== null
  const isLabelFirst = claim.subject_entity_id === null && claim.subject_label !== null
  const display = claim.object_label ?? claim.value ?? '(empty)'
  const warnings = useClaimWarnings(claim)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '3px 0', fontSize: 13, gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isLabelFirst && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>subject: <em>{claim.subject_label}</em></span>
            {!promotingSubject && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 4px', fontSize: 10 }}
                onClick={() => setPromotingSubject(true)}
                title="Promote subject label to entity"
              >
                → promote
              </button>
            )}
            {promotingSubject && (
              <SubjectPromoter
                claim={claim}
                onDone={() => { setPromotingSubject(false); onChanged() }}
                onCancel={() => setPromotingSubject(false)}
              />
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          {!hideProperty && editing !== 'property' && (
            <span
              onClick={() => setEditing('property')}
              style={{
                color: '#64748b',
                fontFamily: 'monospace',
                fontSize: 12,
                cursor: 'pointer',
                borderBottom: '1px dotted #cbd5e1',
              }}
              title="Click to edit property"
            >
              {claim.property}
            </span>
          )}
          {editing !== 'value' && editing !== 'property' && (
            <span
              onClick={() => setEditing('value')}
              style={{
                cursor: 'pointer',
                borderBottom: '1px dotted #94a3b8',
                fontStyle: isEntity ? 'normal' : 'italic',
                color: isEntity ? '#0f172a' : '#475569',
              }}
              title="Click to edit value"
            >
              {display}
            </span>
          )}
          {editing === null && warnings.length > 0 && (
            <span
              style={{ fontSize: 10, color: '#f59e0b', background: '#fef3c7', borderRadius: 3, padding: '1px 4px', cursor: 'default' }}
              title={warnings.join('\n')}
            >
              ⚠ {warnings.length === 1 ? warnings[0] : `${warnings.length} warnings`}
            </span>
          )}
          {editing === null && claim.source_title && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>[{claim.source_title}]</span>
          )}
        </div>
        {editing === 'property' && (
          <PropertyEditor
            claim={claim}
            subjectType={subjectType}
            subjectTypes={subjectTypes}
            onDone={() => { setEditing(null); onChanged() }}
            onCancel={() => setEditing(null)}
          />
        )}
        {editing === 'value' && (
          isEntity ? (
            <EntityClaimEditor
              claim={claim}
              objectLabel={claim.object_label ?? '(unknown)'}
              onDone={() => { setEditing(null); onChanged() }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <TextClaimEditor
              claim={claim}
              onDone={() => { setEditing(null); onChanged() }}
              onCancel={() => setEditing(null)}
            />
          )
        )}
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          await api.claims.update(claim.id, { notable: !claim.notable })
          onChanged()
        }}
        style={{ color: claim.notable ? '#f59e0b' : '#cbd5e1', padding: '2px 4px', flexShrink: 0, fontSize: 14 }}
        title={claim.notable ? 'Mark as not notable' : 'Mark as notable'}
      >{claim.notable ? '★' : '☆'}</button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onDeleted}
        style={{ color: '#ef4444', padding: '2px 6px', flexShrink: 0 }}
        title="Delete claim"
      >×</button>
    </div>
  )
}

function PropertyEditor({ claim, subjectType, subjectTypes, onDone, onCancel }: {
  claim: Claim
  subjectType?: EntityType
  subjectTypes?: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const [property, setProperty] = useState(claim.property)
  const [busy, setBusy] = useState(false)

  async function save() {
    const next = property.trim()
    if (!next || next === claim.property) { onCancel(); return }
    setBusy(true)
    try {
      await api.claims.update(claim.id, { property: next })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <PropertyPicker
          value={property}
          onChange={setProperty}
          subjectType={subjectType}
          subjectTypes={subjectTypes}
          autoFocus
          disabled={busy}
          onEnter={save}
        />
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !property.trim()}>
          {busy ? '…' : 'Save property'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

// Editor for text-valued claims: edit string OR promote to entity (existing or new).
function TextClaimEditor({ claim, onDone, onCancel }: {
  claim: Claim
  onDone: () => void
  onCancel: () => void
}) {
  const [text, setText] = useState(claim.value ?? '')
  const [busy, setBusy] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [results, setResults] = useState<Entity[]>([])
  const ontology = useOntology()
  const shape = getPropertyShape(ontology, claim.property)
  const defaultType = shape?.default_entity_type as EntityType | null | undefined
  const propSeeds = shape?.seed_claims ?? []
  const defaultTemplate = ontology?.templates?.find(t => {
    if (t.target_class !== defaultType) return false
    if (propSeeds.length === 0) return t.seed_claims.length === 0
    return propSeeds.some(ps => t.seed_claims.some(ts => ts.property === ps.property && ts.value === ps.value))
  }) ?? ontology?.templates?.find(t => t.target_class === defaultType)
  const roleLabel = defaultTemplate?.name ?? defaultType

  useEffect(() => {
    if (!promoting) return
    const q = text.trim()
    if (!q) { setResults([]); return }
    const t = setTimeout(() => api.entities.list({ q }).then(setResults), 200)
    return () => clearTimeout(t)
  }, [text, promoting])

  async function saveText() {
    if (!text.trim() || text === claim.value) { onCancel(); return }
    setBusy(true)
    try {
      await api.claims.update(claim.id, { value: text.trim(), object_entity_id: null })
      onDone()
    } finally { setBusy(false) }
  }

  async function promoteToExisting(e: Entity) {
    setBusy(true)
    try {
      await api.claims.update(claim.id, { value: null, object_entity_id: e.id })
      onDone()
    } finally { setBusy(false) }
  }

  async function promoteToNew(targetClass: string, templateSeeds: SeedClaim[] = []) {
    setBusy(true)
    try {
      const e = await api.entities.create({ type: targetClass, primary_label: text.trim() })
      await api.claims.update(claim.id, { value: null, object_entity_id: e.id })
      const seeds = templateSeeds.length ? templateSeeds : (shape?.seed_claims ?? [])
      if (seeds.length) {
        const sourceId = claim.source_id ?? undefined
        await Promise.all(seeds.map(sc =>
          api.claims.create({ subject_entity_id: e.id, property: sc.property, value: sc.value, source_id: sourceId })
        ))
      }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <input
        className="input"
        style={{ fontSize: 12 }}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') saveText(); if (e.key === 'Escape') onCancel() }}
        disabled={busy}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={saveText} disabled={busy || !text.trim()}>
          {busy ? '…' : 'Save text'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setPromoting(p => !p)} disabled={busy || !text.trim()}>
          {promoting ? '× cancel promote' : '→ Promote to entity'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {promoting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, borderLeft: '2px solid var(--content-border)' }}>
          {results.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
              {results.slice(0, 5).map(e => (
                <div
                  key={e.id}
                  className="entity-option"
                  onClick={() => !busy && promoteToExisting(e)}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  <div>
                    <div className="entity-option-label">{e.primary_label}</div>
                    <div className="entity-option-meta">{e.types.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: '#94a3b8' }}>+ new as:</span>
            {defaultType && !showAllTypes ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => promoteToNew(defaultType, defaultTemplate?.seed_claims ?? [])}
                  disabled={busy}
                >
                  {roleLabel}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 4px', fontSize: 10, color: '#94a3b8' }}
                  onClick={() => setShowAllTypes(true)}
                  disabled={busy}
                >
                  other…
                </button>
              </>
            ) : (
              (ontology?.templates ?? []).map(t => (
                <button
                  key={t.name}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                  title={t.source}
                  onClick={() => promoteToNew(t.target_class, t.seed_claims)}
                  disabled={busy}
                >
                  {t.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Editor for entity-valued claims: unlink to text, or replace the linked entity.
function EntityClaimEditor({ claim, objectLabel, onDone, onCancel }: {
  claim: Claim
  objectLabel: string
  onDone: () => void
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [search, setSearch] = useState(objectLabel)
  const [results, setResults] = useState<Entity[]>([])
  const ontology = useOntology()
  const shape = getPropertyShape(ontology, claim.property)
  const typeFilter = shape?.class_range as EntityType | null | undefined

  useEffect(() => {
    if (!replacing) return
    const q = search.trim()
    if (!q) { setResults([]); return }
    const t = setTimeout(() => api.entities.list({ q, ...(typeFilter ? { type: typeFilter } : {}) }).then(setResults), 200)
    return () => clearTimeout(t)
  }, [search, replacing, typeFilter])

  async function unlink() {
    setBusy(true)
    try {
      // Convert back to a string-valued claim using the entity's display label.
      await api.claims.update(claim.id, { value: objectLabel, object_entity_id: null })
      onDone()
    } finally { setBusy(false) }
  }

  async function replaceWith(e: Entity) {
    setBusy(true)
    try {
      await api.claims.update(claim.id, { object_entity_id: e.id, value: null })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>
        Linked entity: <strong style={{ color: '#0f172a' }}>{objectLabel}</strong>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={unlink} disabled={busy}>
          {busy ? '…' : '⤵ Unlink (back to text)'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setReplacing(r => !r)} disabled={busy}>
          {replacing ? '× cancel replace' : '↻ Replace entity'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {replacing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, borderLeft: '2px solid var(--content-border)' }}>
          <input
            className="input"
            style={{ fontSize: 12 }}
            placeholder="search entity…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            disabled={busy}
          />
          {results.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
              {results.slice(0, 5).map(e => (
                <div
                  key={e.id}
                  className="entity-option"
                  onClick={() => !busy && replaceWith(e)}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  <div>
                    <div className="entity-option-label">{e.primary_label}</div>
                    <div className="entity-option-meta">{e.types.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SubjectPromoter({ claim, onDone, onCancel }: { claim: Claim; onDone: () => void; onCancel: () => void }) {
  const [search, setSearch] = useState(claim.subject_label ?? '')
  const [results, setResults] = useState<Entity[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = search.trim()
    if (!q) { setResults([]); return }
    const t = setTimeout(() => api.entities.list({ q }).then(setResults), 200)
    return () => clearTimeout(t)
  }, [search])

  async function promote(e: Entity) {
    setBusy(true)
    try {
      await api.claims.update(claim.id, { subject_entity_id: e.id, subject_label: null })
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4, paddingLeft: 8, borderLeft: '2px solid var(--content-border)', fontSize: 11 }}>
      <input
        className="input"
        style={{ fontSize: 11, padding: '2px 5px' }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search entity…"
        disabled={busy}
        autoFocus
      />
      {results.length > 0 && (
        <div style={{ maxHeight: 100, overflowY: 'auto', border: '1px solid var(--content-border)', borderRadius: 4 }}>
          {results.slice(0, 5).map(e => (
            <div
              key={e.id}
              className="entity-option"
              onClick={() => !busy && promote(e)}
              style={{ cursor: busy ? 'wait' : 'pointer', fontSize: 11 }}
            >
              <div className="entity-option-label">{e.primary_label}</div>
              <div className="entity-option-meta">{e.types.join(', ')}</div>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', padding: '1px 4px', fontSize: 10 }} onClick={onCancel}>cancel</button>
    </div>
  )
}
