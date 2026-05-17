import { useEffect, useRef, useCallback } from 'react'
import type { Match } from '../../api/types'

interface Props {
  html: string
  matches: Match[]
  onMatchClick: (match: Match, x: number, y: number) => void
  onTextSelect: (text: string, x: number, y: number, linkedUrl?: string) => void
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
  // Match the server engine's boundary semantics: outer chars must be non-word (or string edges).
  // Plain \b fails when the surface form ends/starts with a non-word char (e.g. "Owen)").
  const regex = new RegExp(`(?<=^|\\W)${escapeRegex(surfaceForm)}(?=\\W|$)`, 'gi')
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

// Unicode-aware word character (handles é, ñ, accented Latin, etc.)
const WORD_CHAR = /[\p{L}\p{N}_]/u

function getWordRangeAt(x: number, y: number, root: HTMLElement): Range | null {
  let caretRange: Range | null = null

  const docAny = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  if (typeof docAny.caretPositionFromPoint === 'function') {
    const pos = docAny.caretPositionFromPoint(x, y)
    if (pos) {
      caretRange = document.createRange()
      caretRange.setStart(pos.offsetNode, pos.offset)
      caretRange.collapse(true)
    }
  } else if (typeof docAny.caretRangeFromPoint === 'function') {
    caretRange = docAny.caretRangeFromPoint(x, y)
  }

  if (!caretRange || !root.contains(caretRange.startContainer)) return null
  if (caretRange.startContainer.nodeType !== Node.TEXT_NODE) return null

  const textNode = caretRange.startContainer as Text
  const offset = caretRange.startOffset
  const text = textNode.textContent ?? ''

  let start = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  let end = offset
  while (end < text.length && WORD_CHAR.test(text[end])) end++

  if (start === end) return null

  const range = document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  return range
}

function mergeRanges(a: Range, b: Range): Range {
  const result = document.createRange()
  if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
    result.setStart(a.startContainer, a.startOffset)
  } else {
    result.setStart(b.startContainer, b.startOffset)
  }
  if (a.compareBoundaryPoints(Range.END_TO_END, b) >= 0) {
    result.setEnd(a.endContainer, a.endOffset)
  } else {
    result.setEnd(b.endContainer, b.endOffset)
  }
  return result
}

// Trim leading/trailing whitespace from a Range in place (per-text-node).
function trimRange(range: Range): void {
  while (range.startContainer.nodeType === Node.TEXT_NODE) {
    const t = range.startContainer.textContent ?? ''
    if (range.startOffset < t.length && /\s/.test(t[range.startOffset])) {
      range.setStart(range.startContainer, range.startOffset + 1)
    } else break
  }
  while (range.endContainer.nodeType === Node.TEXT_NODE) {
    const t = range.endContainer.textContent ?? ''
    if (range.endOffset > 0 && /\s/.test(t[range.endOffset - 1])) {
      range.setEnd(range.endContainer, range.endOffset - 1)
    } else break
  }
}

// If a range boundary lands inside a word, snap it outward to the word edge.
// Boundaries already on non-word characters are left alone (no extension across
// whitespace or punctuation). Call after trimRange so trailing whitespace
// doesn't pull the snap into the next word.
function expandRangeToWords(range: Range): void {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const t = range.startContainer.textContent ?? ''
    let s = range.startOffset
    if (s < t.length && WORD_CHAR.test(t[s])) {
      while (s > 0 && WORD_CHAR.test(t[s - 1])) s--
      range.setStart(range.startContainer, s)
    }
  }
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const t = range.endContainer.textContent ?? ''
    let e = range.endOffset
    if (e > 0 && WORD_CHAR.test(t[e - 1])) {
      while (e < t.length && WORD_CHAR.test(t[e])) e++
      range.setEnd(range.endContainer, e)
    }
  }
}

function setSelectionRange(range: Range): void {
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}

export function SourceContent({ html, matches, onMatchClick, onTextSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const anchorRangeRef = useRef<Range | null>(null)
  // Tracks whether the most recent mousedown moved (drag) versus a click in place.
  const dragMovedRef = useRef(false)
  const downPosRef = useRef<{ x: number; y: number } | null>(null)

  // Inject highlights after rendering HTML
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prevScroll = el.scrollTop

    const sanitised = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')

    el.innerHTML = sanitised

    const sorted = [...matches].sort((a, b) => b.surface_form.length - a.surface_form.length)

    for (const match of sorted) {
      const className = `highlight-${match.status}`
      highlightText(el, match.surface_form, className, {
        entityIds: match.entity_ids.join(','),
        status: match.status,
        labelValue: match.label_value,
        confirmedEntityIds: match.confirmed_entity_ids.join(','),
        surfaceForm: match.surface_form,
      })
    }

    el.scrollTop = prevScroll
  }, [html, matches])

  // Block middle-click and modifier-click navigation on links — React's onClick
  // doesn't fire for aux-button clicks, so we attach this natively.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const blockAux = (e: MouseEvent) => {
      if ((e.target as Element).closest('a')) e.preventDefault()
    }
    el.addEventListener('auxclick', blockAux)
    return () => el.removeEventListener('auxclick', blockAux)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    downPosRef.current = { x: e.clientX, y: e.clientY }
    dragMovedRef.current = false
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!downPosRef.current) return
    const dx = Math.abs(e.clientX - downPosRef.current.x)
    const dy = Math.abs(e.clientY - downPosRef.current.y)
    if (dx > 3 || dy > 3) dragMovedRef.current = true
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element

    // Existing highlight clicks are handled by handleClick.
    const mark = target.closest('mark') as HTMLElement | null
    if (mark) return

    // Anchor link clicks: select the link's full text, open popover with URL.
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor && ref.current?.contains(anchor)) {
      e.preventDefault()
      const href = anchor.getAttribute('href') ?? ''
      const isExternal = href.startsWith('http://') || href.startsWith('https://')
      const linkText = (anchor.textContent ?? '').trim()
      if (!linkText) return
      const linkRange = document.createRange()
      linkRange.selectNodeContents(anchor)
      trimRange(linkRange)
      setSelectionRange(linkRange)
      anchorRangeRef.current = linkRange.cloneRange()
      onTextSelect(linkText, e.clientX, e.clientY, isExternal ? href : undefined)
      return
    }

    const selection = window.getSelection()
    const root = ref.current
    if (!root) return

    // Drag selection (mouseup with a non-collapsed selection that grew via dragging)
    if (selection && !selection.isCollapsed && dragMovedRef.current) {
      const range = selection.getRangeAt(0)
      trimRange(range)
      expandRangeToWords(range)
      setSelectionRange(range)
      anchorRangeRef.current = range.cloneRange()
      const text = range.toString().trim()
      if (text.length < 2) return
      onTextSelect(text, e.clientX, e.clientY)
      return
    }

    // Shift+click → extend from anchor to clicked word
    if (e.shiftKey && anchorRangeRef.current) {
      const wordRange = getWordRangeAt(e.clientX, e.clientY, root)
      if (!wordRange) return
      const extended = mergeRanges(anchorRangeRef.current, wordRange)
      setSelectionRange(extended)
      const text = extended.toString().trim()
      if (text.length < 2) return
      onTextSelect(text, e.clientX, e.clientY)
      return
    }

    // Plain click → select word under cursor
    const wordRange = getWordRangeAt(e.clientX, e.clientY, root)
    if (!wordRange) return
    setSelectionRange(wordRange)
    anchorRangeRef.current = wordRange.cloneRange()
    const text = wordRange.toString()
    if (text.length < 2) return
    onTextSelect(text, e.clientX, e.clientY)
  }, [onTextSelect])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element
    // Block navigation: link clicks open the popover instead.
    if (target.closest('a')) e.preventDefault()

    const mark = target.closest('mark') as HTMLElement | null
    if (!mark) return

    const status = mark.dataset.status as string
    if (!['confirmed', 'suggested', 'ambiguous'].includes(status)) return

    const entityIds = (mark.dataset.entityIds ?? '').split(',').filter(Boolean).map(Number)
    const confirmedEntityIds = (mark.dataset.confirmedEntityIds ?? '').split(',').filter(Boolean).map(Number)
    const surfaceForm = mark.dataset.surfaceForm ?? mark.textContent ?? ''
    const labelValue = mark.dataset.labelValue ?? ''

    const match: Match = {
      label_value: labelValue,
      surface_form: surfaceForm,
      entity_ids: entityIds,
      confirmed_entity_ids: confirmedEntityIds,
      status: status as Match['status'],
      positions: [],
    }

    onMatchClick(match, e.clientX, e.clientY)
  }, [onMatchClick])

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
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
