import type { LabelForMatching } from '../db/queries'
import { getAllLabelsForMatching, getConfirmedMentionsBySource } from '../db/queries'

export type MatchStatus = 'confirmed' | 'suggested' | 'ambiguous'

export interface Match {
  label_value: string
  surface_form: string
  entity_ids: number[]
  confirmed_entity_id: number | null
  status: MatchStatus
  positions: Array<{ start: number; end: number }>
}

function extractPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isWordBoundary(text: string, start: number, end: number): boolean {
  const beforeOk = start === 0 || /\W/.test(text[start - 1])
  const afterOk = end >= text.length || /\W/.test(text[end])
  return beforeOk && afterOk
}

interface RawMatch {
  labelLower: string
  originalLabel: string
  start: number
  end: number
  entityIds: number[]
}

export async function runMatchingEngine(sourceId: number, content: string): Promise<Match[]> {
  const labels = getAllLabelsForMatching()
  const confirmedMentions = getConfirmedMentionsBySource(sourceId)

  const confirmedEntityIds = new Set(confirmedMentions.map(m => m.entity_id))

  // Build index: lowercase label → entity_ids[]
  const labelIndex = new Map<string, { original: string; entityIds: number[] }>()
  for (const label of labels) {
    const lower = label.value.toLowerCase()
    const existing = labelIndex.get(lower)
    if (existing) {
      if (!existing.entityIds.includes(label.entity_id)) {
        existing.entityIds.push(label.entity_id)
      }
    } else {
      labelIndex.set(lower, { original: label.value, entityIds: [label.entity_id] })
    }
  }

  const plainText = extractPlainText(content)
  const lowerText = plainText.toLowerCase()

  // Find all raw matches
  const rawMatches: RawMatch[] = []
  for (const [labelLower, { original, entityIds }] of labelIndex) {
    if (labelLower.length < 2) continue // skip very short labels
    let searchFrom = 0
    while (searchFrom < lowerText.length) {
      const pos = lowerText.indexOf(labelLower, searchFrom)
      if (pos === -1) break
      const end = pos + labelLower.length
      if (isWordBoundary(lowerText, pos, end)) {
        rawMatches.push({ labelLower, originalLabel: original, start: pos, end, entityIds })
      }
      searchFrom = pos + 1
    }
  }

  // Sort by length descending, then start position, to prefer longer matches
  rawMatches.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)

  // Remove positions covered by longer matches
  const keptMatches: RawMatch[] = []
  for (const m of rawMatches) {
    const covered = keptMatches.some(k => k.start <= m.start && k.end >= m.end)
    if (!covered) keptMatches.push(m)
  }

  // Group by (labelLower, entity_ids key)
  const grouped = new Map<string, { match: RawMatch; positions: Array<{ start: number; end: number }> }>()
  for (const m of keptMatches) {
    const key = `${m.labelLower}:${m.entityIds.sort().join(',')}`
    const existing = grouped.get(key)
    if (existing) {
      existing.positions.push({ start: m.start, end: m.end })
    } else {
      grouped.set(key, { match: m, positions: [{ start: m.start, end: m.end }] })
    }
  }

  // Resolve status for each group
  const results: Match[] = []
  for (const { match, positions } of grouped.values()) {
    const { originalLabel, entityIds } = match

    let status: MatchStatus
    let confirmedEntityId: number | null = null

    if (entityIds.length > 1) {
      status = 'ambiguous'
    } else {
      const entityId = entityIds[0]
      if (confirmedEntityIds.has(entityId)) {
        status = 'confirmed'
        confirmedEntityId = entityId
      } else {
        status = 'suggested'
      }
    }

    // Surface form: the actual text at the first position
    const firstPos = positions[0]
    const surfaceForm = plainText.slice(firstPos.start, firstPos.end)

    results.push({
      label_value: originalLabel,
      surface_form: surfaceForm,
      entity_ids: entityIds,
      confirmed_entity_id: confirmedEntityId,
      status,
      positions,
    })
  }

  return results
}
