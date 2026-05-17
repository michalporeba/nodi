// Mirror of server-side types, shaped for API responses

export type SourceStatus = 'queued' | 'active' | 'done' | 'irrelevant'
export type SourceType = 'url' | 'note'
export type EntityType =
  | 'Person' | 'FictionalPerson' | 'Character'
  | 'Film' | 'Series' | 'Episode'
  | 'Organisation' | 'Location' | 'Other'

export const ENTITY_TYPES: EntityType[] = [
  'Person', 'FictionalPerson', 'Character',
  'Film', 'Series', 'Episode',
  'Organisation', 'Location', 'Other',
]

export type SourceOrigin = 'manual' | 'discovery'

export interface Source {
  id: number
  type: SourceType
  url: string | null
  title: string | null
  status: SourceStatus
  origin: SourceOrigin
  fetched_at: string | null
  content?: string
  subject_entity_id: number | null
  subject_confirmed: boolean
  subject_description: string | null
  created_at: string
}

export interface Entity {
  id: number
  type: EntityType
  primary_label: string
  mention_count: number
  claim_count: number
  wikidata_qid: string | null
  wikidata_confirmed: boolean
  created_at: string
}

export interface Label {
  id: number
  entity_id: number
  value: string
  language: string | null
  is_primary: boolean
  is_alias: boolean
}

export interface ExternalID {
  id: number
  entity_id: number
  system: string
  value: string
  url: string | null
  confirmed: boolean
}

export interface Mention {
  id: number
  entity_id: number
  source_id: number
  surface_form: string
  confirmed: boolean
  confirmed_at: string | null
}

export interface MentionWithSource extends Mention {
  source_title: string | null
  source_url: string | null
  source_status: SourceStatus
}

export interface Claim {
  id: number
  subject_entity_id: number
  property: string
  value: string | null
  object_entity_id: number | null
  object_label: string | null
  mention_id: number | null
  source_id: number | null
  source_title: string | null
  created_at: string
}

export interface EntityDetail extends Entity {
  labels: Label[]
  external_ids: ExternalID[]
  claims: Claim[]
  mentions: MentionWithSource[]
}

export interface SourceLink {
  id: number
  from_source_id: number
  url: string
  title: string | null
  already_in_queue: boolean
  already_irrelevant: boolean
}

export type MatchStatus = 'confirmed' | 'suggested' | 'ambiguous'

export interface Match {
  label_value: string
  surface_form: string
  entity_ids: number[]
  confirmed_entity_id: number | null
  status: MatchStatus
  positions: Array<{ start: number; end: number }>
}

export interface WikidataCandidate {
  qid: string
  label: string
  description: string | null
  url: string
  wikipedia_en: string | null
  wikipedia_cy: string | null
}

export interface CandidateLink {
  url: string
  title: string | null
  frequency: number
}
