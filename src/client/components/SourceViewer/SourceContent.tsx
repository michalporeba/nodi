import { useEffect, useRef, useCallback } from 'react'
import type { Match } from '../../api/types'

interface Props {
  html: string
  matches: Match[]
  onMatchClick: (match: Match, x: number, y: number) => void
  onTextSelect: (text: string, x: number, y: number) => void
  onLinkClick: (url: string) => void
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shouldSkipNode(node: Text): boolean {
  let el: Element | null = node.parentElement
  while (el) {
    const tag = el.tagName?.toLowerCase()
    if (tag === 'mark' || tag === 'script' || tag === 'style') return true
    el = el.parentElement
  }
  return false
}

function highlightText(container: HTMLElement, surfaceForm: string, className: string, dataAttrs: Record<string, string>) {
  const regex = new RegExp(`\\b${escapeRegex(surfaceForm)}\\b`, 'gi')
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodesToProcess: Array<{ node: Text; matches: RegExpExecArray[] }> = []

  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (shouldSkipNode(node)) continue
    const text = node.textContent ?? ''
    const found: RegExpExecArray[] = []
    regex.lastIndex = 0
    let m
    while ((m = regex.exec(text)) !== null) found.push(m)
    if (found.length > 0) nodesToProcess.push({ node, matches: found })
  }

  // Process each text node (in document order, which means forward — we splice in reverse per node)
  for (const { node, matches } of nodesToProcess) {
    const text = node.textContent ?? ''
    const frag = document.createDocumentFragment()
    let lastIndex = 0

    for (const m of matches) {
      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)))
      }
      const mark = document.createElement('mark')
      mark.className = className
      mark.textContent = m[0]
      for (const [k, v] of Object.entries(dataAttrs)) mark.dataset[k] = v
      frag.appendChild(mark)
      lastIndex = m.index + m[0].length
    }

    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)))
    node.parentNode!.replaceChild(frag, node)
  }
}

export function SourceContent({ html, matches, onMatchClick, onTextSelect, onLinkClick }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Inject highlights after rendering HTML
  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Strip scripts, set sanitised HTML
    const sanitised = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')

    el.innerHTML = sanitised

    // Process matches longest-first to avoid nested highlighting
    const sorted = [...matches].sort((a, b) => b.surface_form.length - a.surface_form.length)

    for (const match of sorted) {
      const className = `highlight-${match.status}`
      highlightText(el, match.surface_form, className, {
        entityIds: match.entity_ids.join(','),
        status: match.status,
        labelValue: match.label_value,
        confirmedEntityId: match.confirmed_entity_id != null ? String(match.confirmed_entity_id) : '',
        surfaceForm: match.surface_form,
      })
    }

    // Intercept all links
    const handleLinkClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a')
      if (!a) return
      e.preventDefault()
      const href = a.getAttribute('href')
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        onLinkClick(href)
      }
    }
    el.addEventListener('click', handleLinkClick)
    return () => el.removeEventListener('click', handleLinkClick)
  }, [html, matches, onLinkClick])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const mark = (e.target as Element).closest('mark') as HTMLElement | null
    if (!mark) return

    const status = mark.dataset.status as string
    if (!['confirmed', 'suggested', 'ambiguous'].includes(status)) return

    const entityIds = (mark.dataset.entityIds ?? '').split(',').filter(Boolean).map(Number)
    const confirmedEntityId = mark.dataset.confirmedEntityId ? Number(mark.dataset.confirmedEntityId) : null
    const surfaceForm = mark.dataset.surfaceForm ?? mark.textContent ?? ''
    const labelValue = mark.dataset.labelValue ?? ''

    const match: Match = {
      label_value: labelValue,
      surface_form: surfaceForm,
      entity_ids: entityIds,
      confirmed_entity_id: confirmedEntityId,
      status: status as Match['status'],
      positions: [],
    }

    onMatchClick(match, e.clientX, e.clientY)
  }, [onMatchClick])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const text = selection.toString().trim()
    if (!text || text.length < 2) return

    // Don't activate if clicking on an existing highlight
    if ((e.target as Element).closest('mark')) return

    onTextSelect(text, e.clientX, e.clientY)
  }, [onTextSelect])

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onMouseUp={handleMouseUp}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px 32px',
        lineHeight: 1.7,
        fontSize: 14,
        fontFamily: 'Georgia, "Times New Roman", serif',
        maxWidth: '100%',
        wordBreak: 'break-word',
      }}
    />
  )
}
