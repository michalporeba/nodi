import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../api/client'
import type { EntityType } from '../api/types'
import { getCuratedProperties, useOntology, type PropertyShape } from '../data/ontology'

interface Props {
  value: string
  onChange: (v: string) => void
  subjectType?: EntityType
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  onEnter?: () => void
  style?: React.CSSProperties
}

type Suggestion = {
  key: string
  source: 'curated' | 'used'
  def?: PropertyShape
  count?: number
}

export function PropertyPicker({
  value, onChange, subjectType, placeholder, autoFocus, disabled, onEnter, style,
}: Props) {
  const [used, setUsed] = useState<Array<{ property: string; count: number }>>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const ontology = useOntology()

  useEffect(() => {
    api.properties.used(subjectType).then(setUsed).catch(() => setUsed([]))
  }, [subjectType])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase()
    const out = new Map<string, Suggestion>()

    for (const p of getCuratedProperties(ontology, subjectType)) {
      if (!q || p.key.toLowerCase().includes(q)) {
        out.set(p.key, { key: p.key, source: 'curated', def: p })
      }
    }
    for (const u of used) {
      if (!out.has(u.property) && (!q || u.property.toLowerCase().includes(q))) {
        out.set(u.property, { key: u.property, source: 'used', count: u.count })
      }
    }

    return [...out.values()].slice(0, 12)
  }, [value, used, subjectType, ontology])

  const exactMatch = suggestions.some(s => s.key === value.trim())
  const showCustom = value.trim().length > 0 && !exactMatch

  function pick(key: string) {
    onChange(key)
    setOpen(false)
    setActiveIdx(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'Enter') onEnter?.()
      return
    }
    const total = suggestions.length + (showCustom ? 1 : 0)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % Math.max(total, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + total) % Math.max(total, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx < suggestions.length) {
        pick(suggestions[activeIdx].key)
      } else if (showCustom) {
        pick(value.trim())
      }
      onEnter?.()
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, ...style }}>
      <input
        className="input"
        style={{ fontSize: 12, padding: '3px 6px', width: '100%', boxSizing: 'border-box' }}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'property'}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      {open && (suggestions.length > 0 || showCustom) && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            background: 'var(--panel-bg, #fff)',
            border: '1px solid var(--content-border)',
            borderRadius: 4,
            zIndex: 1100,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s.key}
              onMouseDown={e => { e.preventDefault(); pick(s.key) }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
                background: i === activeIdx ? 'rgba(99,102,241,0.10)' : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontFamily: 'monospace' }}>{s.key}</span>
              <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', gap: 6 }}>
                {s.def?.value_type && <span>{s.def.value_type}</span>}
                {s.def?.pid && <span>{s.def.pid}</span>}
                {s.source === 'used' && <span>used ×{s.count}</span>}
              </span>
            </div>
          ))}
          {showCustom && (
            <div
              onMouseDown={e => { e.preventDefault(); pick(value.trim()) }}
              onMouseEnter={() => setActiveIdx(suggestions.length)}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
                background: activeIdx === suggestions.length ? 'rgba(99,102,241,0.10)' : undefined,
                borderTop: suggestions.length > 0 ? '1px solid var(--content-border)' : undefined,
                color: '#64748b',
              }}
            >
              + Use custom: <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{value.trim()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
