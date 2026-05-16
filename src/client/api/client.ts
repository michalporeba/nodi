import type {
  Source, Entity, EntityDetail, Label, ExternalID, Mention, Claim,
  Match, SourceLink, WikidataCandidate, CandidateLink,
  EntityType, SourceStatus,
} from './types'

const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const get = <T>(path: string) => req<T>('GET', path)
const post = <T>(path: string, body: unknown) => req<T>('POST', path, body)
const patch = <T>(path: string, body: unknown) => req<T>('PATCH', path, body)
const del = <T>(path: string) => req<T>('DELETE', path)

// ─── Sources ─────────────────────────────────────────────────────────────────

export const api = {
  sources: {
    list: (filters?: { status?: SourceStatus; type?: string }) => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.type) params.set('type', filters.type)
      const qs = params.toString()
      return get<Source[]>(`/sources${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => get<Source>(`/sources/${id}`),
    fetch: (url: string) => post<Source>('/sources/fetch', { url }),
    update: (id: number, data: Partial<Pick<Source, 'status' | 'title' | 'subject_entity_id' | 'subject_confirmed' | 'subject_description'>>) =>
      patch<Source>(`/sources/${id}`, data),
    matches: (id: number) => get<Match[]>(`/sources/${id}/matches`),
    links: (id: number) => get<SourceLink[]>(`/sources/${id}/links`),
    queueLinks: (id: number, urls: string[]) => post<{ queued: number }>(`/sources/${id}/links/queue`, { urls }),
    confirmAll: (id: number) => post<{ confirmed: number; skipped_ambiguous: unknown[] }>(`/sources/${id}/mentions/confirm-all`, {}),
    candidates: () => get<CandidateLink[]>('/sources/candidates'),
  },

  entities: {
    list: (filters?: { type?: EntityType; q?: string; unreconciled?: boolean }) => {
      const params = new URLSearchParams()
      if (filters?.type) params.set('type', filters.type)
      if (filters?.q) params.set('q', filters.q)
      if (filters?.unreconciled) params.set('unreconciled', 'true')
      const qs = params.toString()
      return get<Entity[]>(`/entities${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => get<EntityDetail>(`/entities/${id}`),
    create: (data: { type: EntityType; primary_label: string; language?: string }) =>
      post<Entity>('/entities', data),
    update: (id: number, data: { type?: EntityType }) => patch<EntityDetail>(`/entities/${id}`, data),
    delete: (id: number) => del<{ ok: boolean }>(`/entities/${id}`),
  },

  labels: {
    add: (entityId: number, data: { value: string; language?: string; is_primary?: boolean; is_alias?: boolean }) =>
      post<Label>(`/entities/${entityId}/labels`, data),
    delete: (id: number) => del<{ ok: boolean }>(`/labels/${id}`),
  },

  externalIds: {
    list: (entityId: number) => get<ExternalID[]>(`/entities/${entityId}/external-ids`),
    add: (entityId: number, data: { system: string; value: string; url?: string; confirmed?: boolean }) =>
      post<ExternalID>(`/entities/${entityId}/external-ids`, data),
    update: (id: number, data: { confirmed?: boolean; url?: string }) =>
      patch<ExternalID>(`/external-ids/${id}`, data),
    delete: (id: number) => del<{ ok: boolean }>(`/external-ids/${id}`),
  },

  mentions: {
    create: (data: { entity_id: number; source_id: number; surface_form: string }) =>
      post<Mention>('/mentions', data),
    delete: (id: number) => del<{ ok: boolean }>(`/mentions/${id}`),
  },

  claims: {
    create: (data: {
      subject_entity_id: number
      property: string
      value?: string
      object_entity_id?: number
      mention_id?: number
      source_id?: number
    }) => post<Claim>('/claims', data),
    delete: (id: number) => del<{ ok: boolean }>(`/claims/${id}`),
  },

  reconcile: {
    search: (entityId?: number, q?: string, type?: string) => {
      const params = new URLSearchParams()
      if (entityId) params.set('entity_id', String(entityId))
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      return get<WikidataCandidate[]>(`/reconcile/wikidata?${params}`)
    },
    confirm: (data: { entity_id: number; qid: string; wikipedia_en?: string | null; wikipedia_cy?: string | null }) =>
      post<EntityDetail>('/reconcile/wikidata/confirm', data),
  },

  export: {
    turtleUrl: (entityIds?: number[]) => {
      const params = entityIds?.length ? `?entity_ids=${entityIds.join(',')}` : ''
      return `/api/export/turtle${params}`
    },
    csvUrl: () => '/api/export/csv',
  },
}
